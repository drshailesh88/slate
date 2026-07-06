import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isSrEnabled } from '@/lib/sr/flag';
import { acceptInvitation } from '@/lib/sr/members/service';
import { isMemberActionError } from '@/lib/sr/members/errors';

// POST /api/sr/invitations/accept  { token }
//
// The invitee (session user) redeems a single-use, email-bound token. The heavy
// lifting — the atomic single-accept gate, email binding, expiry, audit — lives
// in acceptInvitation (src/lib/sr/members/service.ts). This route is the thin
// boundary: flag gate, resolve the session, map typed errors to HTTP status.
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSrEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    token = undefined;
  }
  if (typeof token !== 'string' || token.length === 0) {
    return NextResponse.json(
      { error: 'A token is required.' },
      { status: 400 },
    );
  }

  const acceptingUser = await getSessionUser();

  try {
    const result = await acceptInvitation({ token, acceptingUser });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (isMemberActionError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}
