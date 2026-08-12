export const KNOWLEDGE_BASE = [
  {
    topic: "password_reset",
    text: "To reset your password, go to Settings > Security > Reset Password. The reset email arrives within 2 minutes and is valid for 30 minutes. If it doesn't arrive, check spam, and confirm the account email is correct — reset emails are only sent to verified addresses.",
  },
  {
    topic: "login_issues",
    text: "If a user can log in but gets logged out repeatedly, it's usually a browser cookie/third-party-cookie block, or clock skew on the device (our session tokens are time-based). Ask the user to try an incognito window as a first diagnostic step.",
  },
  {
    topic: "billing_cycle",
    text: "Subscriptions renew monthly on the day of signup. Invoices are emailed automatically and are also available under Settings > Billing > Invoices. Proration applies when upgrading mid-cycle.",
  },
  {
    topic: "refunds",
    text: "Refunds are available within 14 days of a charge for annual plans, and are handled case-by-case for monthly plans. Refund requests must go through a human agent — the AI assistant should never promise a refund itself.",
  },
  {
    topic: "cancel_subscription",
    text: "Users can cancel anytime under Settings > Billing > Cancel Plan. Access continues until the end of the current billing period; there is no partial-month refund for monthly plans.",
  },
  {
    topic: "api_rate_limits",
    text: "The API allows 100 requests/minute on the free tier and 1000 requests/minute on paid tiers. A 429 response includes a Retry-After header.",
  },
  {
    topic: "data_export",
    text: "Users can export their data as CSV or JSON under Settings > Data > Export. Exports are generated asynchronously and emailed as a download link within ~10 minutes.",
  },
];

export function knowledgeBaseAsPromptContext() {
  return KNOWLEDGE_BASE.map((e) => `[${e.topic}] ${e.text}`).join("\n");
}
