import OpenAI from "openai";
import { z } from "zod";
import { knowledgeBaseAsPromptContext } from "./knowledgeBase";


const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
});

export const CLASSIFICATIONS = [
  "general_question",
  "technical_issue",
  "billing",
  "urgent",
];


const LLMOutputSchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number().min(0).max(1),
  response: z.string().min(1),
  needs_escalation: z.boolean(),
  escalation_reason: z.string().nullable(),
});

const SYSTEM_PROMPT = `You are a customer support assistant for a SaaS product.

You will be given a customer message and a small internal knowledge base.

Your job:
1. Classify the message into exactly one of: general_question, technical_issue, billing, urgent.
2. Write a short, helpful response using ONLY the knowledge base below. Do not invent policies, refund amounts, or timelines that aren't in the knowledge base.
3. Decide if this needs a human. Set needs_escalation=true if:
   - The classification is "urgent"
   - The knowledge base doesn't actually cover what's being asked
   - The customer is asking for something an AI shouldn't promise (refunds, account deletion, legal/security concerns)
   - You are not confident your answer is correct or safe to send as-is
4. Set confidence to your genuine confidence (0-1) that your classification AND response are both correct and safe to send to the customer unreviewed.

Knowledge base:
${knowledgeBaseAsPromptContext()}

Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "classification": "general_question" | "technical_issue" | "billing" | "urgent",
  "confidence": number between 0 and 1,
  "response": "string — what to say to the customer",
  "needs_escalation": boolean,
  "escalation_reason": "string explaining why, or null if needs_escalation is false"
}`;

const CONFIDENCE_ESCALATION_THRESHOLD = 0.6;


export async function classifyAndRespond(customerMessage) {
  let raw;
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: customerMessage },
      ],
    });
    raw = completion.choices?.[0]?.message?.content;
  } catch (err) {
   
    console.error("LLM API call failed:", err.message);
    return fallbackResult("llm_api_error", `LLM API call failed: ${err.message}`);
  }

  if (!raw) {
    return fallbackResult("llm_empty_response", "LLM returned an empty response.");
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    console.error("LLM returned invalid JSON:", raw);
    return fallbackResult("invalid_json", "LLM output was not valid JSON.");
  }

  const validation = LLMOutputSchema.safeParse(parsedJson);
  if (!validation.success) {
    console.error("LLM output failed schema validation:", validation.error.flatten());
    return fallbackResult(
      "schema_validation_failed",
      `LLM output didn't match expected schema: ${validation.error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; ")}`
    );
  }

  const result = validation.data;


  const lowConfidence = result.confidence < CONFIDENCE_ESCALATION_THRESHOLD;
  const isUrgent = result.classification === "urgent";
  const needs_escalation = result.needs_escalation || lowConfidence || isUrgent;

  let escalation_reason = result.escalation_reason;
  if (needs_escalation && !escalation_reason) {
    escalation_reason = lowConfidence
      ? `Low model confidence (${result.confidence})`
      : isUrgent
      ? "Classified as urgent"
      : "Model flagged for escalation";
  }

  return {
    ok: true,
    classification: result.classification,
    confidence: result.confidence,
    response: result.response,
    needs_escalation,
    escalation_reason,
    failure_reason: null,
  };
}

function fallbackResult(failureReason, reason) {

  return {
    ok: false,
    classification: "urgent",
    confidence: 0,
    response:
      "Thanks for reaching out. I want to make sure this gets handled correctly, so I'm looping in a member of our support team who will follow up with you shortly.",
    needs_escalation: true,
    escalation_reason: reason,
    failure_reason: failureReason,
  };
}
