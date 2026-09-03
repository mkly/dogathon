"use client";

import { useActionState, useState } from "react";

import { FeltButton, FeltField } from "@/components/felt";
import { organizationSlug, organizationSlugWhileTyping } from "@/lib/organization-slug-client";

import { createOrganization } from "./actions";

const initialState = { error: "" };

export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={formAction}>
      <FeltField>
        <input
          name="name"
          onChange={(event) => {
            if (!slugEdited) setSlug(organizationSlug(event.currentTarget.value));
          }}
          placeholder="Rescue name"
          required
        />
      </FeltField>
      <FeltField>
        <input
          name="slug"
          onBlur={() => setSlug(organizationSlug(slug))}
          onChange={(event) => {
            const nextSlug = organizationSlugWhileTyping(event.currentTarget.value);
            setSlug(nextSlug);
            setSlugEdited(nextSlug.length > 0);
          }}
          pattern="[a-z0-9-]+"
          placeholder="rescue-slug"
          required
          value={slug}
        />
      </FeltField>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <FeltButton disabled={pending} tone="moss" type="submit">
        {pending ? "Creating…" : "Create organization"}
      </FeltButton>
    </form>
  );
}
