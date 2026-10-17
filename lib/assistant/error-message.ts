export function describeAssistantError(message: string): string {
  if (/\b429\b|rate_limited/.test(message)) return "提问次数已达上限，请稍后再试。";
  if (/\b409\b|conversation_limit/.test(message)) return "本次对话已达上限，请刷新页面开始新会话。";
  if (/\b40[13]\b/.test(message)) return "请先登录试点账号后再使用助手。";
  return "助手暂时不可用，页面其它功能不受影响。";
}
