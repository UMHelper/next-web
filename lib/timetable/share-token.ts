const TOKEN_BYTES = 32;

export const createShareToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Buffer.from(bytes).toString("base64url");
};

export const isValidShareToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{40,}$/.test(value);
