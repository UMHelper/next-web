function normalise(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Read the env vars through static property access so Next.js can inline the
// NEXT_PUBLIC_* values into the client bundle.
export function getAdsenseClientId(): string | null {
  return normalise(process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID);
}

export function getAdsenseSlotId(): string | null {
  return normalise(process.env.NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID);
}

export function isAdsenseConfigured(): boolean {
  return getAdsenseClientId() !== null && getAdsenseSlotId() !== null;
}
