import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FeltLink, FeltPanel, Stitch, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { formatMonthlyAmount } from "@/lib/format";
import {
  getPublicOrganization,
  getPublicOrganizations,
  getPublicResidents,
  getPublicSpeciesCounts,
} from "@/lib/public-roster-cache";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { normalizeSpecies, speciesLabel } from "@/lib/species";

import styles from "./roster.module.css";
import {
  CompanionCard,
  CompanionCardCopy,
  CompanionGrid,
  CompanionPhoto,
  RosterShell,
  StitchedArrow,
} from "./roster-presentation";

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
    organization.sponsorshipTiers.length
      ? Math.min(
          ...organization.sponsorshipTiers.map((tier) => tier.monthlyCents),
        )
      : DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
  );

  return (
    <PageViewTransition>
      <RosterShell
        headerAction={
          <Link className={styles.accountLink} href="/account">
            My sponsorship <span aria-hidden="true">↗</span>
          </Link>
        }
        organizationName={organization.name}
        orgSlug={orgSlug}
      >
        <section className={styles.hero} aria-labelledby="roster-title">
          <div className={styles.heroCopy}>
            <StitchBadge className={styles.rescueBadge} tone="moss">
              <Stitch fine />
              {organization.name}
            </StitchBadge>
            <h1 id="roster-title">Meet the animals in our care.</h1>
            <p className={styles.lede}>
              You don’t have to bring them home to help care for them. Your
              monthly sponsorship supports {organization.name}, with photos and
              updates from the people who know them best.
            </p>
          </div>
          <FeltPanel className={styles.sponsorNote} tone="denim">
            <svg
              className={styles.heartPatch}
              viewBox="0 0 80 72"
              aria-hidden="true"
              focusable="false"
            >
              <path
                className={styles.heartShape}
                d="M40 65 C29 57 5 40 5 23 C5 4 28 0 40 17 C52 0 75 4 75 23 C75 40 51 57 40 65Z"
              />
              <path
                className={styles.heartSeam}
                d="M40 57 C29 49 12 37 12 24 C12 10 29 9 40 28 C51 9 68 10 68 24 C68 37 51 49 40 57Z"
              />
            </svg>
            <p>
              Small gifts.
              <br />
              Everyday care.
            </p>
            <span>Sponsorships from {monthlyAmount}/month</span>
          </FeltPanel>
        </section>

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
          <CompanionGrid>
            {residents.map((resident, index) => (
              <CompanionCard key={resident.id}>
                <Link
                  className={styles.photoLink}
                  href={`/${orgSlug}/companions/${resident.id}`}
                  aria-label={`Meet ${resident.name}`}
                  tabIndex={-1}
                >
                  <CompanionPhoto preload={index < 3} resident={resident} />
                </Link>
                <CompanionCardCopy
                  action={
                    <FeltLink
                      className={styles.cardLink}
                      href={`/${orgSlug}/companions/${resident.id}`}
                      tone="moss"
                    >
                      <span>Meet {resident.name}</span>
                      <StitchedArrow />
                    </FeltLink>
                  }
                  heading={
                    <Link href={`/${orgSlug}/companions/${resident.id}`}>
                      {resident.name}
                    </Link>
                  }
                  resident={resident}
                />
              </CompanionCard>
            ))}
          </CompanionGrid>
        ) : (
          <FeltPanel className={styles.emptyState} tone="oatmeal">
            <h2>No animals are available to sponsor right now.</h2>
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
      </RosterShell>
    </PageViewTransition>
  );
}
