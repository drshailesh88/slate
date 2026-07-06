// TODO(design): render sign-in in-skin per global-auth spec §B — for now we
// hand off to the hosted AuthKit flow.
import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { isDevAuthBypassActive } from '@/lib/auth/config';

export const GET = async () => {
  if (isDevAuthBypassActive()) {
    redirect('/');
  }
  const signInUrl = await getSignInUrl();
  redirect(signInUrl);
};
