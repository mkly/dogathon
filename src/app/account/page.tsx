import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltPanel } from "@/components/felt";
import { getSession } from "@/lib/auth-session";

import styles from "../sign-in/sign-in.module.css";

export const dynamic = "force-dynamic";

export default async function SponsorAccountPage() {
  const session = await getSession(await headers());

  if (!session) {
    redirect("/account/sign-in");
  }

  return (
    <main className={styles.page}>
      <FeltPanel className={styles.card} tone="denim">
        <p className={styles.eyebrow}>Sponsor account</p>
        <h1>You&apos;re signed in</h1>
        <p className={styles.lede}>{session.user.email}</p>
      </FeltPanel>
    </main>
  );
}
