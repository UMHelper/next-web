export function describeAssistantError(message: string): string {
  if (/\b429\b|rate_limited/.test(message)) return "提問次數已達上限，請稍後再試。";
  if (/\b409\b|conversation_limit/.test(message)) return "本次對話已達上限，請刷新頁面開始新會話。";
  if (/\b40[13]\b/.test(message)) return "請先登入試點帳號後再使用助手。";
  return "助手暫時不可用，頁面其它功能不受影響。";
}
