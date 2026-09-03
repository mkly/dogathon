import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltPanel } from "@/components/felt";
import { MagicLinkForm } from "@/components/magic-link-form";
import { getSession } from "@/lib/auth-session";

import styles from "../../staff/sign-in/sign-in.module.css";

export const dynamic = "force-dynamic";

export default async function SponsorSignInPage() {
  const session = await getSession(await headers());

  if (session) {
    redirect("/account");
  }

  return (
    <main className={styles.page}>
      <FeltPanel className={styles.card} tone="denim">
        <p className={styles.eyebrow}>Sponsor account</p>
        <h1>Sign in by email</h1>
        <p className={styles.lede}>
          We&apos;ll email you a secure link—no password needed.
        </p>
        <MagicLinkForm />
      </FeltPanel>
    </main>
  );
}
