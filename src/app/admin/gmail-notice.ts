/** Shared by the server-rendered queue notice and the disabled Approve buttons
 *  it explains, so the two never drift apart. */
export const GMAIL_NOTICE_ID = "gmail-approval-notice";

export function gmailBlockedReason(gmailStatus?: string) {
  return gmailStatus === "not_configured"
    ? "Gmail sending is not configured on this server yet."
    : "Connect Gmail in staff tools to send approved pupdates.";
}
