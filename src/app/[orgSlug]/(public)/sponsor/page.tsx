import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FeltLink, FeltPanel } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { PublicHeader } from "@/components/public-header";
import { getPublicOrganization } from "@/lib/public-roster-cache";

import styles from "../../../public.module.css";
import { resolveSponsorDestination } from "./sponsor-page";

type SponsorResolverPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ source?: string | string[] }>;
};

export default async function SponsorResolverPage({
  params,
  searchParams,
}: SponsorResolverPageProps) {
  const [{ orgSlug }, { source }] = await Promise.all([params, searchParams]);
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();

  const destination = await resolveSponsorDestination({
    orgId: organization.id,
    orgSlug,
    source,
  });
  if (destination.kind === "redirect") redirect(destination.href);

  return (
    <PageViewTransition>
      <main className={styles.siteShell}>
        <PublicHeader organizationName={organization.name} orgSlug={orgSlug} />
        <FeltPanel className={styles.emptyState} tone="oatmeal">
          <h1>This companion is not available to sponsor yet.</h1>
          <p>
            Their page may not be in the rescue&apos;s current roster. Meet the
            companions who are ready for a little extra support today.
          </p>
          <FeltLink
            href={`/${orgSlug}`}
            tone="brick"
            transitionTypes={["nav-back"]}
          >
            View {organization.name}&apos;s companions
          </FeltLink>
        </FeltPanel>

        <footer className={styles.footer}>
          <Link href={`/${orgSlug}`}>Back to the public roster</Link>
        </footer>
      </main>
    </PageViewTransition>
  );
}
