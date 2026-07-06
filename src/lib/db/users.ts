import { getDb } from './client';
import { users, type User } from './schema';

type WorkOsUserProfile = {
  workosUserId: string;
  email: string;
  name: string | null;
};

export async function upsertUserFromWorkOs(
  profile: WorkOsUserProfile,
): Promise<User> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      workosUserId: profile.workosUserId,
      email: profile.email,
      name: profile.name,
    })
    .onConflictDoUpdate({
      target: users.workosUserId,
      set: {
        email: profile.email,
        name: profile.name,
        updatedAt: new Date(),
      },
    })
    .returning();

  return user;
}
