import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  AdminBadge,
  AdminButton,
  AdminEyebrow,
  AdminFooter,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminSurface,
} from "@/components/admin-ui";
import { SignOutButton } from "@/components/sign-out-button";
import {
  PageViewTransition,
  SuspenseFallback,
  SuspenseReveal,
} from "@/components/page-view-transition";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { refreshConnectStatus } from "@/lib/stripe-billing";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

import { beginStripeOnboarding } from "../actions";
import {
  EmailConnectorSettings,
  PostscriptSettingsForm,
  RosterSyncSettings,
} from "../admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID } from "../gmail-notice";
import { STRIPE_CONNECT_NOTICE_ID, stripeNotReadyReason } from "../stripe-notice";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

type AdminSettingsPageProps = { params: Promise<{ orgSlug: string }> };

// Stripe owns the truth about whether an account can take card payments, so ask it
// on each visit rather than trusting the stored flags; fall back to them if Stripe
// is unreachable.
async function loadStripeConnection(orgId: string) {
  const stored = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeAccountId: true, stripeDetailsSubmitted: true, stripeChargesEnabled: true },
  });
  if (!stored?.stripeAccountId) {
    return stored && { ...stored, verifying: false, blockers: [] as string[] };
  }
  try {
    const live = await refreshConnectStatus(orgId);
    return {
      stripeAccountId: live.id,
      stripeDetailsSubmitted: live.detailsSubmitted,
      stripeChargesEnabled: live.chargesEnabled,
      verifying: live.verifying,
      blockers: live.blockers,
    };
  } catch (error) {
    console.warn("Could not refresh the Stripe Connect status; showing the stored one.", error);
    return { ...stored, verifying: false, blockers: [] };
  }
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
  const stripeBadge = organization?.verifying
    ? { tone: "mustard" as const, label: "Verifying" }
    : stripeNotReady
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
              : "Connected and ready to accept $25 monthly sponsorships."}
          </p>
          {organization && organization.blockers.length > 0 && (
            <ul className={styles.stripeBlockers}>
              {organization.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.connectorStatus}>
          <AdminBadge tone={stripeBadge.tone}>{stripeBadge.label}</AdminBadge>
        </div>
      </div>
      {stripeNotReady && canOnboard && (
        <form action={beginStripeOnboarding} className={styles.stripeConnectForm}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <AdminButton tone="brick" type="submit">
            {organization?.stripeDetailsSubmitted
              ? "Update Stripe details"
              : organization?.stripeAccountId
                ? "Continue Stripe onboarding"
                : "Connect Stripe"}
          </AdminButton>
        </form>
      )}
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
  const settings = storedSettings ?? { pinnedPostscript: "", sourceUrl: "" };

  return (
    <>
      <AdminSurface className={styles.settings} tone="denim">
        <div className={styles.settingsIntro}>
          <AdminEyebrow tone="denim">Staff settings</AdminEyebrow>
          <h2>Pinned to every email this month</h2>
          <p>The postscript rides at the bottom of each pupdate.</p>
        </div>
        <PostscriptSettingsForm orgSlug={orgSlug} pinnedPostscript={settings.pinnedPostscript} />
      </AdminSurface>

      <AdminSurface className={styles.settings} tone="moss">
        <div className={styles.settingsIntro}>
          <AdminEyebrow>Roster sync</AdminEyebrow>
          <h2>Keep the adoption roster current</h2>
          <p>Save the adoption-page source, then sync its current companions into the staff roster.</p>
        </div>
        <RosterSyncSettings initialSourceUrl={settings.sourceUrl} orgSlug={orgSlug} />
      </AdminSurface>
    </>
  );
}

function SettingsCardLoading({ tone }: { tone: "denim" | "moss" | "mustard" | "oatmeal" }) {
  return <AdminSurface aria-label="Loading settings" className={`${styles.settings} ${styles.settingsSkeleton}`} tone={tone} />;
}

export default async function AdminSettingsPage({ params }: AdminSettingsPageProps) {
  const { orgSlug } = await params;
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
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>}
        title="Staff settings"
      />

      <div className={styles.settingsStack}>
        <Suspense fallback={<SuspenseFallback><SettingsCardLoading tone="mustard" /></SuspenseFallback>}>
          <SuspenseReveal><StripeConnection canOnboard={context.role === "owner"} orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
        </Suspense>

        <Suspense fallback={<SuspenseFallback><SettingsCardLoading tone="oatmeal" /></SuspenseFallback>}>
          <SuspenseReveal><EmailSettings orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
        </Suspense>

        <Suspense fallback={<SuspenseFallback><><SettingsCardLoading tone="denim" /><SettingsCardLoading tone="moss" /></></SuspenseFallback>}>
          <SuspenseReveal><RescueSettings orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
        </Suspense>
      </div>

      <AdminFooter>staff settings · everything in its place</AdminFooter>
      </AdminPage>
    </PageViewTransition>
  );
}
