"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email: `${username.toLowerCase()}@dogathon.local`,
            name: username,
            username,
            password,
          })
        : await authClient.signIn.username({ username, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }

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
        <label htmlFor="username">Username</label>
        <input
          autoComplete="username"
          id="username"
          minLength={3}
          name="username"
          pattern="[A-Za-z0-9_]+"
          required
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
