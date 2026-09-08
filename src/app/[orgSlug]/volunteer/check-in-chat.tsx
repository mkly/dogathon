"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { FeltButton, PhotoPatch } from "@/components/felt";
import { messageText } from "@/lib/ui-message-text";

import { CheckInChatView, type CheckInResident } from "./check-in-chat-view";
import { MAX_PHOTO_BYTES } from "./photo-limits";
import styles from "./volunteer.module.css";

const READY_MARKER = "[[READY]]";
const MAX_PHOTO_MEGABYTES = MAX_PHOTO_BYTES / (1024 * 1024);

type UploadedPhoto = {
  file: File;
  id: string;
  previewUrl: string;
  status: "uploading" | "uploaded" | "failed";
  uploadedId?: string;
};

export type CheckInResult = {
  residentId: string;
  messages: UIMessage[];
  photoIds: string[];
};

type CheckInChatProps = {
  orgSlug: string;
  residents: CheckInResident[];
  onFinish: (result: CheckInResult) => Promise<void> | void;
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

export function CheckInChat({ orgSlug, residents, onFinish }: CheckInChatProps) {
  return (
    <CheckInChatView
      classNames={{
        chatFrame: styles.chatFrame,
        companionChip: styles.companionChip,
        companionPicker: styles.companionPicker,
      }}
      renderPhoto={(resident) => (
        <PhotoPatch
          alt=""
          className={styles.chipPhoto}
          sizes="40px"
          src={resident.photoUrl}
        />
      )}
      renderSession={(resident) => (
        <ChatSession
          key={resident.id}
          onFinish={onFinish}
          orgSlug={orgSlug}
          resident={resident}
        />
      )}
      residents={residents}
    />
  );
}

function ChatSession({
  orgSlug,
  resident,
  onFinish,
}: {
  orgSlug: string;
  resident: CheckInResident;
  onFinish: CheckInChatProps["onFinish"];
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/volunteer-checkin/chat",
      body: { orgSlug, residentId: resident.id },
    }),
    [orgSlug, resident.id],
  );
  const { error, messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [finishError, setFinishError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef(new Set<string>());

  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const hasReadyMarker = messages.some(
    (message) => message.role === "assistant" && messageText(message).includes(READY_MARKER),
  );
  const canFinish = hasReadyMarker || userMessageCount >= 3;
  const busy = status === "submitted" || status === "streaming";
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

  async function uploadPhoto(photo: UploadedPhoto) {
    setPhotos((current) => current.map((item) => (
      item.id === photo.id ? { ...item, status: "uploading" } : item
    )));
    const formData = new FormData();
    formData.set("photo", photo.file);
    formData.set("orgSlug", orgSlug);
    formData.set("residentId", resident.id);

    try {
      const response = await fetch("/api/volunteer-photos", { body: formData, method: "POST" });
      if (!response.ok) throw new Error("The photo could not be uploaded.");
      const result = await response.json() as { id?: string };
      if (!result.id) throw new Error("The photo upload returned no id.");
      setPhotos((current) => current.map((item) => (
        item.id === photo.id
          ? { ...item, status: "uploaded", uploadedId: result.id }
          : item
      )));
    } catch {
      setPhotos((current) => current.map((item) => (
        item.id === photo.id ? { ...item, status: "failed" } : item
      )));
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
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      await onFinish({
        messages,
        photoIds: photos.flatMap((photo) => photo.uploadedId ? [photo.uploadedId] : []),
        residentId: resident.id,
      });
    } catch {
      setFinishError("We could not finish this check-in. Please try again.");
      setFinishing(false);
    }
  }

  return (
    <div className={styles.session}>
      <div className={styles.thread}>
        {messages.length === 0 ? (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            Start with what you and {resident.name} did together today.
          </div>
        ) : null}

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

        {photos.length > 0 ? (
          <div aria-label="Photos for this check-in" className={styles.photoThread} role="group">
            {photos.map((photo) => (
              <div className={styles.photoTile} key={photo.id}>
                <Image alt="Selected check-in photo" height={96} src={photo.previewUrl} unoptimized width={96} />
                <span className={styles.photoStatus}>
                  {photo.status === "uploading" ? "Uploading…" : null}
                  {photo.status === "uploaded" ? "Ready" : null}
                  {photo.status === "failed" ? "Upload failed" : null}
                </span>
                {photo.status === "failed" ? (
                  <button aria-label="Retry photo upload" onClick={() => void uploadPhoto(photo)} type="button">Retry</button>
                ) : null}
                <button aria-label="Remove photo" onClick={() => removePhoto(photo)} type="button">×</button>
              </div>
            ))}
          </div>
        ) : null}

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
            onChange={(event) => selectPhotos(event.target.files)}
            ref={fileInputRef}
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
