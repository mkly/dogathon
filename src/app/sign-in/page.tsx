import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getSession(await headers());

  if (session) {
    redirect("/admin");
  }

  return (
    <main>
      <section className="card">
        <p className="eyebrow">Copper&apos;s Dream Rescue</p>
        <h1>Staff sign in</h1>
        <p className="muted">Sign in with your staff account to open the admin room.</p>
        <AuthForm />
      </section>
    </main>
  );
}
