import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminBadge, AdminLink, AdminSurface } from "@/components/admin-ui";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import styles from "../sponsors.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsor details | Dogathon staff",
  description: "Private sponsorship history for Dogathon staff.",
};

type SponsorDetailPageProps = {
  params: Promise<{ email: string; orgSlug: string }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export default async function SponsorDetailPage({ params }: SponsorDetailPageProps) {
  const { email, orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, ["owner", "admin"]);

  if (!access) notFound();
  if (!access.context) redirect("/organizations");
  const { context } = access;

  const sponsorships = await prisma.sponsorship.findMany({
    where: { orgId: context.orgId, sponsorEmail: { equals: email, mode: "insensitive" } },
    include: { resident: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (sponsorships.length === 0) {
    notFound();
  }

  const latest = sponsorships.at(-1)!;

  return (
    <main className={`admin-shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Sponsor record</p>
          <h1>{latest.sponsorName}</h1>
          <p>Full contact details and sponsorship history.</p>
        </div>
        <AdminLink className={styles.backLink} href={`/${orgSlug}/admin/sponsors`}>
          Back to sponsors
        </AdminLink>
      </header>

      <AdminSurface className={styles.profile} tone="denim">
        <div className={styles.profileItem}>
          <small>Email</small>
          <a href={`mailto:${latest.sponsorEmail}`}>{latest.sponsorEmail}</a>
        </div>
        <div className={styles.profileItem}>
          <small>Phone</small>
          {latest.sponsorPhone ? <a href={`tel:${latest.sponsorPhone}`}>{latest.sponsorPhone}</a> : <strong>Not provided</strong>}
        </div>
        <div className={styles.profileItem}>
          <small>Preferred updates</small>
          <strong>{latest.channel}</strong>
        </div>
      </AdminSurface>

      <section aria-labelledby="history-heading">
        <div className={styles.historyTitle}>
          <h2 id="history-heading">Sponsorship history</h2>
          <AdminBadge tone="mustard">{sponsorships.length} {sponsorships.length === 1 ? "companion" : "companions"}</AdminBadge>
        </div>
        <AdminSurface className={styles.historyPanel} tone="oatmeal">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Companion</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updates</th>
                  <th scope="col">Started</th>
                  <th scope="col">Ended</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {sponsorships.map((sponsorship) => (
                  <tr key={sponsorship.id}>
                    <td>{sponsorship.resident.name}</td>
                    <td><span className={styles.status}>{sponsorship.status}</span></td>
                    <td>{sponsorship.channel}</td>
                    <td>{formatDate(sponsorship.createdAt)}</td>
                    <td>{sponsorship.status === "ended" ? formatDate(sponsorship.updatedAt) : "Ongoing"}</td>
                    <td className={styles.reason}>{sponsorship.endedReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSurface>
      </section>
    </main>
  );
}
