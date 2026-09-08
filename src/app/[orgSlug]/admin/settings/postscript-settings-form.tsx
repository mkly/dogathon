"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { POSTSCRIPT_MAX_LENGTH } from "@/lib/postscript";
import { pushToast } from "@/lib/toast";

import { saveSettings, type SettingsState } from "../actions";
import { richTextEditorClassNames } from "../admin-controls";
import styles from "../admin.module.css";

const initialSettingsState: SettingsState = { status: "idle", message: "" };

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
  const [overLimit, setOverLimit] = useState(
    pinnedPostscript.length > POSTSCRIPT_MAX_LENGTH,
  );
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
        Email postscript
      </label>
      <AdminField className={styles.richTextEditorField}>
        <MarkdownEditor
          classNames={richTextEditorClassNames}
          defaultValue={pinnedPostscript}
          disabled={pending}
          id="pinnedPostscript"
          labelledBy="pinnedPostscriptLabel"
          maxLength={POSTSCRIPT_MAX_LENGTH}
          name="pinnedPostscript"
          onValidityChange={handleValidityChange}
          placeholder="Thank you for sponsoring. Our adoption fair is on the first Saturday of the month."
        />
      </AdminField>
      <div className={styles.saveRow}>
        <AdminButton
          className={styles.postscriptButton}
          disabled={pending || overLimit}
          tone="mustard"
          type="submit"
        >
          {pending ? "Saving…" : "Save postscript"}
        </AdminButton>
      </div>
    </form>
  );
}
