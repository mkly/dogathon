import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

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

export default async function AdminSettingsPage({ params }: AdminSettingsPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, ["owner", "admin"]);

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/settings`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const [storedSettings, emailConnector, organization] = await Promise.all([
    prisma.rescueSettings.findUnique({ where: { orgId: context.orgId } }),
    getEmailConnectorStatus(context.orgId),
    prisma.organization.findUnique({
      where: { id: context.orgId },
      select: {
        stripeAccountId: true,
        stripeDetailsSubmitted: true,
        stripeChargesEnabled: true,
      },
    }),
  ]);
  const settings = storedSettings ?? {
    pinnedPostscript: "",
    sourceUrl: "https://www.coppersdream.org/dogs-and-more-back-up",
  };

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
        <AdminSurface className={styles.settings} tone="mustard">
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
          {!organization?.stripeChargesEnabled && context.role === "owner" && (
            <form action={beginStripeOnboarding} className={styles.stripeConnectForm}>
              <input name="orgSlug" type="hidden" value={orgSlug} />
              <AdminButton tone="brick" type="submit">
                {organization?.stripeAccountId ? "Continue Stripe onboarding" : "Connect Stripe"}
              </AdminButton>
            </form>
          )}
        </AdminSurface>

        <section id={EMAIL_CONNECTOR_NOTICE_ID}>
          <EmailConnectorSettings initialConnector={emailConnector} orgSlug={orgSlug} />
        </section>

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
            <p>
              Save the adoption-page source, then sync its current companions into the staff roster.
            </p>
          </div>
          <RosterSyncSettings initialSourceUrl={settings.sourceUrl} orgSlug={orgSlug} />
        </AdminSurface>
      </div>

      <AdminFooter>staff settings · everything in its place</AdminFooter>
    </AdminPage>
  );
}
