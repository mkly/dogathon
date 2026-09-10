"use client";

import { useActionState, useState } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";
import styles from "./organizations.module.css";
import {
  organizationSlug,
  organizationSlugWhileTyping,
} from "@/lib/organization-slug-client";

import { createOrganization } from "./actions";

const initialState = { error: "" };

export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState(
    createOrganization,
    initialState,
  );
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={formAction} className={styles.form}>
      <label htmlFor="organization-name">Rescue name</label>
      <AdminField>
        <input
          id="organization-name"
          name="name"
          onChange={(event) => {
            if (!slugEdited)
              setSlug(organizationSlug(event.currentTarget.value));
          }}
          required
        />
      </AdminField>
      <label htmlFor="organization-slug">Rescue URL name</label>
      <AdminField>
        <input
          aria-describedby="organization-slug-help"
          autoCapitalize="none"
          spellCheck={false}
          id="organization-slug"
          name="slug"
          onBlur={() => setSlug(organizationSlug(slug))}
          onChange={(event) => {
            const nextSlug = organizationSlugWhileTyping(
              event.currentTarget.value,
            );
            setSlug(nextSlug);
            setSlugEdited(nextSlug.length > 0);
          }}
          pattern="[a-z0-9-]+"
          required
          value={slug}
        />
      </AdminField>
      <p className={styles.helper} id="organization-slug-help">
        Your public page will be at /{slug || "your-rescue"}. Use lowercase
        letters, numbers, and hyphens.
      </p>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <div className={styles.saveRow}>
        <AdminButton disabled={pending} tone="moss" type="submit">
          {pending ? "Creating…" : "Create organization"}
        </AdminButton>
      </div>
    </form>
  );
}
