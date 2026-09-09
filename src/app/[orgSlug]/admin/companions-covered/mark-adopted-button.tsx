"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import pluralize from "pluralize";
import { useState, useTransition } from "react";

import { AdminButton, AdminSurface } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { markResidentAdopted, refreshAdminPage } from "../actions";
import styles from "../admin.module.css";

export function MarkAdoptedButton({
  orgSlug,
  residentId,
  residentName,
}: {
  orgSlug: string;
  residentId: string;
  residentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("orgSlug", orgSlug);
        formData.set("residentId", residentId);
        const { drafted } = await markResidentAdopted(formData);
        await refreshAdminPage();
        pushToast(
          "success",
          drafted === 0
            ? `${residentName} is marked adopted.`
            : `${residentName} is marked adopted. ${drafted} adoption ${pluralize("notice", drafted)} ready for review in the staff room.`,
        );
      } catch (error) {
        pushToast(
          "error",
          error instanceof Error
            ? error.message
            : "Mark adopted could not reach the server.",
        );
      }
    });
  }

  return (
    <AlertDialog.Root onOpenChange={setOpen} open={open}>
      <AlertDialog.Trigger asChild>
        <AdminButton disabled={pending} tone="mustard">
          {pending ? "Marking…" : "Mark adopted"}
        </AdminButton>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.dialogOverlay} />
        <AlertDialog.Content className={styles.alertDialog}>
          <AdminSurface className={styles.dialogPanel} tone="oatmeal">
            <AlertDialog.Title asChild>
              <h2>Mark {residentName} adopted?</h2>
            </AlertDialog.Title>
            <AlertDialog.Description className={styles.dialogDescription}>
              {residentName} leaves the public roster and an adoption notice is
              drafted for each active sponsorship. The sponsorship keeps
              renewing while staff review the notice and while the sponsor
              chooses who to follow next.
            </AlertDialog.Description>
            <div className={styles.modalActions}>
              <AlertDialog.Cancel asChild>
                <AdminButton tone="oatmeal">Cancel</AdminButton>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <AdminButton onClick={confirm} tone="mustard">
                  Mark adopted
                </AdminButton>
              </AlertDialog.Action>
            </div>
          </AdminSurface>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
