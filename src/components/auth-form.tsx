"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

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
      <div className="tabs" aria-label="Authentication mode">
        <button
          className={mode === "sign-in" ? "active" : "secondary"}
          onClick={() => {
            setMode("sign-in");
            setError(null);
          }}
          type="button"
        >
          Sign in
        </button>
        <button
          className={mode === "sign-up" ? "active" : "secondary"}
          onClick={() => {
            setMode("sign-up");
            setError(null);
          }}
          type="button"
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "sign-up" && (
          <>
            <label htmlFor="name">Name</label>
            <input autoComplete="name" id="name" minLength={2} name="name" required />
          </>
        )}

        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />

        <label htmlFor="password">Password</label>
        <input
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />

        {error && <p className="error">{error}</p>}

        <button className="primary" disabled={pending} type="submit">
          {pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>
    </>
  );
}
