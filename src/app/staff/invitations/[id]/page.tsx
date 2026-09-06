import { headers } from "next/headers";

import { AuthForm } from "@/components/auth-form";
import { FeltPanel, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { SignOutButton } from "@/components/sign-out-button";
import { PendingFeltSubmitButton } from "@/components/pending-submit-button";
import { getSession } from "@/lib/auth-session";
import { formatDateTime } from "@/lib/format";
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
    return <PageViewTransition><main className={styles.page}><ClosedInvitation state="unknown" /></main></PageViewTransition>;
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
    return <PageViewTransition><main className={styles.page}><ClosedInvitation state="unknown" /></main></PageViewTransition>;
  }
  if (state !== "pending") {
    return <PageViewTransition><main className={styles.page}><ClosedInvitation state={state} /></main></PageViewTransition>;
  }

  const role = describeInvitationRole(invitation.role);
  const returnPath = `/staff/invitations/${invitation.id}`;
  const matchingAccount = session
    ? session.user.email.trim().toLowerCase() === invitation.email.trim().toLowerCase()
    : false;
  const expiry = formatDateTime(invitation.expiresAt);
  const invitedAccountExists = session
    ? false
    : Boolean(await prisma.user.findFirst({
        where: {
          email: {
            equals: invitation.email,
            mode: "insensitive",
          },
        },
        select: { id: true },
      }));
  const acceptThisInvitation = acceptInvitation.bind(null, invitation.id);

  return (
    <PageViewTransition>
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
              <dd><time dateTime={invitation.expiresAt.toISOString()}>{expiry} UTC</time></dd>
            </div>
          </dl>

          {!session ? (
            <div className={styles.actionArea}>
              <div>
                <h2>{invitedAccountExists ? "Sign in" : "Create your account"}</h2>
                <p>
                  You will land in the {invitation.organization.name} staff room as {role.article}{" "}
                  {role.label.toLowerCase()}.
                </p>
              </div>
              <AuthForm
                fixedEmail={invitation.email}
                hiddenTabs
                initialMode={invitedAccountExists ? "sign-in" : "sign-up"}
                onAuthenticated={acceptThisInvitation}
              />
            </div>
          ) : matchingAccount ? (
            <form action={acceptThisInvitation} className={styles.actionArea}>
              <PendingFeltSubmitButton pendingLabel="Joining…" tone="mustard" type="submit">
                Join {invitation.organization.name}
              </PendingFeltSubmitButton>
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
    </PageViewTransition>
  );
}
