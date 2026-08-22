import { headers } from "next/headers";

import { AuthForm } from "@/components/auth-form";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <main>
      <section className="card">
        <p className="eyebrow">Dogathon</p>
        {session ? (
          <>
            <h1>Welcome, {session.user.username ?? session.user.name}</h1>
            <p className="muted">You are signed in.</p>
            <SignOutButton />
          </>
        ) : (
          <>
            <h1>Welcome</h1>
            <p className="muted">Sign in or create an account to continue.</p>
            <AuthForm />
          </>
        )}
      </section>
    </main>
  );
}
