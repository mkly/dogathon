import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltPanel, StitchBadge } from "@/components/felt";
import { getOrganizationContext } from "@/lib/organization-access";
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

export default async function SponsorsPage() {
  const context = await getOrganizationContext(await headers(), ["owner", "admin"]);

  if (!context) {
    redirect("/organizations");
  }

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
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Private staff directory</p>
          <h1>Sponsors</h1>
          <p>Contact preferences and every dog supported, grouped by sponsor email.</p>
        </div>
        <Link className={`felt-button felt-denim ${styles.backLink}`} href="/admin">
          Back to staff room
        </Link>
      </header>

      <div className={styles.summary}>
        <p>{sponsors.length} {sponsors.length === 1 ? "person" : "people"} · {sponsorships.length} {sponsorships.length === 1 ? "sponsorship" : "sponsorships"}</p>
        <StitchBadge tone="moss">staff only</StitchBadge>
      </div>

      {sponsors.length === 0 ? (
        <FeltPanel className={styles.empty} tone="oatmeal">
          <span aria-hidden="true">🧵</span>
          <h2>No sponsors yet</h2>
          <p>New sponsorships will be tucked into this directory.</p>
        </FeltPanel>
      ) : (
        <section aria-label="Sponsor directory" className={styles.sponsorList}>
          {sponsors.map(({ email, latest, records }) => (
            <FeltPanel className={styles.sponsorCard} key={email} tone="oatmeal">
              <div className={styles.sponsorHeading}>
                <div>
                  <h2>{latest.sponsorName}</h2>
                  <StitchBadge tone={records.some(({ status }) => status === "active") ? "moss" : "brick"}>
                    {records.length} {records.length === 1 ? "dog" : "dogs"}
                  </StitchBadge>
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
            </FeltPanel>
          ))}
        </section>
      )}
    </main>
  );
}
