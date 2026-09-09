"use client";

import { useChat } from "@ai-sdk/react";
import clsx from "clsx";
import { DefaultChatTransport, type UIMessage } from "ai";
import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FeltButton, Stitch } from "@/components/felt";
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
  onFinish: (checkInId: string, messages: UIMessage[]) => Promise<void> | void;
};

function visibleMessageText(message: UIMessage) {
  const text = messageText(message).replaceAll(READY_MARKER, "");
  // The marker streams in token by token, so a trailing partial ("[[REA") has to
  // go as well or it flashes in the thread before the marker completes.
  for (let length = READY_MARKER.length - 1; length > 0; length -= 1) {
    if (text.endsWith(READY_MARKER.slice(0, length)))
      return text.slice(0, -length).trim();
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
    () =>
      new DefaultChatTransport({
        api: "/api/volunteer-checkin/chat",
        body: { checkInId, orgSlug },
      }),
    [checkInId, orgSlug],
  );
  const { error, messages, sendMessage, status, stop } = useChat({
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

  const userMessageCount = messages.filter(
    (message) => message.role === "user",
  ).length;
  const hasReadyMarker = messages.some(
    (message) =>
      message.role === "assistant" &&
      messageText(message).includes(READY_MARKER),
  );
  const canFinish = hasReadyMarker || userMessageCount >= 3;
  const busy = status === "submitted" || status === "streaming";
  const uploadedPhotos = photos.filter((photo) => photo.status === "uploaded");
  const hasAttachedPhoto =
    initialPhotos.length > 0 || uploadedPhotos.length > 0;
  const completedAssistantMessages = messages.filter(
    (message, index) =>
      message.role === "assistant" && !(busy && index === messages.length - 1),
  );

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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
      hasAttachedPhoto &&
      messages.length === 0 &&
      status === "ready" &&
      !openingRequestedRef.current
    ) {
      openingRequestedRef.current = true;
      void sendMessage();
    }
  }, [hasAttachedPhoto, messages.length, sendMessage, status]);

  async function uploadPhoto(photo: UploadedPhoto) {
    const fallbackError = "The photo could not be uploaded. Please try again.";
    setPhotoError("");
    setPhotos((current) =>
      current.map((item) =>
        item.id === photo.id ? { ...item, status: "uploading" } : item,
      ),
    );
    const formData = new FormData();
    formData.set("photo", photo.file);
    formData.set("orgSlug", orgSlug);
    formData.set("checkInId", checkInId);

    try {
      const response = await fetch("/api/volunteer-photos", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        id?: string;
        url?: string;
      };
      if (!response.ok || !result.id || !result.url) {
        const message =
          result.error === "photo-size"
            ? `Each photo must be smaller than ${MAX_PHOTO_MEGABYTES} MB.`
            : result.error === "photo-type"
              ? "Choose a JPEG, PNG, GIF, or WebP image."
              : fallbackError;
        throw new Error(message);
      }
      const uploadedId = result.id;
      const uploadedUrl = result.url;
      setPhotos((current) =>
        current.map((item) =>
          item.id === photo.id
            ? {
                ...item,
                id: uploadedId,
                previewUrl: uploadedUrl,
                status: "uploaded",
              }
            : item,
        ),
      );
      URL.revokeObjectURL(photo.previewUrl);
      previewUrlsRef.current.delete(photo.previewUrl);
    } catch (error) {
      setPhotos((current) =>
        current.map((item) =>
          item.id === photo.id ? { ...item, status: "failed" } : item,
        ),
      );
      setPhotoError(
        error instanceof Error &&
          [
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
        setPhotoError(
          `Each photo must be smaller than ${MAX_PHOTO_MEGABYTES} MB.`,
        );
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
    // Cut off any reply still streaming; the update is built from what is on
    // screen, so a half-typed question is dropped.
    stop();
    const transcript = messages.filter(
      (message) => messageText(message).trim().length > 0,
    );
    try {
      await onFinish(checkInId, transcript);
    } catch {
      setFinishError("We could not finish this update. Please try again.");
      setFinishing(false);
    }
  }

  if (!hasAttachedPhoto) {
    const pending = photos[photos.length - 1];
    return (
      <div className={`${styles.session} ${styles.photoStep}`}>
        <div className={clsx(felt["photo-patch"], styles.photoWell)}>
          {pending ? (
            <Image
              alt={`Photo of ${resident.name}`}
              className={styles.photoWellImage}
              height={600}
              src={pending.previewUrl}
              unoptimized
              width={800}
            />
          ) : (
            <div className={styles.photoWellEmpty}>
              <span aria-hidden="true">📷</span>
              <strong>Start with a photo of {resident.name}</strong>
              <small>Whatever they’re up to right now is perfect.</small>
            </div>
          )}
          {pending ? (
            <div className={styles.photoWellStatus}>
              {pending.status === "uploading" ? "Uploading…" : "Upload failed"}
            </div>
          ) : null}
          <Stitch fine />
        </div>

        {photoError ? (
          <p className={styles.chatError} role="alert">
            {photoError}
          </p>
        ) : null}

        <div className={styles.photoActions}>
          {pending?.status === "failed" ? (
            <>
              <FeltButton
                className={styles.cameraButton}
                onClick={() => void uploadPhoto(pending)}
                tone="denim"
              >
                Try the upload again
              </FeltButton>
              <FeltButton
                className={styles.choosePhotoButton}
                onClick={() => removePhoto(pending)}
                tone="cream"
              >
                Pick a different photo
              </FeltButton>
            </>
          ) : (
            <>
              <label
                className={clsx(
                  felt["felt-button"],
                  "felt-denim",
                  styles.cameraButton,
                )}
              >
                Take a photo
                <input
                  accept="image/*"
                  capture="environment"
                  disabled={pending?.status === "uploading"}
                  onChange={choosePhotos}
                  type="file"
                />
              </label>
              <label
                className={clsx(
                  felt["felt-button"],
                  "felt-cream",
                  styles.choosePhotoButton,
                )}
              >
                Choose from your photos
                <input
                  accept="image/*"
                  disabled={pending?.status === "uploading"}
                  onChange={choosePhotos}
                  type="file"
                />
              </label>
            </>
          )}
        </div>
        <p className={styles.photoHint}>
          The conversation starts as soon as your photo lands.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.session}>
      <div className={styles.thread}>
        <div
          aria-label="Photos for this update"
          className={styles.photoThread}
          role="group"
        >
          {initialPhotos.map((photo) => (
            <figure
              className={clsx(felt["photo-patch"], styles.photoTile)}
              key={photo.id}
            >
              <Image
                alt={`Photo of ${resident.name}`}
                height={120}
                src={photo.url}
                unoptimized
                width={120}
              />
            </figure>
          ))}
          {photos.map((photo) => (
            <figure
              className={clsx(felt["photo-patch"], styles.photoTile)}
              key={photo.id}
            >
              <Image
                alt={`Photo of ${resident.name}`}
                height={120}
                src={photo.previewUrl}
                unoptimized
                width={120}
              />
              {photo.status === "uploaded" ? null : (
                <span className={styles.photoStatus}>
                  {photo.status === "uploading" ? "Uploading…" : "Failed"}
                </span>
              )}
              {photo.status === "failed" ? (
                <span className={styles.photoTileActions}>
                  <button
                    aria-label="Retry photo upload"
                    onClick={() => void uploadPhoto(photo)}
                    type="button"
                  >
                    Retry
                  </button>
                  <button
                    aria-label="Remove photo"
                    onClick={() => removePhoto(photo)}
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </figure>
          ))}
        </div>

        {messages.map((message) => {
          const text = visibleMessageText(message);
          if (!text) return null;
          return message.role === "user" ? (
            <div
              className={`${styles.message} ${styles.userMessage}`}
              key={message.id}
            >
              {text}
            </div>
          ) : (
            <div className={styles.assistantRow} key={message.id}>
              <span aria-hidden="true" className={styles.avatar}>
                🐾
              </span>
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                {text}
              </div>
            </div>
          );
        })}

        {busy ? (
          <div className={styles.assistantRow}>
            <span aria-hidden="true" className={styles.avatar}>
              🐾
            </span>
            <div
              aria-label="The interviewer is typing"
              className={`${styles.message} ${styles.assistantMessage} ${styles.typing}`}
              role="status"
            >
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className={styles.chatError} role="alert">
            The interviewer paused. Send your message again.
          </p>
        ) : null}
        <div ref={threadEndRef} />
      </div>

      <div aria-live="polite" className={styles.srOnly}>
        {completedAssistantMessages.map((message) => (
          <span key={message.id}>{visibleMessageText(message)}</span>
        ))}
      </div>

      <div className={styles.dock}>
        {canFinish ? (
          <div className={styles.finishRow}>
            <p>
              That’s plenty for an update. Add more if you like, or wrap up.
            </p>
            <FeltButton
              className={styles.finishButton}
              disabled={
                finishing ||
                photos.some((photo) => photo.status === "uploading")
              }
              onClick={() => void finishCheckIn()}
              stitched
              tone="mustard"
            >
              {finishing ? "Finishing…" : "Finish update"}
            </FeltButton>
          </div>
        ) : null}

        {finishError ? (
          <p className={styles.chatError} role="alert">
            {finishError}
          </p>
        ) : null}
        {photoError ? (
          <p className={styles.chatError} role="alert">
            {photoError}
          </p>
        ) : null}

        <form className={styles.composer} onSubmit={submitMessage}>
          <label
            className={clsx(
              felt["felt-button"],
              "felt-brick",
              styles.roundButton,
              styles.photoButton,
            )}
          >
            <span aria-hidden="true">＋</span>
            <span className={styles.srOnly}>Add photos</span>
            <input
              accept="image/*"
              multiple
              onChange={choosePhotos}
              type="file"
            />
          </label>
          <div
            className={clsx(
              felt["felt-field"],
              felt["felt-inset"],
              "felt-cream",
              styles.composerField,
            )}
          >
            <label
              className={styles.srOnly}
              htmlFor={`check-in-message-${resident.id}`}
            >
              Message
            </label>
            <input
              autoComplete="off"
              id={`check-in-message-${resident.id}`}
              maxLength={2000}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Tell me about ${resident.name}…`}
              value={input}
            />
          </div>
          <FeltButton
            aria-label="Send message"
            className={styles.roundButton}
            disabled={busy || !input.trim()}
            tone="denim"
            type="submit"
          >
            <span aria-hidden="true">↑</span>
          </FeltButton>
        </form>
      </div>
    </div>
  );
}
