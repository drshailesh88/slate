import { handleAuth } from '@workos-inc/authkit-nextjs';
import { upsertUserFromWorkOs } from '@/lib/db/users';

export const GET = handleAuth({
  onSuccess: async ({ user }) => {
    if (!process.env.DATABASE_URL) {
      console.warn(
        'DATABASE_URL is not set — skipping JIT user upsert. Add the Neon connection string to .env.local to persist users.',
      );
      return;
    }

    await upsertUserFromWorkOs({
      workosUserId: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    });
  },
});
