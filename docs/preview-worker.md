# Preview worker

`next-web-preview` is a separate Cloudflare Worker that runs the current code against the production Supabase database **read-only**, with no ISR cache and a Clerk development instance. Design: `docs/superpowers/specs/2026-10-19-preview-worker-design.md`.

## What it does and does not do

- Reads production data. Every write is rejected with `PREVIEW_READONLY` (client, admin relay, build).
- No ISR cache. Each request renders fresh. Preview has no R2 bucket and no D1 database.
- Rate limits are in memory, per isolate. Nothing is written to production.
- The assistant is open to every signed-in user (`ASSISTANT_ACCESS_OVERRIDE=everyone`).
- Comments, votes, reports, timetable plans, admin edits, the update pipeline, and tester management all fail by design.

## One-time setup

1. Create `.env.preview.local` (git-ignored) with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_SECRET_KEY=...
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   PREVIEW_MODE=1
   PREVIEW_DB_READONLY=1
   ```
2. Set the runtime secrets (each prompts for the value):
   ```
   npx wrangler secret put AI_API_KEY --env preview
   npx wrangler secret put SUPABASE_SECRET_KEY --env preview
   npx wrangler secret put CLERK_SECRET_KEY --env preview
   npx wrangler secret put PLATFORM_ADMIN_EMAILS --env preview
   ```

## Deploy

Pushes to `dev` deploy automatically through Cloudflare Workers Builds on `next-web-preview`:

- Build command: `npm run build:preview`
- Deploy command: `npx opennextjs-cloudflare deploy --env preview`
- Build variables: the same six values as `.env.preview.local` above.

To deploy from your machine instead:

```
npm run deploy:preview
```

Both paths run `scripts/check-preview-env.sh`, which refuses to build unless the Clerk key starts with `pk_test_` and `PREVIEW_DB_READONLY=1`.

## Smoke test

1. Home page renders and a course page shows production data.
2. Sign in with a Clerk dev user whose email is in `PLATFORM_ADMIN_EMAILS`.
3. Open the assistant and send a message. A DeepSeek reply streams back.
4. Try to post a comment. The request fails with "Preview worker is read-only", and no new row appears in production.

## Teardown

```
npx wrangler delete --env preview
```
