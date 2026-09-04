"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminButton } from "@/components/admin-ui";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ redirectTo = "/staff/sign-in" }: { redirectTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push(redirectTo);
  }

  return (
    <AdminButton
      disabled={pending}
      onClick={signOut}
      style={{ minWidth: "6.75rem" }}
      tone="oatmeal"
    >
      {pending ? "Signing out…" : "Sign out"}
    </AdminButton>
  );
}
