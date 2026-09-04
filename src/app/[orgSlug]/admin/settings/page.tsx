import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  AdminButton,
  AdminEyebrow,
  AdminFooter,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminSurface,
} from "@/components/admin-ui";
import { SignOutButton } from "@/components/sign-out-button";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

import { beginStripeOnboarding } from "../actions";
import {
  EmailConnectorSettings,
  PostscriptSettingsForm,
  RosterSyncSettings,
} from "../admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID } from "../gmail-notice";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

type AdminSettingsPageProps = { params: Promise<{ orgSlug: string }> };

async function loadStripeConnection(orgId: string) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      stripeAccountId: true,
      stripeDetailsSubmitted: true,
      stripeChargesEnabled: true,
    },
  });
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

  return (
    <AdminSurface className={`${styles.settings} ${styles.stripeConnect}`} tone="mustard">
      <div className={styles.settingsIntro}>
        <AdminEyebrow>Stripe Connect</AdminEyebrow>
        <h2>Monthly sponsorship payments</h2>
        <p>
          {organization?.stripeChargesEnabled
            ? "Connected and ready to accept $25 monthly sponsorships."
            : organization?.stripeDetailsSubmitted
              ? "Stripe has your details and is still enabling payments."
              : organization?.stripeAccountId
                ? "Finish the Stripe onboarding form to accept sponsorships."
                : "Connect this rescue to Stripe before sponsors can check out."}
        </p>
      </div>
      {!organization?.stripeChargesEnabled && canOnboard && (
        <form action={beginStripeOnboarding} className={styles.stripeConnectForm}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <AdminButton tone="brick" type="submit">
            {organization?.stripeAccountId ? "Continue Stripe onboarding" : "Connect Stripe"}
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
    <AdminPage>
      <AdminHeader
        actions={
          <>
            <AdminLink href={`/${orgSlug}/admin`} tone="oatmeal">
              Back to staff room
            </AdminLink>
            <SignOutButton />
          </>
        }
        brand={<Link href={`/${orgSlug}`}>
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>}
        title="Staff settings"
      />

      <div className={styles.settingsStack}>
        <Suspense fallback={<SettingsCardLoading tone="mustard" />}>
          <StripeConnection canOnboard={context.role === "owner"} orgId={context.orgId} orgSlug={orgSlug} />
        </Suspense>

        <Suspense fallback={<SettingsCardLoading tone="oatmeal" />}>
          <EmailSettings orgId={context.orgId} orgSlug={orgSlug} />
        </Suspense>

        <Suspense fallback={<><SettingsCardLoading tone="denim" /><SettingsCardLoading tone="moss" /></>}>
          <RescueSettings orgId={context.orgId} orgSlug={orgSlug} />
        </Suspense>
      </div>

      <AdminFooter>staff settings · everything in its place</AdminFooter>
    </AdminPage>
  );
}
