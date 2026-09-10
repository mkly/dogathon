"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton, FeltField } from "@/components/felt";
import { authClient } from "@/lib/auth-client";

import { AuthModeTabs, type AuthMode } from "./auth-mode-tabs";
import styles from "./auth-form.module.css";

type AuthFormProps = {
  fixedEmail?: string;
  hiddenTabs?: boolean;
  initialMode?: AuthMode;
  onAuthenticated?: () => Promise<string | void> | string | void;
  redirectTo?: string;
};

export function AuthForm({
  fixedEmail,
  hiddenTabs = false,
  initialMode = "sign-in",
  onAuthenticated,
  redirectTo = "/staff/organizations",
}: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
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

    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Something went wrong.");
      return;
    }

    if (onAuthenticated) {
      const destination = await onAuthenticated();
      if (typeof destination === "string") {
        router.push(destination);
      }
      return;
    }

    router.push(redirectTo);
  }

  return (
    <>
      {!hiddenTabs && (
        <AuthModeTabs
          button={FeltButton}
          className={styles.tabs}
          mode={mode}
          onSelect={(nextMode) => {
            setMode(nextMode);
            setError(null);
          }}
        />
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        {mode === "sign-up" && (
          <>
            <label htmlFor="name">Name</label>
            <FeltField>
              <input
                autoComplete="name"
                id="name"
                minLength={2}
                name="name"
                required
              />
            </FeltField>
          </>
        )}

        <label htmlFor="email">Email</label>
        <FeltField>
          <input
            autoComplete="email"
            defaultValue={fixedEmail}
            id="email"
            name="email"
            readOnly={fixedEmail !== undefined}
            required
            type="email"
          />
        </FeltField>

        <label htmlFor="password">Password</label>
        <FeltField>
          <input
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            id="password"
            minLength={8}
            name="password"
            required
            type="password"
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
          tone="brick"
          type="submit"
        >
          {pending
            ? "Please wait…"
            : mode === "sign-up"
              ? hiddenTabs
                ? "Create your account"
                : "Create account"
              : "Sign in"}
        </FeltButton>
      </form>
    </>
  );
}
