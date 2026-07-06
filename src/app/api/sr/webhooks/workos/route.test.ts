import { beforeAll, describe, expect, it } from 'vitest';
import { POST } from './route';

// The webhook boundary must reject anything it cannot cryptographically verify
// BEFORE touching the database. WORKOS_API_KEY + WORKOS_WEBHOOK_SECRET are set
// so the code reaches signature verification; a bad signature then 401s.
beforeAll(() => {
  process.env.WORKOS_API_KEY ??= 'sk_test_dummy';
  process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test_dummy';
});

function webhookRequest(headers: Record<string, string>, body = '{}') {
  return new Request('http://localhost/api/sr/webhooks/workos', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/sr/webhooks/workos — signature verification', () => {
  it('returns 401 when the WorkOS-Signature header is missing', async () => {
    const res = await POST(webhookRequest({}));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(
      webhookRequest({ 'workos-signature': 't=1, v1=deadbeef' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature header', async () => {
    const res = await POST(webhookRequest({ 'workos-signature': 'garbage' }));
    expect(res.status).toBe(401);
  });
});
