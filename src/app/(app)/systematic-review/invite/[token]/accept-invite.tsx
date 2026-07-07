'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MailCheck } from 'lucide-react';
import styles from './accept-invite.module.css';

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; reviewId: string };

export function AcceptInvite({
  token,
  signedInAs,
}: {
  token: string;
  signedInAs: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function accept() {
    setState({ kind: 'working' });
    const res = await fetch('/api/sr/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      reviewId?: string;
      error?: string;
    };
    if (res.ok && body.reviewId) {
      setState({ kind: 'done', reviewId: body.reviewId });
      router.push(`/systematic-review/${body.reviewId}`);
    } else {
      setState({
        kind: 'error',
        message: body.error ?? 'This invitation could not be accepted.',
      });
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden>
          <MailCheck size={20} />
        </span>
        <h1 className={styles.title}>Review invitation</h1>
        <p className={styles.body}>
          You&rsquo;re signed in as <strong>{signedInAs}</strong>. Accept only
          if this is the address the invitation was sent to — invitations are
          bound to a single email.
        </p>

        {state.kind === 'error' ? (
          <div className={styles.error} role="status">
            {state.message}
          </div>
        ) : null}

        {state.kind === 'done' ? (
          <div className={styles.ok} role="status">
            <Check size={15} /> Accepted — taking you to the review&hellip;
          </div>
        ) : (
          <button
            type="button"
            className={styles.inkBtn}
            disabled={state.kind === 'working'}
            onClick={accept}
          >
            {state.kind === 'working' ? 'Accepting…' : 'Accept invitation'}
          </button>
        )}
      </div>
    </div>
  );
}
