import { authkitProxy } from '@workos-inc/authkit-nextjs';
import { NextResponse } from 'next/server';
import { isDevAuthBypassActive } from '@/lib/auth/config';

const passthrough = () => NextResponse.next();

export default isDevAuthBypassActive()
  ? passthrough
  : authkitProxy({
      middlewareAuth: {
        enabled: true,
        unauthenticatedPaths: ['/login', '/auth/callback'],
      },
    });

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
