export function describeAssistantError(message: string): string {
  if (/\b429\b|rate_limited/.test(message)) return "Too many requests. Please try again later.";
  if (/\b409\b|conversation_limit/.test(message)) {
    return "This conversation has reached its limit. Start a new chat to continue.";
  }
  if (/\b40[13]\b/.test(message)) return "Please sign in to use the assistant.";
  return "The assistant is temporarily unavailable. Please try again.";
}
