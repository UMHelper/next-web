export function describeAssistantError(message: string): string {
  if (/\b429\b|rate_limited/.test(message)) return "Too many requests. Please try again later.";
  if (/\b409\b|conversation_limit/.test(message)) {
    return "This conversation has reached its limit. Start a new chat to continue.";
  }
  if (/\b413\b|payload_too_large/.test(message)) {
    return "This message is too large for the assistant. Start a new chat or ask a shorter question.";
  }
  if (/\b401\b|unauthorized/.test(message)) return "Please sign in to use the assistant.";
  if (/\b403\b|forbidden/.test(message)) return "Assistant access required.";
  return "The assistant is temporarily unavailable. Please try again.";
}
