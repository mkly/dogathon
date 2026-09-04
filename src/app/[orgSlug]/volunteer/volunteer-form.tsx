"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { FeltButton, FeltField, FeltPanel } from "@/components/felt";

import styles from "./volunteer.module.css";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function VolunteerPhotoInput() {
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_PHOTO_BYTES) {
      inputRef.current.value = "";
      setPreview("");
      setError(!file.type.startsWith("image/") ? "Choose an image file." : "Choose a photo smaller than 8 MB.");
      return;
    }
    setError("");
    setPreview(URL.createObjectURL(file));
  }

  return (
    <>
      <FeltField className={`${styles.noteField} ${styles.photoField}`}>
        <input accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" id="photo" name="photo" onChange={onChange} ref={inputRef} type="file" />
      </FeltField>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {preview ? <img alt="Selected photo preview" className={styles.preview} src={preview} /> : null}
    </>
  );
}

export function VolunteerSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <FeltButton className={styles.submit} disabled={disabled || pending} tone="brick" type="submit">{pending ? "Uploading pup-date…" : "Send pup-date"}</FeltButton>;
}
