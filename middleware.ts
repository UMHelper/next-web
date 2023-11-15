import { NextResponse } from 'next/server';

export function middleware(request: Request) {
  const requestHeaders = new Headers(request.headers);

  const url=request.url.split('/');
  const host:any=request.headers.get('host')
  const hostIndex=url.indexOf(host);
  const pathname=url.slice(hostIndex+1).join('/').split('?')[0];

  requestHeaders.set('x-pathname', pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    }
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)',],
};