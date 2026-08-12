import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/conversations/:id — returns the conversation + its messages,
// ordered chronologically. Used by the UI to load/refresh a thread.
export async function GET(req, { params }) {
  const { id } = params;

  try {
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", id)
      .single();
    if (convErr) throw convErr;

    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (msgErr) throw msgErr;

    return NextResponse.json({ conversation, messages });
  } catch (err) {
    console.error("GET /api/conversations/[id] failed:", err);
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
}
