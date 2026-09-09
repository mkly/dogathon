import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FeltLink, FeltPanel, PhotoPatch } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { PublicHeader } from "@/components/public-header";
import { ViewTransition } from "react";
import { formatMonthlyAmount } from "@/lib/format";
import {
  getPublicOrganization,
  getPublicOrganizations,
  getPublicResidents,
  getPublicSpeciesCounts,
} from "@/lib/public-roster-cache";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { normalizeSpecies, speciesLabel } from "@/lib/species";

import feltPup from "../../../../public/mascot/felt-pup-2.png";

import styles from "../../public.module.css";

export const revalidate = 86400;

type OrganizationHomeProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const rosterQuerySchema = z.object({
  species: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform(normalizeSpecies)
    .optional()
    .catch(undefined),
});

export async function generateStaticParams() {
  const organizations = await getPublicOrganizations();
  return organizations.map(({ slug }) => ({ orgSlug: slug }));
}

export default async function OrganizationHome({
  params,
  searchParams,
}: OrganizationHomeProps) {
  const { orgSlug } = await params;
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const { species: requestedSpecies } = rosterQuerySchema.parse(
    await searchParams,
  );
  const speciesCounts = await getPublicSpeciesCounts(organization.id);
  const activeSpecies = speciesCounts.some(
    ({ species }) => species === requestedSpecies,
  )
    ? requestedSpecies
    : undefined;
  const residents = await getPublicResidents(organization.id, activeSpecies);
  const monthlyAmount = formatMonthlyAmount(
    organization.sponsorshipTiers.find((tier) => tier.isDefault)
      ?.monthlyCents ??
      organization.sponsorshipTiers[0]?.monthlyCents ??
      DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
  );

  return (
    <PageViewTransition>
      <main className={styles.siteShell}>
        <PublicHeader organizationName={organization.name} orgSlug={orgSlug} />

        <FeltPanel className={styles.hero} tone="moss">
          <div className={styles.heroCopy}>
            <h1>
              Put a little love behind a{" "}
              <span className={styles.noOrphan}>
                <span className="felt-hl">rescue friend</span>.
              </span>
            </h1>
            <p className={styles.lede}>
              Sponsor a resident for {monthlyAmount} a month until they find
              their forever home. You&apos;ll help with everyday care and get
              the good news from their journey.
            </p>
          </div>
          {/* decorative: the heading and lede already carry the meaning */}
          <Image alt="" className={styles.mascot} preload src={feltPup} />
        </FeltPanel>

        {speciesCounts.length > 1 && (
          <nav
            aria-label="Filter companions by species"
            className={styles.speciesFilters}
          >
            <Link
              aria-current={activeSpecies ? undefined : "page"}
              href={`/${orgSlug}`}
            >
              All
            </Link>
            {speciesCounts.map(({ species, count }) => (
              <Link
                aria-current={activeSpecies === species ? "page" : undefined}
                href={`/${orgSlug}?species=${encodeURIComponent(species)}`}
                key={species}
              >
                {speciesLabel(species)} <span aria-hidden="true">{count}</span>
              </Link>
            ))}
          </nav>
        )}

        {residents.length ? (
          <section
            aria-label="Companions available to sponsor"
            className={styles.companionGrid}
          >
            {residents.map((resident) => (
              <FeltPanel
                className={styles.companionCard}
                key={resident.id}
                stitched={false}
                tone="oatmeal"
              >
                <ViewTransition
                  default="none"
                  name={`companion-${resident.id}`}
                  share="companion-photo"
                >
                  <PhotoPatch
                    alt={`${resident.name}, ${resident.breed}`}
                    className={styles.gridPhoto}
                    sizes="(max-width: 700px) calc(100vw - 80px), (max-width: 1028px) 29vw, 274px"
                    src={resident.photoUrls[0]}
                  />
                </ViewTransition>
                <div className={styles.cardCopy}>
                  <h2>{resident.name}</h2>
                  <p>
                    {resident.breed} · {resident.ageText}
                  </p>
                  <FeltLink
                    className={styles.cardLink}
                    href={`/${orgSlug}/companions/${resident.id}`}
                    tone="brick"
                  >
                    Meet {resident.name}
                  </FeltLink>
                </div>
              </FeltPanel>
            ))}
          </section>
        ) : (
          <FeltPanel className={styles.emptyState} tone="oatmeal">
            <h2>Every companion is tucked in for now.</h2>
            <p>
              Check back soon to meet the next residents looking for a sponsor.
            </p>
          </FeltPanel>
        )}

        <footer className={styles.footer}>
          <Link href={`/${orgSlug}/admin`} transitionTypes={["nav-forward"]}>
            staff room
          </Link>
        </footer>
      </main>
    </PageViewTransition>
  );
}
