import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminBadge, AdminLink, AdminSurface } from "@/components/admin-ui";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import styles from "./sponsors.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsors | Dogathon staff",
  description: "Private sponsor directory for Dogathon staff.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

type SponsorsPageProps = { params: Promise<{ orgSlug: string }> };

export default async function SponsorsPage({ params }: SponsorsPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, ["owner", "admin"]);

  if (!access) notFound();
  if (!access.context) redirect("/organizations");
  const { context } = access;

  const sponsorships = await prisma.sponsorship.findMany({
    where: { orgId: context.orgId },
    include: { resident: { select: { name: true } } },
    orderBy: [{ sponsorEmail: "asc" }, { createdAt: "asc" }],
  });

  const grouped = new Map<string, typeof sponsorships>();

  for (const sponsorship of sponsorships) {
    const key = sponsorship.sponsorEmail.trim().toLocaleLowerCase();
    const records = grouped.get(key);

    if (records) {
      records.push(sponsorship);
    } else {
      grouped.set(key, [sponsorship]);
    }
  }

  const sponsors = Array.from(grouped.entries()).map(([email, records]) => {
    // The query sorts by raw email first, so mixed-case duplicates of one
    // address can land out of date order inside a group; re-sort so the card
    // shows the same newest contact details as the detail page.
    records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { email, records, latest: records.at(-1)! };
  });

  return (
    <main className={`admin-shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Private staff directory</p>
          <h1>Sponsors</h1>
          <p>Contact preferences and every dog supported, grouped by sponsor email.</p>
        </div>
        <AdminLink className={styles.backLink} href={`/${orgSlug}/admin`}>
          Back to staff room
        </AdminLink>
      </header>

      <div className={styles.summary}>
        <p>{sponsors.length} {sponsors.length === 1 ? "person" : "people"} · {sponsorships.length} {sponsorships.length === 1 ? "sponsorship" : "sponsorships"}</p>
        <AdminBadge tone="moss">staff only</AdminBadge>
      </div>

      {sponsors.length === 0 ? (
        <AdminSurface className={styles.empty} tone="oatmeal">
          <span aria-hidden="true">🧵</span>
          <h2>No sponsors yet</h2>
          <p>New sponsorships will be tucked into this directory.</p>
        </AdminSurface>
      ) : (
        <section aria-label="Sponsor directory" className={styles.sponsorList}>
          {sponsors.map(({ email, latest, records }) => (
            <AdminSurface className={styles.sponsorCard} key={email} tone="oatmeal">
              <div className={styles.sponsorHeading}>
                <div>
                  <h2>{latest.sponsorName}</h2>
                  <AdminBadge tone={records.some(({ status }) => status === "active") ? "moss" : "brick"}>
                    {records.length} {records.length === 1 ? "dog" : "dogs"}
                  </AdminBadge>
                </div>
                <div className={styles.contact}>
                  <p><a href={`mailto:${email}`}>{email}</a></p>
                  <p>{latest.sponsorPhone ? <a href={`tel:${latest.sponsorPhone}`}>{latest.sponsorPhone}</a> : "No phone provided"}</p>
                  <p>Updates: {latest.channel}</p>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Sponsored dog</th>
                      <th scope="col">Status</th>
                      <th scope="col">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td>{record.resident.name}</td>
                        <td><span className={styles.status}>{record.status}</span></td>
                        <td>{formatDate(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminSurface>
          ))}
        </section>
      )}
    </main>
  );
}
