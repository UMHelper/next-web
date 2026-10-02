export const AD_RATE = 0.1;

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function isAdSlot(key: string, salt: string, rate: number = AD_RATE): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return fnv1a32(`${salt}:${key}`) % 1000 < Math.round(rate * 1000);
}
