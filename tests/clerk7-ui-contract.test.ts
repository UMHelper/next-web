import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Targeted source contract for the Clerk 7 migration. It reads only the files
 * the upgrade touches rather than scanning generated output or node_modules.
 */
const read = (file: string) => readFileSync(file, "utf8");

const CLIENT_FILES = [
  "components/providers/clerk-provider-client.tsx",
  "components/navbar-avatar.tsx",
  "components/mobile-sidebar.tsx",
  "components/review/comment-card.tsx",
];

describe("Clerk 7 migration source contract", () => {
  it("keeps middleware on clerkMiddleware without resource authorization", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toMatch(
      /import\s*\{\s*clerkMiddleware\s*\}\s*from\s*"@clerk\/nextjs\/server"/,
    );
    expect(middleware).toMatch(/export\s+default\s+clerkMiddleware\(/);
    expect(middleware).not.toContain("authMiddleware");
    expect(middleware).not.toContain("auth.protect");
  });

  it("removes the Clerk Core 3 SignedIn / SignedOut components", () => {
    for (const file of CLIENT_FILES) {
      const source = read(file);
      expect(source, `${file} still imports/uses SignedIn`).not.toMatch(/\bSignedIn\b/);
      expect(source, `${file} still imports/uses SignedOut`).not.toMatch(/\bSignedOut\b/);
    }
  });

  it("uses the Clerk 7 redirect prop name at every SignInButton call site", () => {
    for (const file of CLIENT_FILES) {
      const source = read(file);
      expect(source, `${file} still passes the removed redirectUrl prop`).not.toMatch(
        /\bredirectUrl\b/,
      );
      if (!source.includes("<SignInButton")) continue;
      expect(
        source,
        `${file} renders SignInButton without the fallbackRedirectUrl replacement`,
      ).toContain("fallbackRedirectUrl");
    }
  });

  it("drops UserButton afterSignOutUrl and moves it to ClerkProvider", () => {
    const provider = read("components/providers/clerk-provider-client.tsx");
    expect(provider).toMatch(/afterSignOutUrl=["']\/["']/);

    const avatar = read("components/navbar-avatar.tsx");
    expect(avatar).toMatch(/<UserButton(?![^>]*afterSignOutUrl)[^>]*\/>/);
  });

  it("renames the redirect environment variables", () => {
    for (const file of [".env.example", "cloudflare-env.d.ts"]) {
      const source = read(file);
      expect(source, `${file} missing fallback sign-in URL`).toContain(
        "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
      );
      expect(source, `${file} missing fallback sign-up URL`).toContain(
        "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
      );
      expect(source, `${file} still references legacy AFTER_ variables`).not.toContain(
        "NEXT_PUBLIC_CLERK_AFTER_",
      );
    }
  });
});
