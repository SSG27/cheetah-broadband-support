export const supportIntents = [
  "connection_issue",
  "slow_speed",
  "wifi_help",
  "billing",
  "account_support",
  "cancellation_or_complaint",
  "human_escalation",
  "general_support",
] as const;

export type SupportIntent = (typeof supportIntents)[number];

const patterns: Array<[SupportIntent, RegExp]> = [
  [
    "human_escalation",
    /\b(human|agent|person|representative|speak to someone|talk to someone|support team)\b/i,
  ],
  [
    "cancellation_or_complaint",
    /\b(cancel|cancellation|complaint|complain|refund)\b/i,
  ],
  [
    "billing",
    /\b(bill|billing|payment|charge|invoice|direct debit|price|cost)\b/i,
  ],
  ["slow_speed", /\b(slow|speed|buffer(?:ing)?|lag|latency)\b/i],
  [
    "connection_issue",
    /\b(outage|down|offline|no internet|no connection|not working|disconnect(?:ed|ing)?)\b/i,
  ],
  ["wifi_help", /\b(router|wi[ -]?fi|wireless|signal|coverage|password)\b/i],
  [
    "account_support",
    /\b(account|upgrade|contract|change my plan|personal details)\b/i,
  ],
];

export function detectSupportIntent(message: string): SupportIntent {
  return (
    patterns.find(([, pattern]) => pattern.test(message))?.[0] ??
    "general_support"
  );
}

export const intentGuidance: Record<SupportIntent, string> = {
  connection_issue:
    "Troubleshoot connectivity and outages with safe router and service-status checks.",
  slow_speed:
    "Help diagnose speed issues; ask for package speed and a test result when useful.",
  wifi_help:
    "Offer practical Wi-Fi, router placement, coverage, and device troubleshooting.",
  billing:
    "Answer general billing questions; direct account-specific payment or charge issues to secure human support.",
  account_support:
    "Explain general account options and direct account changes or verification to secure human support.",
  cancellation_or_complaint:
    "Acknowledge the request and explain how to reach a support specialist.",
  human_escalation:
    "Acknowledge the request and provide the secure route to a human support specialist.",
  general_support:
    "Clarify the issue and offer help with broadband, Wi-Fi, billing, or account support.",
};
