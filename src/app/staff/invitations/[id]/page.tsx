import { headers } from "next/headers";

import { FeltButton, FeltLink, FeltPanel, StitchBadge } from "@/components/felt";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

import { acceptInvitation } from "./actions";
import { describeInvitationRole, invitationState, type InvitationState } from "./invitation-view";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type InvitationPageProps = { params: Promise<{ id: string }> };

const stateCopy: Record<Exclude<InvitationState, "pending">, {
  body: string;
  eyebrow: string;
  title: string;
  tone: "brick" | "denim" | "mustard";
}> = {
  accepted: {
    body: "This invitation has already been used. Sign in with the invited account to open its rescue staff room.",
    eyebrow: "Already joined",
    title: "Invitation already accepted",
    tone: "denim",
  },
  cancelled: {
    body: "The rescue cancelled this invitation, so it can no longer be used. Ask a rescue admin for a new invitation.",
    eyebrow: "No longer available",
    title: "Invitation cancelled",
    tone: "brick",
  },
  expired: {
    body: "This invitation reached its expiration date. Ask a rescue admin to send you a fresh invitation.",
    eyebrow: "Time ran out",
    title: "Invitation expired",
    tone: "mustard",
  },
  unknown: {
    body: "This invitation link is not valid. Check that you copied the whole link, or ask the rescue for a new one.",
    eyebrow: "Link unavailable",
    title: "Invitation not found",
    tone: "brick",
  },
};

function ClosedInvitation({ state }: { state: Exclude<InvitationState, "pending"> }) {
  const copy = stateCopy[state];
  return (
    <FeltPanel className={styles.card} tone={copy.tone}>
      <p className={styles.eyebrow}>{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p className={styles.lede}>{copy.body}</p>
    </FeltPanel>
  );
}

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { id } = await params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return <main className={styles.page}><ClosedInvitation state="unknown" /></main>;
  }

  const [invitation, session] = await Promise.all([
    prisma.invitation.findUnique({
      where: { id: parsedId.data },
      include: {
        inviter: { select: { email: true, name: true } },
        organization: { select: { name: true, slug: true } },
      },
    }),
    headers().then(getSession),
  ]);
  const state = invitationState(invitation);
  if (!invitation) {
    return <main className={styles.page}><ClosedInvitation state="unknown" /></main>;
  }
  if (state !== "pending") {
    return <main className={styles.page}><ClosedInvitation state={state} /></main>;
  }

  const role = describeInvitationRole(invitation.role);
  const returnPath = `/staff/invitations/${invitation.id}`;
  const matchingAccount = session
    ? session.user.email.trim().toLowerCase() === invitation.email.trim().toLowerCase()
    : false;
  const expiry = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    timeZoneName: "short",
    year: "numeric",
  }).format(invitation.expiresAt);

  return (
    <main className={styles.page}>
      <FeltPanel className={styles.card} tone="denim">
        <StitchBadge tone="mustard">Rescue invitation</StitchBadge>
        <h1>Join {invitation.organization.name}</h1>
        <p className={styles.lede}>
          {invitation.inviter.name || invitation.inviter.email} invited you to help this rescue.
        </p>

        <dl className={styles.details}>
          <div>
            <dt>Role</dt>
            <dd><strong>{role.label}</strong><span>{role.description}</span></dd>
          </div>
          <div>
            <dt>Invited email</dt>
            <dd>{invitation.email}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd><time dateTime={invitation.expiresAt.toISOString()}>{expiry}</time></dd>
          </div>
        </dl>

        {!session ? (
          <div className={styles.actionArea}>
            <p>Sign in with <strong>{invitation.email}</strong> to accept this invitation.</p>
            <FeltLink
              href={`/staff/sign-in?next=${encodeURIComponent(returnPath)}`}
              tone="mustard"
            >
              Sign in to continue
            </FeltLink>
          </div>
        ) : matchingAccount ? (
          <form action={acceptInvitation} className={styles.actionArea}>
            <input name="invitationId" type="hidden" value={invitation.id} />
            <FeltButton tone="mustard" type="submit">
              Join {invitation.organization.name}
            </FeltButton>
          </form>
        ) : (
          <div className={styles.actionArea}>
            <p>
              This invitation was sent to <strong>{invitation.email}</strong>, but you are signed
              in as <strong>{session.user.email}</strong>.
            </p>
            <p>Sign out, then return here with the invited account.</p>
            <SignOutButton redirectTo={returnPath} />
          </div>
        )}
      </FeltPanel>
    </main>
  );
}
