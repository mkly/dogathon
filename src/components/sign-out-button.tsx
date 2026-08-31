"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminButton } from "@/components/admin-ui";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <AdminButton disabled={pending} onClick={signOut} tone="oatmeal">
      {pending ? "Signing out…" : "Sign out"}
    </AdminButton>
  );
}
