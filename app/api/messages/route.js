import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyAndRespond } from "@/lib/llm";

/**
 * POST /api/messages
 * body: { conversationId?: string, userEmail: string, message: string }
 *
 * - Creates a conversation on first message if conversationId is absent.
 * - Stores the customer message.
 * - Runs AI classification + response generation.
 * - Stores the AI message (or fallback message on failure).
 * - If escalation is needed: flips conversation to 'escalated', writes an
 *   escalations row (guarded against duplicates), and fires the n8n webhook.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { conversationId, userEmail, message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "`message` is required" }, { status: 400 });
  }
  if (!userEmail) {
    return NextResponse.json({ error: "`userEmail` is required" }, { status: 400 });
  }

  try {
    // 1. Resolve user (find-or-create — fine for a demo; a real app
    //    would tie this to Supabase Auth instead).
    let { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", userEmail)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!user) {
      const { data: newUser, error: createUserErr } = await supabaseAdmin
        .from("users")
        .insert({ email: userEmail })
        .select("id")
        .single();
      if (createUserErr) throw createUserErr;
      user = newUser;
    }

    // 2. Resolve or create conversation.
    let conversation;
    if (conversationId) {
      const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      conversation = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("conversations")
        .insert({ user_id: user.id, status: "open" })
        .select("*")
        .single();
      if (error) throw error;
      conversation = data;
    }

    // 3. Store the customer's message.
    const { error: customerMsgErr } = await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      sender: "customer",
      content: message,
    });
    if (customerMsgErr) throw customerMsgErr;

    // 4. Run AI classification + response (fails safe internally — see lib/llm.js).
    const result = await classifyAndRespond(message);

    // 5. Store the AI's message.
    const { data: aiMessage, error: aiMsgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        sender: "ai",
        content: result.response,
        classification: result.classification,
        confidence: result.confidence,
        llm_failure_reason: result.failure_reason,
      })
      .select("*")
      .single();
    if (aiMsgErr) throw aiMsgErr;

    // 6. Escalate if needed.
    let escalated = false;
    if (result.needs_escalation) {
      escalated = await handleEscalation({
        conversation,
        message,
        classification: result.classification,
        reason: result.escalation_reason || "Unspecified",
        aiMessageId: aiMessage.id,
      });
    }

    return NextResponse.json({
      conversationId: conversation.id,
      aiMessage: {
        content: result.response,
        classification: result.classification,
        confidence: result.confidence,
      },
      escalated,
    });
  } catch (err) {
    console.error("POST /api/messages failed:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your message." },
      { status: 500 }
    );
  }
}

/**
 * Marks the conversation as escalated and fires the n8n webhook.
 * Guards against duplicate escalation events two ways:
 *  1. Checks conversation.status before doing anything (cheap, fast path).
 *  2. Relies on the DB's partial unique index (conversation_id where
 *     notified = false) to reject a race-condition double-insert.
 * Webhook failures are logged but do NOT fail the customer-facing
 * request — the escalation is already durably recorded in Postgres
 * and can be retried/reconciled later (see README > "what I'd improve").
 */
async function handleEscalation({ conversation, message, classification, reason, aiMessageId }) {
  if (conversation.status === "escalated") {
    // Already escalated — don't create a second event.
    return true;
  }

  const { data: escalation, error: escalationErr } = await supabaseAdmin
    .from("escalations")
    .insert({
      conversation_id: conversation.id,
      message_id: aiMessageId,
      reason,
      classification,
    })
    .select("*")
    .single();

  if (escalationErr) {
    // Unique violation = another concurrent request already escalated
    // this conversation. That's fine, not an error.
    if (escalationErr.code === "23505") {
      return true;
    }
    console.error("Failed to write escalation row:", escalationErr);
    // Still flip the conversation status so a human isn't missed,
    // even though we couldn't record the escalation event cleanly.
  }

  await supabaseAdmin
    .from("conversations")
    .update({ status: "escalated" })
    .eq("id", conversation.id);

  // Fire the n8n webhook. Best-effort: log and move on if it fails.
  const webhookUrl = process.env.N8N_ESCALATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          customer_message: message,
          classification,
          reason,
          escalated_at: new Date().toISOString(),
        }),
      });
      if (res.ok && escalation) {
        await supabaseAdmin
          .from("escalations")
          .update({ notified: true, notified_at: new Date().toISOString() })
          .eq("id", escalation.id);
      } else if (!res.ok) {
        console.error("n8n webhook responded with non-OK status:", res.status);
      }
    } catch (err) {
      console.error("Failed to call n8n webhook:", err.message);
      // Not rethrown — see docstring above.
    }
  } else {
    console.warn("N8N_ESCALATION_WEBHOOK_URL not set — skipping automation call.");
  }

  return true;
}
