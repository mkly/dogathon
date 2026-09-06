"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";
import {
  PostscriptEditor,
  type PostscriptEditorClassNames,
} from "@/components/postscript-editor";
import { pushToast } from "@/lib/toast";

import { saveSettings, type SettingsState } from "../actions";
import styles from "../admin.module.css";

const initialSettingsState: SettingsState = { status: "idle", message: "" };

const editorClassNames: PostscriptEditorClassNames = {
  counter: styles.postscriptCounter,
  counterOverLimit: styles.postscriptCounterOverLimit,
  editorContent: styles.postscriptEditorContent,
  editorSurface: styles.postscriptEditorSurface,
  loading: styles.postscriptEditorLoading,
  preview: styles.postscriptPreview,
  root: styles.postscriptEditor,
  toolbar: styles.postscriptToolbar,
  toolbarButton: styles.postscriptToolbarButton,
};

export function PostscriptSettingsForm({
  orgSlug,
  pinnedPostscript,
}: {
  orgSlug: string;
  pinnedPostscript: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveSettings,
    initialSettingsState,
  );
  const [overLimit, setOverLimit] = useState(pinnedPostscript.length > 2000);
  const handleValidityChange = useCallback((nextOverLimit: boolean) => {
    setOverLimit(nextOverLimit);
  }, []);

  useEffect(() => {
    if (state.status === "idle") return;
    pushToast(state.status, state.message);
  }, [state]);

  return (
    <form action={formAction} aria-busy={pending} className={styles.settingsForm}>
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <label htmlFor="pinnedPostscript" id="pinnedPostscriptLabel">
        This month&apos;s postscript
      </label>
      <AdminField className={styles.postscriptEditorField}>
        <PostscriptEditor
          classNames={editorClassNames}
          defaultValue={pinnedPostscript}
          disabled={pending}
          id="pinnedPostscript"
          labelledBy="pinnedPostscriptLabel"
          maxLength={2000}
          name="pinnedPostscript"
          onValidityChange={handleValidityChange}
        />
      </AdminField>
      <div className={styles.saveRow}>
        <AdminButton
          className={styles.postscriptButton}
          disabled={pending || overLimit}
          tone="mustard"
          type="submit"
        >
          {pending ? "Pinning…" : "Save & pin 📌"}
        </AdminButton>
      </div>
    </form>
  );
}
