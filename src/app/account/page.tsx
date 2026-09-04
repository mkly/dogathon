import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminSurface,
} from "@/components/admin-ui";
import { SignOutButton } from "@/components/sign-out-button";
import { PageViewTransition } from "@/components/page-view-transition";
import { getSession } from "@/lib/auth-session";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSponsorContext } from "@/lib/sponsor-access";

import { openBillingPortal, updateSponsorProfile } from "./actions";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsor account | Dogathon",
  description: "Manage your Dogathon sponsorships and contact preferences.",
};

function formatMonthlyAmount(monthlyUsd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monthlyUsd);
}

export default async function SponsorAccountPage() {
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
            We couldn&apos;t match {session.user.email} to a sponsorship. Sign in with
            the email used at checkout, or contact the rescue for help.
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
      monthlyUsd: true,
      status: true,
      createdAt: true,
      stripeCustomerId: true,
      organization: { select: { name: true } },
      resident: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PageViewTransition>
      <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Sponsor account</p>
          <h1>Welcome, {sponsor.name}</h1>
          <p>Keep your details current and manage each rescue subscription.</p>
        </div>
        <SignOutButton redirectTo="/account/sign-in" />
      </header>

      <div className={styles.layout}>
        <AdminSurface className={styles.profile} tone="mustard">
          <h2>Your profile</h2>
          <p className={styles.profileIntro}>These details are shared with your rescues.</p>
          <form action={updateSponsorProfile} className={styles.form}>
            <label>
              Name
              <AdminField>
                <input defaultValue={sponsor.name} name="name" required />
              </AdminField>
            </label>
            <label>
              Phone
              <AdminField>
                <input
                  defaultValue={sponsor.phone ?? ""}
                  name="phone"
                  placeholder="Optional"
                  type="tel"
                />
              </AdminField>
            </label>
            <label>
              Send updates by
              <AdminField>
                <select defaultValue={sponsor.channel} name="channel">
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Email and SMS</option>
                </select>
              </AdminField>
            </label>
            <p className={styles.email}>{sponsor.email}</p>
            <div className={styles.profileActions}>
              <AdminButton tone="denim" type="submit">Save profile</AdminButton>
            </div>
          </form>
        </AdminSurface>

        <AdminSurface className={styles.sponsorships} tone="denim">
          <div className={styles.sectionHeading}>
            <h2>Your sponsorships</h2>
            <p>{sponsorships.length} total</p>
          </div>

          {sponsorships.length === 0 ? (
            <p className={styles.profileIntro}>No sponsorships are linked yet.</p>
          ) : (
            <div className={styles.list}>
              {sponsorships.map((record) => (
                <article className={styles.sponsorshipCard} key={record.id}>
                  <div>
                    <h3>{record.resident.name}</h3>
                    <p className={styles.rescue}>{record.organization.name}</p>
                    <div className={styles.details}>
                      <AdminBadge tone={record.status === "active" ? "moss" : "brick"}>
                        <span className={styles.status}>{record.status}</span>
                      </AdminBadge>
                      <span>Started {formatDate(record.createdAt)}</span>
                      <span>{formatMonthlyAmount(record.monthlyUsd)}/month</span>
                    </div>
                  </div>
                  {record.status === "active" && record.stripeCustomerId ? (
                    <form action={openBillingPortal.bind(null, record.id)}>
                      <AdminButton tone="mustard" type="submit">Manage billing</AdminButton>
                    </form>
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
