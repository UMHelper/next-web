export const dynamic = "force-dynamic";

const TOKEN_ENV = "OPENAI_APPS_CHALLENGE_TOKEN";

/**
 * OpenAI plugin domain verification.
 *
 * Returns the exact portal-issued challenge token as plain text. This route is
 * intentionally independent of Clerk, Supabase and the MCP server: it only
 * proves domain ownership and must stay reachable before any OAuth happens.
 */
export function GET() {
  const token = process.env[TOKEN_ENV];

  if (!token || token.trim().length === 0) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(token, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "GET" } });
}

export function POST() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
