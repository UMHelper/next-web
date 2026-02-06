import { NextResponse, userAgent } from 'next/server';

// Migrated from middleware.ts -> proxy.ts per Next.js 16 migration guide.
// This function replaces the old `middleware` convention. The file and export
// are renamed to `proxy` so Next.js treats this as the new Proxy convention.
// See: https://nextjs.org/docs/messages/middleware-to-proxy
export function proxy(request: Request) {
  const requestHeaders = new Headers(request.headers);

  const url = request.url.split('/');
  const host: any = request.headers.get('host');
  const hostIndex = url.indexOf(host);
  const pathname = url.slice(hostIndex + 1).join('/').split('?')[0];

  requestHeaders.set('x-pathname', pathname);

  const ua = userAgent(request);
  requestHeaders.set('x-ua', ua.ua);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/sign-in', '/sign-up'],
};
