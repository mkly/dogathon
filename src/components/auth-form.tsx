"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton, FeltField } from "@/components/felt";
import { authClient } from "@/lib/auth-client";

import styles from "./auth-form.module.css";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ redirectTo = "/admin" }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email,
            name,
            password,
          })
        : await authClient.signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <div aria-label="Authentication mode" className={styles.tabs}>
        <FeltButton
          onClick={() => {
            setMode("sign-in");
            setError(null);
          }}
          tone={mode === "sign-in" ? "mustard" : "denim-lt"}
        >
          Sign in
        </FeltButton>
        <FeltButton
          onClick={() => {
            setMode("sign-up");
            setError(null);
          }}
          tone={mode === "sign-up" ? "mustard" : "denim-lt"}
        >
          Sign up
        </FeltButton>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        {mode === "sign-up" && (
          <>
            <label htmlFor="name">Name</label>
            <FeltField>
              <input autoComplete="name" id="name" minLength={2} name="name" required />
            </FeltField>
          </>
        )}

        <label htmlFor="email">Email</label>
        <FeltField>
          <input
            autoComplete="email"
            id="email"
            name="email"
            required
            type="email"
          />
        </FeltField>

        <label htmlFor="password">Password</label>
        <FeltField>
          <input
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            id="password"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </FeltField>

        {error && <p className={styles.error}>{error}</p>}

        <FeltButton
          className={styles.submit}
          disabled={pending}
          tone="brick"
          type="submit"
        >
          {pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </FeltButton>
      </form>
    </>
  );
}
