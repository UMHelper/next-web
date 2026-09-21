export const MAX_RELAY_BODY_BYTES = 2 * 1024 * 1024;

const TABLE_PATH = /^rest\/v1\/[A-Za-z_][A-Za-z0-9_]*$/;
const RPC_PATH = /^rest\/v1\/rpc\/[A-Za-z_][A-Za-z0-9_]*$/;
const FORWARDED_REQUEST_HEADERS = [
  "prefer",
  "content-type",
  "accept",
  "range",
  "content-profile",
];

export function isAllowedRelayPath(segments: string[]): boolean {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  const joined = segments.join("/");
  if (joined.includes("://") || joined.includes("..") || joined.includes("\\")) return false;
  return TABLE_PATH.test(joined) || RPC_PATH.test(joined);
}

export function buildRelayHeaders(headers: Headers, secretKey: string): Headers {
  const out = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value) out.set(name, value);
  }
  out.set("apikey", secretKey);
  return out;
}
