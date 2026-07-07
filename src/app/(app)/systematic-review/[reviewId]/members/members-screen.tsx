'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { ReviewRole } from '@/lib/sr/authz/policy';
import {
  ASSIGNABLE_ROLES,
  ROLE_CAPABILITY,
  ROLE_LABELS,
  roleLabel,
} from '@/lib/sr/members/roles';
import type {
  PendingInvitation,
  ReviewTeam,
  TeamMember,
} from '@/lib/sr/members/service';
import {
  activateAiAction,
  addExistingMemberAction,
  changeRoleAction,
  inviteByEmailAction,
  revokeInvitationAction,
  revokeMemberAction,
  validateAiAction,
  type ActionResult,
  type InviteData,
} from './actions';
import styles from './members.module.css';

type Banner = { tone: 'ok' | 'warn'; text: string } | null;

function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  const significant = tokens.filter(
    (t) => !/^(dr|prof|mr|ms|mrs)\.?$/i.test(t),
  );
  // Keep the honorific when stripping would leave fewer than two tokens, so
  // "Dr. Singh" reads "DS" — matching the app shell's avatar.
  const parts = significant.length >= 2 ? significant : tokens;
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function MembersScreen({
  reviewId,
  team,
  canManage,
}: {
  reviewId: string;
  team: ReviewTeam;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [inviteLink, setInviteLink] = useState<InviteData | null>(null);

  function apply<T>(
    promise: Promise<ActionResult<T>>,
    onOk?: (data: T) => void,
    okText?: string,
  ) {
    startTransition(async () => {
      const result = await promise;
      if (result.ok) {
        setBanner(okText ? { tone: 'ok', text: okText } : null);
        onOk?.(result.data);
        router.refresh();
      } else {
        setBanner({ tone: 'warn', text: result.error });
      }
    });
  }

  return (
    <div className={styles.stage}>
      <div className={styles.eyebrow}>Systematic review</div>
      <h1 className={styles.title}>Team</h1>
      <p className={styles.lead}>
        Everyone on this review and their per-review role. Roles are enforced on
        the server for every action —{' '}
        {canManage
          ? 'you are the owner and can manage the team.'
          : 'only the owner can change roles or invite.'}
      </p>

      {banner ? (
        <div
          className={banner.tone === 'warn' ? styles.warn : styles.okBanner}
          role="status"
        >
          {banner.tone === 'warn' ? (
            <AlertTriangle size={15} />
          ) : (
            <Check size={15} />
          )}
          <span>{banner.text}</span>
        </div>
      ) : null}

      <section className={styles.card} aria-label="Members">
        <div className="section-label">Members</div>
        <div className={styles.table}>
          {team.members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              canManage={canManage}
              busy={pending}
              onRole={(role) =>
                apply(changeRoleAction(reviewId, m.userId, role), undefined)
              }
              onRevoke={() =>
                apply(
                  revokeMemberAction(reviewId, m.userId),
                  undefined,
                  `Removed ${m.name}.`,
                )
              }
            />
          ))}
          <AiRow
            ai={team.ai}
            canManage={canManage}
            busy={pending}
            onActivate={() =>
              apply(
                activateAiAction(reviewId),
                undefined,
                'AI reviewer activated.',
              )
            }
            onValidate={() =>
              apply(validateAiAction(reviewId), (d) =>
                setBanner({ tone: 'ok', text: d.message }),
              )
            }
          />
        </div>
      </section>

      {team.invitations.length > 0 ? (
        <section className={styles.card} aria-label="Pending invitations">
          <div className="section-label">Pending invitations</div>
          <div className={styles.table}>
            {team.invitations.map((inv) => (
              <InvitationRow
                key={inv.id}
                invitation={inv}
                canManage={canManage}
                busy={pending}
                onRevoke={() =>
                  apply(
                    revokeInvitationAction(reviewId, inv.id),
                    undefined,
                    `Invitation to ${inv.email} revoked.`,
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {canManage ? (
        <InvitePanel
          busy={pending}
          inviteLink={inviteLink}
          onInvite={(email, role) =>
            apply(inviteByEmailAction(reviewId, email, role), (d) => {
              setInviteLink(d);
              setBanner({
                tone: 'ok',
                text: `Invitation created for ${d.email}. No email was sent — share the link below.`,
              });
            })
          }
          onAddExisting={(email, role) =>
            apply(
              addExistingMemberAction(reviewId, email, role),
              undefined,
              `Added ${email} to the review.`,
            )
          }
        />
      ) : null}
    </div>
  );
}

function RoleBadge({ role }: { role: ReviewRole }) {
  return (
    <span className={styles.roleBadge} title={ROLE_CAPABILITY[role]}>
      {role === 'arbitrator' ? <ShieldCheck size={12} /> : null}
      {roleLabel(role)}
    </span>
  );
}

function RolePicker({
  value,
  disabled,
  onChange,
}: {
  value: ReviewRole;
  disabled: boolean;
  onChange: (role: ReviewRole) => void;
}) {
  return (
    <select
      className={styles.roleSelect}
      value={value}
      disabled={disabled}
      aria-label="Change role"
      onChange={(e) => onChange(e.target.value as ReviewRole)}
    >
      {ASSIGNABLE_ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

function MemberRow({
  member,
  canManage,
  busy,
  onRole,
  onRevoke,
}: {
  member: TeamMember;
  canManage: boolean;
  busy: boolean;
  onRole: (role: ReviewRole) => void;
  onRevoke: () => void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.avatar} aria-hidden>
        {initials(member.name)}
      </span>
      <div className={styles.who}>
        <div className={styles.name}>
          {member.name}
          {member.isSelf ? <span className={styles.you}>you</span> : null}
        </div>
        <div className={styles.email}>{member.email}</div>
      </div>
      {member.status === 'pending' ? (
        <span className={styles.pendPill}>pending</span>
      ) : null}
      <div className={styles.roleCell}>
        {canManage ? (
          <RolePicker value={member.role} disabled={busy} onChange={onRole} />
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>
      {canManage ? (
        <button
          type="button"
          className={styles.iconBtn}
          disabled={busy}
          aria-label={`Remove ${member.name}`}
          title="Remove from review"
          onClick={onRevoke}
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <span className={styles.iconSpacer} />
      )}
    </div>
  );
}

function AiRow({
  ai,
  canManage,
  busy,
  onActivate,
  onValidate,
}: {
  ai: ReviewTeam['ai'];
  canManage: boolean;
  busy: boolean;
  onActivate: () => void;
  onValidate: () => void;
}) {
  const modeLabel =
    ai.reviewMode === 'ai_co_reviewer'
      ? 'Second independent reviewer'
      : 'Additional QC reviewer';
  return (
    <div className={styles.row}>
      <span className={`${styles.avatar} ${styles.aiAvatar}`} aria-hidden>
        <Bot size={15} />
      </span>
      <div className={styles.who}>
        <div className={styles.name}>
          AI reviewer
          <span className={styles.aiTag}>AI</span>
        </div>
        <div className={styles.email}>
          {modeLabel} · blinded like a human during independent screening
        </div>
      </div>
      <span
        className={ai.status === 'validated' ? styles.okPill : styles.pendPill}
      >
        {ai.status === 'validated' ? 'Validated' : 'Not validated'}
      </span>
      <div className={styles.roleCell}>
        {canManage ? (
          <div className={styles.aiActions}>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={busy}
              onClick={onValidate}
            >
              Validate
            </button>
            <button
              type="button"
              className={styles.inkBtn}
              disabled={busy || ai.status !== 'validated'}
              title={
                ai.status === 'validated'
                  ? 'Activate the AI reviewer'
                  : 'Recall validation required before activation'
              }
              onClick={onActivate}
            >
              Activate
            </button>
          </div>
        ) : (
          <RoleBadge role="reviewer" />
        )}
      </div>
      <span className={styles.iconSpacer} />
    </div>
  );
}

function InvitationRow({
  invitation,
  canManage,
  busy,
  onRevoke,
}: {
  invitation: PendingInvitation;
  canManage: boolean;
  busy: boolean;
  onRevoke: () => void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.avatar} aria-hidden>
        <Mail size={14} />
      </span>
      <div className={styles.who}>
        <div className={styles.name}>{invitation.email}</div>
        <div className={styles.email}>
          Invited as {roleLabel(invitation.role)} · expires{' '}
          {new Date(invitation.expiresAt).toLocaleDateString()}
        </div>
      </div>
      <span className={styles.pendPill}>pending</span>
      <div className={styles.roleCell} />
      {canManage ? (
        <button
          type="button"
          className={styles.iconBtn}
          disabled={busy}
          aria-label={`Revoke invitation to ${invitation.email}`}
          title="Revoke invitation"
          onClick={onRevoke}
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <span className={styles.iconSpacer} />
      )}
    </div>
  );
}

function InvitePanel({
  busy,
  inviteLink,
  onInvite,
  onAddExisting,
}: {
  busy: boolean;
  inviteLink: InviteData | null;
  onInvite: (email: string, role: string) => void;
  onAddExisting: (email: string, role: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ReviewRole>('reviewer');
  const [copied, setCopied] = useState(false);

  const acceptUrl = inviteLink
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/systematic-review/invite/${inviteLink.token}`
    : '';

  return (
    <section className={styles.card} aria-label="Invite">
      <div className="section-label">Invite someone</div>
      <div className={styles.inviteForm}>
        <input
          type="email"
          className={styles.input}
          placeholder="name@institution.edu"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email to invite"
        />
        <select
          className={styles.roleSelect}
          value={role}
          disabled={busy}
          aria-label="Role for the invite"
          onChange={(e) => setRole(e.target.value as ReviewRole)}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.inkBtn}
          disabled={busy || email.trim() === ''}
          onClick={() => onInvite(email.trim(), role)}
        >
          <UserPlus size={15} />
          Send email invite
        </button>
        <button
          type="button"
          className={styles.ghostBtn}
          disabled={busy || email.trim() === ''}
          title="Add someone who already has an account — no email token needed"
          onClick={() => onAddExisting(email.trim(), role)}
        >
          Add existing member
        </button>
      </div>
      <p className={styles.hint}>{ROLE_CAPABILITY[role]}</p>

      {inviteLink ? (
        <div className={styles.linkReveal}>
          <div className={styles.linkLabel}>
            Invite link for {inviteLink.email} — shown once, no email sent
            automatically. Copy and send it yourself.
          </div>
          <div className={styles.linkRow}>
            <code className={styles.linkCode}>{acceptUrl}</code>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                void navigator.clipboard?.writeText(acceptUrl);
                setCopied(true);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
