"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, useTransition } from "react";

import { AdminButton, AdminField, AdminSurface } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import {
  endStaffAwaitingSponsorship,
  refreshAdminPage,
  transferAwaitingSponsorship,
} from "../../actions";
import styles from "../sponsors.module.css";

type AvailableResident = { id: string; name: string };

export function AwaitingSponsorshipControls({
  availableResidents,
  formerCompanionName,
  orgSlug,
  sponsorshipId,
}: {
  availableResidents: AvailableResident[];
  formerCompanionName: string;
  orgSlug: string;
  sponsorshipId: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [residentId, setResidentId] = useState(availableResidents[0]?.id ?? "");
  const [pendingAction, setPendingAction] = useState<"end" | "transfer" | null>(null);
  const [, startTransition] = useTransition();

  function transfer() {
    if (!residentId) return;
    setPendingAction("transfer");
    startTransition(async () => {
      try {
        const result = await transferAwaitingSponsorship({
          orgSlug,
          residentId,
          sponsorshipId,
        });
        await refreshAdminPage();
        pushToast(result.ok ? "success" : "error", result.message);
      } catch {
        pushToast("error", "The transfer could not reach the server. Try again.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function end() {
    setPendingAction("end");
    startTransition(async () => {
      try {
        const result = await endStaffAwaitingSponsorship({ orgSlug, sponsorshipId });
        await refreshAdminPage();
        pushToast(result.ok ? "success" : "error", result.message);
      } catch {
        pushToast("error", "The sponsorship could not be ended. Try again.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className={styles.awaitingControls}>
      <AdminField className={styles.transferPicker}>
        <select
          aria-label={`New companion after ${formerCompanionName}`}
          disabled={pendingAction !== null || availableResidents.length === 0}
          onChange={(event) => setResidentId(event.target.value)}
          value={residentId}
        >
          {availableResidents.length === 0 ? (
            <option value="">No companions available</option>
          ) : availableResidents.map((resident) => (
            <option key={resident.id} value={resident.id}>{resident.name}</option>
          ))}
        </select>
      </AdminField>
      <AdminButton
        disabled={pendingAction !== null || !residentId}
        onClick={transfer}
        tone="denim"
      >
        {pendingAction === "transfer" ? "Transferring…" : "Transfer"}
      </AdminButton>

      <AlertDialog.Root onOpenChange={setDialogOpen} open={dialogOpen}>
        <AlertDialog.Trigger asChild>
          <AdminButton disabled={pendingAction !== null} tone="brick">
            {pendingAction === "end" ? "Ending…" : "End"}
          </AdminButton>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content className={styles.alertDialog}>
            <AdminSurface className={styles.dialogPanel} tone="oatmeal">
              <AlertDialog.Title asChild>
                <h2>End this sponsorship?</h2>
              </AlertDialog.Title>
              <AlertDialog.Description className={styles.dialogDescription}>
                The recurring charge will be canceled instead of moving the sponsorship from
                {` ${formerCompanionName}`} to a new companion. The sponsor will receive a confirmation email.
              </AlertDialog.Description>
              <div className={styles.dialogActions}>
                <AlertDialog.Cancel asChild>
                  <AdminButton tone="oatmeal">Keep awaiting</AdminButton>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <AdminButton onClick={end} tone="brick">End sponsorship</AdminButton>
                </AlertDialog.Action>
              </div>
            </AdminSurface>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
