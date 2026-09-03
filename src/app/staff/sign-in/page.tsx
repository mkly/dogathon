import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AuthForm } from "@/components/auth-form";
import { FeltPanel } from "@/components/felt";
import { getSession } from "@/lib/auth-session";

import styles from "./sign-in.module.css";

export const dynamic = "force-dynamic";

type SignInPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const safeNextPathSchema = z.string()
  .startsWith("/")
  .refine((value) => !value.startsWith("//"))
  .catch("/staff/organizations");
const signInQuerySchema = z.object({ next: safeNextPathSchema });

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { next: redirectTo } = signInQuerySchema.parse(await searchParams);
  const session = await getSession(await headers());

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className={styles.page}>
      <FeltPanel className={styles.card} tone="denim">
        <p className={styles.eyebrow}>Copper&apos;s Dream Rescue</p>
        <h1>Staff sign in</h1>
        <p className={styles.lede}>
          Sign in with your staff account to open the admin room.
        </p>
        <AuthForm redirectTo={redirectTo} />
      </FeltPanel>
    </main>
  );
}
