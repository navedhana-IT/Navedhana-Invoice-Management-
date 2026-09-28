import { NextResponse, type NextRequest } from 'next/server';

/** UX redirect only: real authorization is enforced by NestJS on every API call. */
export function middleware(req: NextRequest) {
  if (req.cookies.has('nv_session')) return NextResponse.next();
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*', '/app/:path*'] };
