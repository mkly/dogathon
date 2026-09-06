/** Shared by the server-rendered queue notice and the disabled Approve buttons
 *  it explains, so the two never drift apart. */
export const EMAIL_CONNECTOR_NOTICE_ID = "email-connector-approval-notice";

export function emailConnectorBlockedReason() {
  return "Connect the email address pupdates are sent from before approving them.";
}
