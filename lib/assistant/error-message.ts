const QUOTA = "You've used your AI allowance for now. Please try again later.";
const EXECUTION_LIMIT =
  "This request needed too many steps. Try a simpler question or start a new chat.";
const PROVIDER_DOWN = "The AI service is temporarily unavailable. Please try again later.";
const PROVIDER_AUTH = "The AI service is not configured correctly. Please contact support.";
const PROVIDER_BUSY = "The AI service is busy. Please try again shortly.";
const PROVIDER_TIMEOUT = "The AI service took too long. Please try again.";
const UNAVAILABLE = "The assistant is temporarily unavailable. Please try again.";

/**
 * Fixed, nontechnical copy for students. Provider text, balances, and URLs
 * from the upstream error are never echoed back.
 */
export function describeAssistantError(message: string): string {
  if (/quota_exhausted|quota_denied/.test(message)) return QUOTA;
  if (/execution_limit|step.?limit/.test(message)) return EXECUTION_LIMIT;
  if (/\b402\b|insufficient.?balance|provider_balance/.test(message)) return PROVIDER_DOWN;
  if (/provider_auth|invalid_api_key|APICallError[\s\S]*\b(401|403)\b/i.test(message)) {
    return PROVIDER_AUTH;
  }
  if (/provider_rate_limit|APICallError[\s\S]*\b429\b/i.test(message)) return PROVIDER_BUSY;
  if (/provider_timeout|TimeoutError|\bETIMEDOUT\b/.test(message)) return PROVIDER_TIMEOUT;
  if (/temporarily_unavailable|\b503\b/.test(message)) return UNAVAILABLE;
  if (/\b429\b|rate_limited/.test(message)) return "Too many requests. Please try again later.";
  if (/\b409\b|conversation_limit/.test(message)) {
    return "This conversation has reached its limit. Start a new chat to continue.";
  }
  if (/\b413\b|payload_too_large/.test(message)) {
    return "This message is too large for the assistant. Start a new chat or ask a shorter question.";
  }
  if (/\b401\b|unauthorized/.test(message)) return "Please sign in to use the assistant.";
  if (/\b403\b|forbidden/.test(message)) return "Assistant access required.";
  return UNAVAILABLE;
}
