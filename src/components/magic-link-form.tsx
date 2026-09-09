"use client";

import { FormEvent, useState } from "react";

import { FeltButton, FeltField } from "@/components/felt";
import { authClient } from "@/lib/auth-client";

import styles from "./auth-form.module.css";

export function MagicLinkForm() {
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const result = await authClient.signIn.magicLink({
      callbackURL: "/account",
      email,
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "We couldn't send your sign-in link.");
      return;
    }

    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <div className={styles.success} role="status">
        <h2>Check your email</h2>
        <p>We sent you a secure sign-in link. It expires in 5 minutes.</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="sponsor-email">Email</label>
      <FeltField>
        <input
          autoComplete="email"
          id="sponsor-email"
          name="email"
          required
          type="email"
        />
      </FeltField>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <FeltButton
        className={styles.submit}
        disabled={pending}
        tone="mustard"
        type="submit"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </FeltButton>
    </form>
  );
}
