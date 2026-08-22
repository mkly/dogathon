"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton } from "@/components/felt";
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
    <FeltButton disabled={pending} onClick={signOut} tone="oatmeal">
      {pending ? "Signing out…" : "Sign out"}
    </FeltButton>
  );
}
