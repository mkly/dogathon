"use client";

import { useChat } from "@ai-sdk/react";
import clsx from "clsx";
import { DefaultChatTransport, type UIMessage } from "ai";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { FeltButton } from "@/components/felt";
import felt from "@/components/felt.module.css";
import { messageText } from "@/lib/ui-message-text";

import { MAX_PHOTO_BYTES } from "./photo-limits";
import styles from "./volunteer.module.css";

const READY_MARKER = "[[READY]]";
const MAX_PHOTO_MEGABYTES = MAX_PHOTO_BYTES / (1024 * 1024);

type UploadedPhoto = {
  file: File;
  id: string;
  previewUrl: string;
  status: "uploading" | "uploaded" | "failed";
};

type CheckInChatProps = {
  checkInId: string;
  initialPhotos: { id: string; url: string }[];
  initialMessages: UIMessage[];
  orgSlug: string;
  resident: { id: string; name: string };
  onFinish: (checkInId: string) => Promise<void> | void;
};

function visibleMessageText(message: UIMessage) {
  const text = messageText(message).replaceAll(READY_MARKER, "");
  // The marker streams in token by token, so a trailing partial ("[[REA") has to
  // go as well or it flashes in the thread before the marker completes.
  for (let length = READY_MARKER.length - 1; length > 0; length -= 1) {
    if (text.endsWith(READY_MARKER.slice(0, length))) return text.slice(0, -length).trim();
  }
  return text.trim();
}

export function CheckInChat({
  checkInId,
  initialPhotos,
  initialMessages,
  orgSlug,
  resident,
  onFinish,
}: CheckInChatProps) {
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/volunteer-checkin/chat",
      body: { checkInId, orgSlug },
    }),
    [checkInId, orgSlug],
  );
  const { error, messages, sendMessage, status } = useChat({
    id: checkInId,
    messages: initialMessages,
    transport,
  });
  const [input, setInput] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [finishError, setFinishError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const openingRequestedRef = useRef(false);
  const previewUrlsRef = useRef(new Set<string>());

  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const hasReadyMarker = messages.some(
    (message) => message.role === "assistant" && messageText(message).includes(READY_MARKER),
  );
  const canFinish = hasReadyMarker || userMessageCount >= 3;
  const busy = status === "submitted" || status === "streaming";
  const uploadedPhotos = photos.filter((photo) => photo.status === "uploaded");
  const hasAttachedPhoto = initialPhotos.length > 0 || uploadedPhotos.length > 0;
  const completedAssistantMessages = messages.filter((message, index) => (
    message.role === "assistant" && !(busy && index === messages.length - 1)
  ));

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    threadEndRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, photos, status]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (
      hasAttachedPhoto
      && messages.length === 0
      && status === "ready"
      && !openingRequestedRef.current
    ) {
      openingRequestedRef.current = true;
      void sendMessage();
    }
  }, [hasAttachedPhoto, messages.length, sendMessage, status]);

  async function uploadPhoto(photo: UploadedPhoto) {
    const fallbackError = "The photo could not be uploaded. Please try again.";
    setPhotoError("");
    setPhotos((current) => current.map((item) => (
      item.id === photo.id ? { ...item, status: "uploading" } : item
    )));
    const formData = new FormData();
    formData.set("photo", photo.file);
    formData.set("orgSlug", orgSlug);
    formData.set("checkInId", checkInId);

    try {
      const response = await fetch("/api/volunteer-photos", { body: formData, method: "POST" });
      const result = await response.json() as { error?: string; id?: string; url?: string };
      if (!response.ok || !result.id || !result.url) {
        const message = result.error === "photo-size"
          ? `Each photo must be smaller than ${MAX_PHOTO_MEGABYTES} MB.`
          : result.error === "photo-type"
            ? "Choose a JPEG, PNG, GIF, or WebP image."
            : fallbackError;
        throw new Error(message);
      }
      const uploadedId = result.id;
      const uploadedUrl = result.url;
      setPhotos((current) => current.map((item) => (
        item.id === photo.id
          ? { ...item, id: uploadedId, previewUrl: uploadedUrl, status: "uploaded" }
          : item
      )));
      URL.revokeObjectURL(photo.previewUrl);
      previewUrlsRef.current.delete(photo.previewUrl);
    } catch (error) {
      setPhotos((current) => current.map((item) => (
        item.id === photo.id ? { ...item, status: "failed" } : item
      )));
      setPhotoError(
        error instanceof Error && [
          fallbackError,
          `Each photo must be smaller than ${MAX_PHOTO_MEGABYTES} MB.`,
          "Choose a JPEG, PNG, GIF, or WebP image.",
        ].includes(error.message)
          ? error.message
          : fallbackError,
      );
    }
  }

  function selectPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError("");
    const accepted: UploadedPhoto[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setPhotoError("Choose image files only.");
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoError(`Each photo must be smaller than ${MAX_PHOTO_MEGABYTES} MB.`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      accepted.push({
        file,
        id: crypto.randomUUID(),
        previewUrl,
        status: "uploading",
      });
    }

    if (accepted.length > 0) {
      setPhotos((current) => [...current, ...accepted]);
      accepted.forEach((photo) => void uploadPhoto(photo));
    }
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    selectPhotos(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function removePhoto(photo: UploadedPhoto) {
    URL.revokeObjectURL(photo.previewUrl);
    previewUrlsRef.current.delete(photo.previewUrl);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  async function finishCheckIn() {
    if (finishing) return;
    setFinishing(true);
    setFinishError("");
    try {
      await onFinish(checkInId);
    } catch {
      setFinishError("We could not finish this check-in. Please try again.");
      setFinishing(false);
    }
  }

  if (!hasAttachedPhoto) {
    return (
      <div className={`${styles.session} ${styles.photoStep}`}>
        <div className={styles.photoStepIntro}>
          <h2>Start with a photo</h2>
          <p>Take a quick photo of {resident.name}, then the conversation will begin.</p>
        </div>

        {photos.length > 0 ? (
          <div aria-label="Photo upload" className={styles.photoThread} role="group">
            {photos.map((photo) => (
              <div className={styles.photoTile} key={photo.id}>
                <Image alt={`Check-in photo of ${resident.name}`} height={96} src={photo.previewUrl} unoptimized width={96} />
                <span className={styles.photoStatus}>
                  {photo.status === "uploading" ? "Uploading…" : "Upload failed"}
                </span>
                {photo.status === "failed" ? (
                  <button aria-label="Retry photo upload" onClick={() => void uploadPhoto(photo)} type="button">Retry</button>
                ) : null}
                {photo.status === "failed" ? (
                  <button aria-label="Remove photo" onClick={() => removePhoto(photo)} type="button">×</button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {photoError ? <p className={styles.chatError} role="alert">{photoError}</p> : null}

        <label className={clsx(felt["felt-button"], "felt-denim", styles.cameraButton)}>
          Take a photo
          <input
            accept="image/*"
            capture="environment"
            onChange={choosePhotos}
            type="file"
          />
        </label>
        <label className={clsx(felt["felt-button"], "felt-cream", styles.choosePhotoButton)}>
          Choose a photo
          <input accept="image/*" onChange={choosePhotos} type="file" />
        </label>
      </div>
    );
  }

  return (
    <div className={styles.session}>
      <div className={styles.thread}>
        <div aria-label="Photos for this check-in" className={`${styles.photoThread} ${styles.openingPhotos}`} role="group">
          {initialPhotos.map((photo) => (
            <div className={styles.photoTile} key={photo.id}>
              <Image alt={`Check-in photo of ${resident.name}`} height={96} src={photo.url} unoptimized width={96} />
            </div>
          ))}
          {photos.map((photo) => (
            <div className={styles.photoTile} key={photo.id}>
              <Image alt={`Check-in photo of ${resident.name}`} height={96} src={photo.previewUrl} unoptimized width={96} />
              {photo.status === "uploaded" ? null : (
                <span className={styles.photoStatus}>
                  {photo.status === "uploading" ? "Uploading…" : "Upload failed"}
                </span>
              )}
              {photo.status === "failed" ? (
                <button aria-label="Retry photo upload" onClick={() => void uploadPhoto(photo)} type="button">Retry</button>
              ) : null}
              {photo.status === "failed" ? (
                <button aria-label="Remove photo" onClick={() => removePhoto(photo)} type="button">×</button>
              ) : null}
            </div>
          ))}
        </div>

        {messages.map((message) => {
          const text = visibleMessageText(message);
          if (!text) return null;
          return (
            <div
              className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}
              key={message.id}
            >
              {text}
            </div>
          );
        })}

        {busy ? <div className={`${styles.message} ${styles.assistantMessage} ${styles.typing}`}>Thinking…</div> : null}
        {error ? <p className={styles.chatError} role="alert">The interviewer paused. Send your message again.</p> : null}
        <div ref={threadEndRef} />
      </div>

      <div aria-live="polite" className={styles.srOnly}>
        {completedAssistantMessages.map((message) => (
          <span key={message.id}>{visibleMessageText(message)}</span>
        ))}
      </div>

      {canFinish ? (
        <div className={styles.finishRow}>
          <FeltButton
            className={styles.finishButton}
            disabled={finishing || photos.some((photo) => photo.status === "uploading")}
            onClick={() => void finishCheckIn()}
            tone="moss"
          >
            {finishing ? "Finishing…" : "Finish check-in"}
          </FeltButton>
        </div>
      ) : null}

      {finishError ? <p className={styles.chatError} role="alert">{finishError}</p> : null}
      {photoError ? <p className={styles.chatError} role="alert">{photoError}</p> : null}

      <form className={styles.composer} onSubmit={submitMessage}>
        <label className={styles.photoButton}>
          <span aria-hidden="true">＋</span>
          <span className={styles.srOnly}>Add photos</span>
          <input
            accept="image/*"
            multiple
            onChange={choosePhotos}
            type="file"
          />
        </label>
        <label className={styles.srOnly} htmlFor={`check-in-message-${resident.id}`}>Message</label>
        <input
          autoComplete="off"
          id={`check-in-message-${resident.id}`}
          maxLength={2000}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Tell me about ${resident.name}…`}
          value={input}
        />
        <button aria-label="Send message" disabled={busy || !input.trim()} type="submit">↑</button>
      </form>
    </div>
  );
}
