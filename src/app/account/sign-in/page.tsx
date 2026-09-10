import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltPanel } from "@/components/felt";
import { MagicLinkForm } from "@/components/magic-link-form";
import { PageViewTransition } from "@/components/page-view-transition";
import { getSession } from "@/lib/auth-session";
import { sponsorAccountReturnPath } from "@/lib/sponsor-account-navigation";

import styles from "../../staff/sign-in/sign-in.module.css";

export const dynamic = "force-dynamic";

type SponsorSignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SponsorSignInPage({
  searchParams,
}: SponsorSignInPageProps) {
  const query = await searchParams;
  const redirectTo = sponsorAccountReturnPath(query.next);
  const session = await getSession(await headers());

  if (session) {
    redirect(redirectTo);
  }

  return (
    <PageViewTransition>
      <main className={styles.page}>
        <FeltPanel className={styles.card} tone="denim">
          <p className={styles.eyebrow}>Sponsor account</p>
          <h1>Sign in by email</h1>
          <p className={styles.lede}>
            We&apos;ll email you a secure link—no password needed.
          </p>
          <MagicLinkForm callbackURL={redirectTo} />
        </FeltPanel>
      </main>
    </PageViewTransition>
  );
}
