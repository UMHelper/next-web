import { OAuthConsent } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Authorize application",
  // The consent form posts to Clerk's Frontend API. Without this referrer policy
  // some cross-origin submissions send `Origin: null`, which Clerk rejects.
  referrer: "strict-origin-when-cross-origin",
  ...noIndexMetadata,
};

/**
 * Custom OAuth consent page for the What2Reg MCP server.
 *
 * Clerk sends users here during OAuth flows that require consent, configured via
 * Dashboard → Paths → Component paths → OAuth consent. The Account Portal's own
 * consent step does not complete on this instance: after sign-in it drops the
 * OAuth continuation and lands the user on the site home page, so authorization
 * never reaches the client's `redirect_uri`.
 *
 * Deliberately minimal — no navigation, account menu or sign-out control, any of
 * which could take the user out of the authorization flow. Clerk redirects
 * signed-out users to sign-in before this route in a normal flow; the guard below
 * covers direct visits.
 */
export default async function OAuthConsentPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  return (
    <div className="w-full min-h-screen flex justify-center items-center">
      <OAuthConsent />
    </div>
  );
}
