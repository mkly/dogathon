"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { AdminField } from "@/components/admin-ui";
import { startCheckIn } from "./actions";
import { VolunteerPhoto } from "./volunteer-ui";
import styles from "./volunteer.module.css";

type Companion = { id: string; name: string; breed: string; photoUrl?: string };

function CompanionButton({ companion }: { companion: Companion }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.companionCard} disabled={pending} type="submit">
      <VolunteerPhoto
        className={styles.cardPhoto}
        sizes="(min-width: 42rem) 240px, 88px"
        src={companion.photoUrl}
      />
      <span className={styles.cardCopy}>
        <span className={styles.cardName}>{companion.name}</span>
        <span className={styles.cardBreed}>{companion.breed}</span>
        <span className={styles.cardAction}>
          {pending ? "Opening…" : "Share an update"}
          <span aria-hidden="true"> →</span>
        </span>
      </span>
    </button>
  );
}

export function CompanionPicker({
  companions,
  orgSlug,
}: {
  companions: Companion[];
  orgSlug: string;
}) {
  const [search, setSearch] = useState("");
  const visible = companions.filter((companion) =>
    `${companion.name} ${companion.breed}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <section aria-labelledby="new-update-heading">
      <h2 className={styles.pickerHeading} id="new-update-heading">
        Start a new update
      </h2>
      {companions.length > 4 ? (
        <AdminField className={styles.searchField}>
          <label className={styles.srOnly} htmlFor="companion-search">
            Find a companion
          </label>
          <input
            id="companion-search"
            type="search"
            placeholder="Find a companion"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </AdminField>
      ) : null}
      <div className={styles.companionPicker}>
        {visible.map((companion) => (
          <form
            action={startCheckIn.bind(null, orgSlug, companion.id)}
            key={companion.id}
          >
            <CompanionButton companion={companion} />
          </form>
        ))}
      </div>
      {visible.length === 0 ? (
        <p role="status">No companions match “{search}”. Try another name.</p>
      ) : null}
    </section>
  );
}
