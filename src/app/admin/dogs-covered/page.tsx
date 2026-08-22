import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

import styles from "./dogs-covered.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dogs covered | Dogathon staff",
  description: "Private sponsorship directory grouped by dog for Dogathon staff.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export default async function DogsCoveredPage() {
  const session = await getSession(await headers());

  if (!session) {
    redirect("/sign-in");
  }

  const residents = await prisma.resident.findMany({
    where: { sponsorships: { some: {} } },
    include: { sponsorships: { orderBy: { createdAt: "asc" } } },
    orderBy: { name: "asc" },
  });

  const sponsorshipCount = residents.reduce(
    (total, resident) => total + resident.sponsorships.length,
    0,
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Private staff directory</p>
          <h1>Dogs covered</h1>
          <p>Every sponsored resident and the people supporting them.</p>
        </div>
        <Link className={`felt-button felt-denim ${styles.backLink}`} href="/admin">
          Back to staff room
        </Link>
      </header>

      <div className={styles.summary}>
        <p>
          {residents.length} {residents.length === 1 ? "dog" : "dogs"} · {sponsorshipCount}{" "}
          {sponsorshipCount === 1 ? "sponsorship" : "sponsorships"}
        </p>
        <StitchBadge tone="moss">staff only</StitchBadge>
      </div>

      {residents.length === 0 ? (
        <FeltPanel className={styles.empty} tone="oatmeal">
          <span aria-hidden="true">🐾</span>
          <h2>No dogs covered yet</h2>
          <p>Residents will appear here when their first sponsorship begins.</p>
        </FeltPanel>
      ) : (
        <section aria-label="Dogs covered directory" className={styles.dogList}>
          {residents.map((resident) => {
            const hasActiveSponsor = resident.sponsorships.some(
              ({ status }) => status === "active",
            );

            return (
              <FeltPanel className={styles.dogCard} key={resident.id} tone="oatmeal">
                <div className={styles.dogHeading}>
                  <PhotoPatch
                    alt={`${resident.name} portrait`}
                    className={styles.photo}
                    src={resident.photoUrls[0]}
                  />
                  <div className={styles.dogDetails}>
                    <h2>{resident.name}</h2>
                    <p>{resident.breed}</p>
                    <div className={styles.badges}>
                      <StitchBadge tone={resident.status === "available" ? "denim" : "brick"}>
                        {resident.status}
                      </StitchBadge>
                      <StitchBadge tone={hasActiveSponsor ? "moss" : "brick"}>
                        {resident.sponsorships.length}{" "}
                        {resident.sponsorships.length === 1 ? "sponsor" : "sponsors"}
                      </StitchBadge>
                    </div>
                  </div>
                  <Link
                    className={`felt-button felt-mustard ${styles.detailLink}`}
                    href={`/dogs/${resident.id}`}
                  >
                    View dog page
                  </Link>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Sponsor</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Channel</th>
                        <th scope="col">Status</th>
                        <th scope="col">Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resident.sponsorships.map((sponsorship) => (
                        <tr key={sponsorship.id}>
                          <td>{sponsorship.sponsorName}</td>
                          <td className={styles.contact}>
                            <a href={`mailto:${sponsorship.sponsorEmail}`}>
                              {sponsorship.sponsorEmail}
                            </a>
                            {sponsorship.sponsorPhone && (
                              <a href={`tel:${sponsorship.sponsorPhone}`}>
                                {sponsorship.sponsorPhone}
                              </a>
                            )}
                          </td>
                          <td className={styles.capitalize}>{sponsorship.channel}</td>
                          <td className={styles.capitalize}>{sponsorship.status}</td>
                          <td>{formatDate(sponsorship.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </FeltPanel>
            );
          })}
        </section>
      )}
    </main>
  );
}
