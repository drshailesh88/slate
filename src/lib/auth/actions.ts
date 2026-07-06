'use server';

import { signOut } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { isDevAuthBypassActive } from './config';

export async function signOutAction(): Promise<void> {
  if (isDevAuthBypassActive()) {
    redirect('/');
  }
  await signOut();
}
