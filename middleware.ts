import { NextResponse, userAgent } from 'next/server';

export function middleware(request: Request) {
  // console.log('middleware')
  const requestHeaders = new Headers(request.headers);

  const url=request.url.split('/');
  const host:any=request.headers.get('host')
  const hostIndex=url.indexOf(host);
  const pathname=url.slice(hostIndex+1).join('/').split('?')[0];

  requestHeaders.set('x-pathname', pathname);

  const ua=userAgent(request)
  requestHeaders.set('x-ua', ua.ua);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    }
  });
}

export const config = {
  matcher: ['/sign-in','/sign-up',],
};