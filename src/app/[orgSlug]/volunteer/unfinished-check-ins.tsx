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

export function UnfinishedCheckIns({ checkIns, orgSlug }: { checkIns: UnfinishedCheckIn[]; orgSlug: string }) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const visible = checkIns.filter((checkIn) => !removed.includes(checkIn.id));
  if (visible.length === 0) return null;

  function discard(checkIn: UnfinishedCheckIn) {
    setRemoved((current) => [...current, checkIn.id]);
    startTransition(async () => {
      try {
        await discardCheckIn(orgSlug, checkIn.id);
        pushToast("success", `Removed the unfinished check-in for ${checkIn.resident.name}.`);
      } catch {
        setRemoved((current) => current.filter((id) => id !== checkIn.id));
        pushToast("error", `The check-in for ${checkIn.resident.name} could not be removed.`);
      }
    });
  }

  return (
    <>
      <h2 className={styles.pickerHeading}>Pick up where you left off</h2>
      <ul aria-label="Unfinished check-ins" className={styles.resumeList}>
        {visible.map((checkIn) => (
          <li className={styles.resumeRow} key={checkIn.id}>
            <FeltLink className={styles.resumeLink} href={`/${orgSlug}/volunteer/${checkIn.id}`} tone="oatmeal">
              <PhotoPatch alt="" className={styles.resumePhoto} sizes="3.25rem" src={checkIn.resident.photoUrls[0]} />
              <span className={styles.resumeCopy}>
                <span className={styles.cardName}>{checkIn.resident.name}</span>
                <span className={styles.cardBreed}>{checkIn.resident.breed}</span>
              </span>
              <span className={clsx(felt["felt-button"], "felt-moss", styles.cardAction, styles.resumeAction)}>Continue</span>
            </FeltLink>
            <button
              className={clsx(felt["felt-button"], "felt-cream", styles.cardAction, styles.discardButton)}
              onClick={() => discard(checkIn)}
              type="button"
            >
              Discard<span className={styles.srOnly}> the unfinished check-in for {checkIn.resident.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <h2 className={styles.pickerHeading}>Start a new check-in</h2>
    </>
  );
}
