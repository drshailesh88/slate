export function hasWorkOsCredentials(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_COOKIE_PASSWORD,
  );
}

/**
 * Dev-only bypass so the app shell renders before real WorkOS credentials
 * are provisioned. Never active in production builds.
 */
export function isDevAuthBypassActive(): boolean {
  return process.env.NODE_ENV !== 'production' && !hasWorkOsCredentials();
}
