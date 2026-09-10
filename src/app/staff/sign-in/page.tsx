import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { FeltPanel } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { getSession } from "@/lib/auth-session";
import {
  resolveStaffSignInDestination,
  sanitizeStaffSignInNext,
} from "@/lib/staff-organizations-path";

import { completeStaffSignIn } from "./actions";
import styles from "./sign-in.module.css";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const rawNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (session) {
    const destination = await resolveStaffSignInDestination(
      requestHeaders,
      session.user.id,
      rawNext,
    );
    redirect(destination);
  }

  const safeNext = sanitizeStaffSignInNext(rawNext);
  const completeAction = completeStaffSignIn.bind(null, rawNext);

  return (
    <PageViewTransition>
      <main className={styles.page}>
        <FeltPanel className={styles.card} tone="denim">
          <p className={styles.eyebrow}>Rescue staff</p>
          <h1>Staff sign in</h1>
          <p className={styles.lede}>
            Sign in with your staff account to open the admin room.
          </p>
          <AuthForm
            onAuthenticated={completeAction}
            redirectTo={safeNext ?? "/staff/organizations"}
          />
        </FeltPanel>
      </main>
    </PageViewTransition>
  );
}
