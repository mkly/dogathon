"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";

import { FeltLink, PhotoPatch } from "@/components/felt";
import felt from "@/components/felt.module.css";
import { pushToast } from "@/lib/toast";

import { discardCheckIn } from "./actions";
import styles from "./volunteer.module.css";

export type UnfinishedCheckIn = {
  id: string;
  resident: { name: string; breed: string; photoUrls: string[] };
};

export function UnfinishedCheckIns({
  checkIns,
  orgSlug,
}: {
  checkIns: UnfinishedCheckIn[];
  orgSlug: string;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const visible = checkIns.filter((checkIn) => !removed.includes(checkIn.id));
  if (visible.length === 0) return null;

  function discard(checkIn: UnfinishedCheckIn) {
    setConfirming(null);
    setRemoved((current) => [...current, checkIn.id]);
    startTransition(async () => {
      try {
        await discardCheckIn(orgSlug, checkIn.id);
        pushToast(
          "success",
          `Removed the unfinished update for ${checkIn.resident.name}.`,
        );
      } catch {
        setRemoved((current) => current.filter((id) => id !== checkIn.id));
        pushToast(
          "error",
          `The update for ${checkIn.resident.name} could not be removed.`,
        );
      }
    });
  }

  return (
    <>
      <h2 className={styles.pickerHeading}>Pick up where you left off</h2>
      <ul aria-label="Unfinished updates" className={styles.resumeList}>
        {visible.map((checkIn) => (
          <li
            className={clsx(
              felt["felt-button"],
              "felt-oatmeal",
              styles.resumeRow,
            )}
            key={checkIn.id}
          >
            <PhotoPatch
              alt=""
              className={styles.resumePhoto}
              sizes="3.25rem"
              src={checkIn.resident.photoUrls[0]}
            />
            <span className={styles.resumeCopy}>
              <span className={styles.cardName}>{checkIn.resident.name}</span>
              <span className={styles.cardBreed}>{checkIn.resident.breed}</span>
            </span>
            {confirming === checkIn.id ? (
              <span className={styles.resumeActions}>
                <span className={styles.discardPrompt}>
                  Discard this update?
                </span>
                <button
                  className={clsx(
                    felt["felt-button"],
                    "felt-brick",
                    styles.cardAction,
                    styles.resumeAction,
                  )}
                  onClick={() => discard(checkIn)}
                  type="button"
                >
                  Discard
                  <span className={styles.srOnly}>
                    {" "}
                    the unfinished update for {checkIn.resident.name}
                  </span>
                </button>
                <button
                  className={styles.keepButton}
                  onClick={() => setConfirming(null)}
                  type="button"
                >
                  Keep
                </button>
              </span>
            ) : (
              <span className={styles.resumeActions}>
                <FeltLink
                  className={clsx(styles.cardAction, styles.resumeAction)}
                  href={`/${orgSlug}/volunteer/${checkIn.id}`}
                  tone="moss"
                >
                  Continue
                  <span className={styles.srOnly}>
                    {" "}
                    the update for {checkIn.resident.name}
                  </span>
                </FeltLink>
                <button
                  aria-label={`Discard the unfinished update for ${checkIn.resident.name}`}
                  className={styles.discardButton}
                  onClick={() => setConfirming(checkIn.id)}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2.4"
                    viewBox="0 0 20 20"
                  >
                    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
                  </svg>
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <h2 className={styles.pickerHeading}>Start a new update</h2>
    </>
  );
}
