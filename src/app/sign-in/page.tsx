import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { FeltPanel } from "@/components/felt";
import { getSession } from "@/lib/auth-session";

import styles from "./sign-in.module.css";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getSession(await headers());

  if (session) {
    redirect("/admin");
  }

  return (
    <main className={styles.page}>
      <FeltPanel className={styles.card} tone="denim">
        <p className={styles.eyebrow}>Copper&apos;s Dream Rescue</p>
        <h1>Staff sign in</h1>
        <p className={styles.lede}>
          Sign in with your staff account to open the admin room.
        </p>
        <AuthForm />
      </FeltPanel>
    </main>
  );
}
