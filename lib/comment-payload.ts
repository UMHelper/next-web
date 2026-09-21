export function buildReplyPayload(commentId: number | string, content: string) {
  return { replyto: Number(commentId), content };
}

export function buildVotePayload(commentId: number | string, offset: number, emoji?: string) {
  return emoji
    ? { comment: Number(commentId), offset, emoji }
    : { comment: Number(commentId), offset };
}
