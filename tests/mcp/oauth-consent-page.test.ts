import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The OAuth consent page is deliberately configured rather than merely rendered:
 * Clerk's consent form POSTs to the Frontend API, so the referrer policy is
 * functional, not cosmetic. A regression here silently breaks every OAuth flow,
 * which is why it is asserted from the source.
 */
const CONSENT_PAGE = "app/oauth-consent/[[...index]]/page.tsx";

describe("custom OAuth consent page", () => {
  const source = readFileSync(path.join(process.cwd(), CONSENT_PAGE), "utf8");

  it("renders Clerk's prebuilt OAuthConsent component", () => {
    expect(source).toContain('from "@clerk/nextjs"');
    expect(source).toContain("<OAuthConsent />");
  });

  it("sets the referrer policy Clerk requires for the consent form POST", () => {
    expect(source).toContain('referrer: "strict-origin-when-cross-origin"');
  });

  it("only renders for signed-in users", () => {
    expect(source).toContain("redirectToSignIn()");
  });

  it("stays free of navigation that would leave the authorization flow", () => {
    expect(source).not.toContain("<Link");
    expect(source).not.toContain("SignOutButton");
    expect(source).not.toContain("UserButton");
  });
});
