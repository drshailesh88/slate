import { withAuth } from '@workos-inc/authkit-nextjs';
import { isDevAuthBypassActive } from './config';

export type SessionUser = {
  workosUserId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isMock: boolean;
};

const mockUser: SessionUser = {
  workosUserId: 'user_dev_mock',
  email: 'dev@slate.local',
  name: 'Dr. Singh',
  avatarUrl: null,
  isMock: true,
};

export async function getSessionUser(): Promise<SessionUser> {
  if (isDevAuthBypassActive()) {
    return mockUser;
  }

  const { user } = await withAuth({ ensureSignedIn: true });
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return {
    workosUserId: user.id,
    email: user.email,
    name,
    avatarUrl: user.profilePictureUrl ?? null,
    isMock: false,
  };
}
