import { NextResponse, userAgent } from 'next/server'

// Edge middleware for Cloudflare/Wrangler deployments.
// Mirrors header behavior previously implemented in `proxy.ts` but runs on Edge.
export const runtime = 'experimental-edge'

export function middleware(request: Request) {
  const requestHeaders = new Headers(request.headers)

  try {
    const url = new URL(request.url)
    // preserve original pathname for downstream services
    requestHeaders.set('x-pathname', url.pathname)
  } catch (e) {
    // fallback: do nothing if URL parsing fails
  }

  const ua = userAgent(request)
  requestHeaders.set('x-ua', ua.ua ?? '')

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/sign-in', '/sign-up'],
}
