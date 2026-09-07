import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  AdminBadge,
  AdminEyebrow,
  AdminFooter,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminSurface,
} from "@/components/admin-ui";
import { MotionReveal } from "@/components/motion-primitives";
import { SignOutButton } from "@/components/sign-out-button";
import {
  PageViewTransition,
  SuspenseFallback,
  SuspenseReveal,
} from "@/components/page-view-transition";
import { PendingAdminSubmitButton } from "@/components/pending-submit-button";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { formatMonthlyAmount } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

import { beginStripeOnboarding, refreshStripeConnection } from "../actions";
import {
  EmailConnectorSettings,
  RosterSyncSettings,
} from "../admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID } from "../gmail-notice";
import { STRIPE_CONNECT_NOTICE_ID, stripeNotReadyReason } from "../stripe-notice";
import styles from "../admin.module.css";
import { ConnectorResultNotice } from "./connector-result-notice";
import { PostscriptSettingsForm } from "./postscript-settings-form";
import { SponsorshipSettingsForm } from "./sponsorship-settings-form";

export const dynamic = "force-dynamic";

type AdminSettingsPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadStripeConnection(orgId: string) {
  const stored = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      stripeAccountId: true,
      stripeDetailsSubmitted: true,
      stripeChargesEnabled: true,
      settings: { select: { sponsorshipMonthlyCents: true } },
    },
  });
  return stored;
}

async function StripeConnection({
  canOnboard,
  orgId,
  orgSlug,
}: {
  canOnboard: boolean;
  orgId: string;
  orgSlug: string;
}) {
  const organization = await loadStripeConnection(orgId);
  const stripeNotReady = stripeNotReadyReason(organization);
  const monthlyAmount = formatMonthlyAmount(
    organization?.settings?.sponsorshipMonthlyCents ?? DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
  );
  const stripeBadge = stripeNotReady
    ? { tone: "brick" as const, label: "Not ready for payments" }
    : { tone: "moss" as const, label: "Ready for payments" };

  return (
    <AdminSurface
      className={`${styles.settings} ${styles.stripeConnect}`}
      id={STRIPE_CONNECT_NOTICE_ID}
      tone="mustard"
    >
      <div className={styles.connectorHeader}>
        <div className={styles.settingsIntro}>
          <AdminEyebrow>Stripe Connect</AdminEyebrow>
          <h2>Monthly sponsorship payments</h2>
          <p>
            {stripeNotReady
              ? `${stripeNotReady} Sponsors cannot check out until Stripe enables card payments.`
              : `Connected and ready to accept ${monthlyAmount} monthly sponsorships.`}
          </p>
        </div>
        <div className={styles.connectorStatus}>
          <AdminBadge tone={stripeBadge.tone}>{stripeBadge.label}</AdminBadge>
        </div>
      </div>
      <MotionReveal
        animateOnMount
        className={styles.stripeConnectReveal}
        show={Boolean(stripeNotReady) && canOnboard}
      >
        <form action={beginStripeOnboarding} className={styles.stripeConnectForm}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <PendingAdminSubmitButton pendingLabel="Opening Stripe…" tone="brick" type="submit">
            {organization?.stripeDetailsSubmitted
              ? "Update Stripe details"
              : organization?.stripeAccountId
                ? "Continue Stripe onboarding"
                : "Connect Stripe"}
          </PendingAdminSubmitButton>
        </form>
      </MotionReveal>
      {organization?.stripeAccountId && canOnboard ? (
        <form action={refreshStripeConnection} className={styles.stripeConnectForm}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <PendingAdminSubmitButton pendingLabel="Refreshing…" tone="oatmeal" type="submit">
            Refresh Stripe status
          </PendingAdminSubmitButton>
        </form>
      ) : null}
    </AdminSurface>
  );
}

async function EmailSettings({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const emailConnector = await getEmailConnectorStatus(orgId);

  return (
    <section id={EMAIL_CONNECTOR_NOTICE_ID}>
      <EmailConnectorSettings initialConnector={emailConnector} orgSlug={orgSlug} />
    </section>
  );
}

async function RescueSettings({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const storedSettings = await prisma.rescueSettings.findUnique({ where: { orgId } });
  const settings = storedSettings ?? {
    allowedOrigins: [],
    pinnedPostscript: "",
    sourceUrl: "",
    sponsorshipMonthlyCents: DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
  };

  return (
    <>
      <AdminSurface className={styles.settings} tone="denim">
        <div className={styles.settingsIntro}>
          <AdminEyebrow tone="denim">Email postscript</AdminEyebrow>
          <h2>Added to every sponsor update email</h2>
          <p>
            This note rides at the bottom of every update sent to sponsors, for every
            companion, until you change or clear it.
          </p>
        </div>
        <PostscriptSettingsForm orgSlug={orgSlug} pinnedPostscript={settings.pinnedPostscript} />
      </AdminSurface>

      <AdminSurface className={styles.settings} tone="moss">
        <div className={styles.settingsIntro}>
          <AdminEyebrow>Roster sync</AdminEyebrow>
          <h2>Keep the adoption roster current</h2>
          <p id="roster-sync-description">
            Save the adoption-page source and we will sync its companions into the staff roster
            every night. Use Sync now to run the same sync right away.
          </p>
        </div>
        <RosterSyncSettings initialSourceUrl={settings.sourceUrl} orgSlug={orgSlug} />
      </AdminSurface>

      <AdminSurface className={styles.settings} tone="brick">
        <div className={styles.settingsIntro}>
          <AdminEyebrow tone="brick">Sponsorship embeds</AdminEyebrow>
          <h2>Price and trusted rescue sites</h2>
          <p>
            Set the monthly sponsorship amount and the exact rescue-site origins allowed to use
            public embeds and checkout.
          </p>
        </div>
        <SponsorshipSettingsForm
          allowedOrigins={settings.allowedOrigins}
          orgSlug={orgSlug}
          sponsorshipMonthlyCents={settings.sponsorshipMonthlyCents}
        />
      </AdminSurface>
    </>
  );
}

function SettingsCardLoading({ tone }: { tone: "brick" | "denim" | "moss" | "mustard" | "oatmeal" }) {
  return <AdminSurface aria-label="Loading settings" className={`${styles.settings} ${styles.settingsSkeleton}`} tone={tone} />;
}

export default async function AdminSettingsPage({ params, searchParams }: AdminSettingsPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const connectorResult =
    query.emailConnector === "connected" || query.emailConnector === "error"
      ? query.emailConnector
      : null;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    settings: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/settings`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  return (
    <PageViewTransition>
      <AdminPage>
        <AdminHeader
          actions={
            <>
              <AdminLink href={`/${orgSlug}/admin`} tone="oatmeal" transitionTypes={["nav-back"]}>
                Back to staff room
              </AdminLink>
              <SignOutButton />
            </>
          }
          brand={<Link href={`/${orgSlug}`} transitionTypes={["nav-back"]}>
            <Image alt="Pawcast" preload src={pawcastWordmark} />
          </Link>}
          title="Staff settings"
        />

        <div className={styles.settingsStack}>
          {connectorResult ? <ConnectorResultNotice result={connectorResult} /> : null}
          <Suspense fallback={<SuspenseFallback><SettingsCardLoading tone="mustard" /></SuspenseFallback>}>
            <SuspenseReveal><StripeConnection canOnboard={context.role === "owner"} orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
          </Suspense>

          <Suspense fallback={<SuspenseFallback><SettingsCardLoading tone="oatmeal" /></SuspenseFallback>}>
            <SuspenseReveal><EmailSettings orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
          </Suspense>

          <Suspense fallback={<SuspenseFallback><><SettingsCardLoading tone="denim" /><SettingsCardLoading tone="moss" /><SettingsCardLoading tone="brick" /></></SuspenseFallback>}>
            <SuspenseReveal><RescueSettings orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
          </Suspense>
        </div>

        <AdminFooter>staff settings · everything in its place</AdminFooter>
      </AdminPage>
    </PageViewTransition>
  );
}
