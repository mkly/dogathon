import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminBadge, AdminSurface } from "@/components/admin-ui";
import { FeltLink } from "@/components/felt";
import { SignOutButton } from "@/components/sign-out-button";
import { PageViewTransition } from "@/components/page-view-transition";
import { getSession } from "@/lib/auth-session";
import {
  formatDate,
  formatMonthlyAmount,
  sponsorshipStatusLabel,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSponsorContext } from "@/lib/sponsor-access";
import { switchedSponsorshipId } from "@/lib/sponsor-account-navigation";

import { BillingPortalForm, SponsorProfileForm } from "./account-forms";
import styles from "./account.module.css";
import { SwitchConfirmation } from "./switch-confirmation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsor account | Dogathon",
  description: "Manage your Dogathon sponsorships and contact preferences.",
};

type SponsorAccountPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SponsorAccountPage({
  searchParams,
}: SponsorAccountPageProps) {
  const switchedId = switchedSponsorshipId(await searchParams);
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) redirect("/account/sign-in");

  const sponsor = await getSponsorContext(requestHeaders);
  if (!sponsor) {
    return (
      <PageViewTransition>
        <main className={styles.page}>
          <AdminSurface className={styles.empty} tone="oatmeal">
            <p className={styles.eyebrow}>Sponsor account</p>
            <h1>No sponsorship profile yet</h1>
            <p>
              We couldn&apos;t match {session.user.email} to a sponsorship. Sign
              in with the email used at checkout, or contact the rescue for
              help.
            </p>
            <div className={styles.emptyActions}>
              <SignOutButton redirectTo="/account/sign-in" />
            </div>
          </AdminSurface>
        </main>
      </PageViewTransition>
    );
  }

  const sponsorships = await prisma.sponsorship.findMany({
    where: { sponsorId: sponsor.id },
    select: {
      id: true,
      monthlyCents: true,
      status: true,
      createdAt: true,
      stripeCustomerId: true,
      organization: { select: { name: true, slug: true } },
      resident: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const switchedSponsorship = sponsorships.find(
    (record) => record.id === switchedId,
  );

  return (
    <PageViewTransition>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Sponsor account</p>
            <h1>Welcome, {sponsor.name}</h1>
            <p>
              Keep your details current and manage each rescue subscription.
            </p>
          </div>
          <SignOutButton redirectTo="/account/sign-in" />
        </header>

        {switchedSponsorship ? (
          <SwitchConfirmation
            companionName={switchedSponsorship.resident.name}
            organizationName={switchedSponsorship.organization.name}
          />
        ) : null}

        <div className={styles.layout}>
          <AdminSurface className={styles.profile} tone="mustard">
            <h2>Your profile</h2>
            <p className={styles.profileIntro}>
              These details are shared with your rescues.
            </p>
            <SponsorProfileForm email={sponsor.email} name={sponsor.name} />
          </AdminSurface>

          <AdminSurface className={styles.sponsorships} tone="denim">
            <div className={styles.sectionHeading}>
              <h2>Your sponsorships</h2>
              <p>{sponsorships.length} total</p>
            </div>

            {sponsorships.length === 0 ? (
              <p className={styles.profileIntro}>
                No sponsorships are linked yet.
              </p>
            ) : (
              <div className={styles.list}>
                {sponsorships.map((record) => (
                  <article className={styles.sponsorshipCard} key={record.id}>
                    <div>
                      <h3>{record.resident.name}</h3>
                      <p className={styles.rescue}>
                        {record.organization.name}
                      </p>
                      <div className={styles.details}>
                        <AdminBadge
                          tone={record.status === "active" ? "moss" : "brick"}
                        >
                          <span className={styles.status}>
                            {sponsorshipStatusLabel(record.status)}
                          </span>
                        </AdminBadge>
                        <span>Started {formatDate(record.createdAt)}</span>
                        <span>
                          {formatMonthlyAmount(record.monthlyCents)}/month
                        </span>
                        {record.status === "active" ||
                        record.status === "awaiting" ? (
                          <span>
                            Continues month to month; switch companions or
                            cancel at any time
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {["active", "awaiting"].includes(record.status) ||
                    record.stripeCustomerId ? (
                      <div className={styles.sponsorshipActions}>
                        {["active", "awaiting"].includes(record.status) ? (
                          <FeltLink
                            href={`/${record.organization.slug}/sponsor/next?sponsorship=${record.id}`}
                            tone="oatmeal"
                          >
                            Switch companions
                          </FeltLink>
                        ) : null}
                        {record.stripeCustomerId ? (
                          <BillingPortalForm sponsorshipId={record.id} />
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </AdminSurface>
        </div>
      </main>
    </PageViewTransition>
  );
}
