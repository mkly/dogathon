import { notFound } from "next/navigation";

import Link from "next/link";

import { FeltPanel, Stitch, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { PendingFeltSubmitButton } from "@/components/pending-submit-button";
import { prisma } from "@/lib/prisma";
import { getPublicOrganization } from "@/lib/public-roster-cache";

import {
  CompanionCard,
  CompanionCardCopy,
  CompanionGrid,
  CompanionPhoto,
  RosterShell,
  StitchedArrow,
} from "../../roster-presentation";
import { endSponsorshipAction, transferSponsorshipAction } from "./actions";
import { resolveSponsorshipSelection } from "./selection";
import styles from "./selection.module.css";

type NextCompanionPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    error?: string | string[];
    sponsorship?: string | string[];
    token?: string | string[];
  }>;
};

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <FeltPanel className={styles.selectionNotice} tone="oatmeal">
      {children}
    </FeltPanel>
  );
}

export default async function NextCompanionPage({
  params,
  searchParams,
}: NextCompanionPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const sponsorshipId =
    typeof query.sponsorship === "string" ? query.sponsorship : "";
  const selection = { sponsorshipId, token };
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const sponsorship = await resolveSponsorshipSelection(orgSlug, selection);

  const residents =
    sponsorship && ["active", "awaiting"].includes(sponsorship.status)
      ? await prisma.resident.findMany({
          where: {
            id: { not: sponsorship.residentId },
            orgId: sponsorship.orgId,
            available: true,
            sponsorships: { none: { status: "active" } },
          },
          orderBy: { name: "asc" },
        })
      : [];

  return (
    <PageViewTransition>
      <RosterShell
        headerAction={
          <Link href="/account">
            My sponsorship <span aria-hidden="true">↗</span>
          </Link>
        }
        organizationName={organization.name}
        orgSlug={orgSlug}
      >
        {!sponsorship ? (
          <Notice>
            <h1>This link no longer applies</h1>
            <p>
              It may no longer be valid, or this sponsorship may already have
              been updated. No changes were made.
            </p>
          </Notice>
        ) : sponsorship.status === "ended" ? (
          <Notice>
            <h1>Thank you for sponsoring</h1>
            <p>
              Your sponsorship has ended, and no more charges will be made. We
              sent a short confirmation to your email.
            </p>
          </Notice>
        ) : (
          <>
            <section className={styles.selectionHero}>
              <StitchBadge className={styles.rescueBadge} tone="moss">
                <Stitch fine />
                {organization.name}
              </StitchBadge>
              <h1>Choose your next companion.</h1>
              <p className={styles.lede}>
                Your monthly sponsorship continues at the same amount. Choose an
                available companion to follow next. You can switch companions or
                cancel at any time from your sponsorship page.
              </p>
              {query.error === "resident_unavailable" ? (
                <p className={styles.formError}>
                  That companion was just chosen. Please pick another.
                </p>
              ) : null}
            </section>

            {residents.length ? (
              <CompanionGrid label="Companions available to follow">
                {residents.map((resident, index) => (
                  <CompanionCard key={resident.id}>
                    <CompanionPhoto preload={index < 3} resident={resident} />
                    <CompanionCardCopy
                      action={
                        <form
                          action={transferSponsorshipAction.bind(
                            null,
                            orgSlug,
                            selection,
                          )}
                          className={styles.selectionForm}
                        >
                          <input
                            name="residentId"
                            type="hidden"
                            value={resident.id}
                          />
                          <PendingFeltSubmitButton
                            pendingLabel="Moving sponsorship…"
                            tone="moss"
                            type="submit"
                          >
                            <span>Follow {resident.name}</span>
                            <StitchedArrow />
                          </PendingFeltSubmitButton>
                        </form>
                      }
                      heading={resident.name}
                      resident={resident}
                    />
                  </CompanionCard>
                ))}
              </CompanionGrid>
            ) : (
              <Notice>
                <h2>No companions are available right now</h2>
                <p>Please check this page again soon.</p>
              </Notice>
            )}

            {sponsorship.status === "awaiting" ? (
              <FeltPanel className={styles.stopSponsoring} tone="cream">
                <div>
                  <h2>Prefer to stop?</h2>
                  <p>You can cancel this monthly sponsorship at any time.</p>
                </div>
                <form
                  action={endSponsorshipAction.bind(null, orgSlug, selection)}
                >
                  <PendingFeltSubmitButton
                    pendingLabel="Ending sponsorship…"
                    tone="oatmeal"
                    type="submit"
                  >
                    Stop sponsoring
                  </PendingFeltSubmitButton>
                </form>
              </FeltPanel>
            ) : null}
          </>
        )}
      </RosterShell>
    </PageViewTransition>
  );
}
