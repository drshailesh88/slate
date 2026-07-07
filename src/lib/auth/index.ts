import { getSessionUser } from './session';

/**
 * The engine and the unified route identify the caller by a stable user id.
 * In slate that is the WorkOS user id (the dev-mock id outside production).
 */
export async function getCurrentUserId(): Promise<string> {
  return (await getSessionUser()).workosUserId;
}

export { getSessionUser } from './session';
