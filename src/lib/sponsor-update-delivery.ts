import pMap from "p-map";

import {
  createOrganizationEmailSender,
  type DescribedSend,
  type EmailInput,
} from "./email-connectors.ts";

export type SponsorUpdateType = "regular" | "graduation";

export type RecipientSponsorship = {
  status: "active" | "awaiting" | "ended";
};

export function isRegularSponsorUpdateRecipient(
  sponsorship: RecipientSponsorship,
  residentAvailable: boolean,
): boolean {
  return residentAvailable && sponsorship.status === "active";
}

export type DeliverySponsorship = {
  id: string;
  sponsor: {
    email: string;
  };
};

export type SponsorUpdateForDelivery = {
  subject: string;
  bodyText: string;
  /** The themed HTML email. Falls back to bodyText when it is not supplied. */
  bodyHtml?: string;
};

export type Delivery = {
  sponsorshipId: string;
  channel: "email";
  status: "sent" | "failed";
  error?: string;
  /** Present when no credential was configured and the send was only described. */
  describedSend?: DescribedSend;
};

type EmailSender = (input: EmailInput) => Promise<DescribedSend | null | void>;
type EmailSenderFactory = (orgId: string) => Promise<EmailSender>;

export function companionPageUrl(origin: string, orgSlug: string, residentId: string): string {
  return new URL(
    `/${encodeURIComponent(orgSlug)}/companions/${encodeURIComponent(residentId)}`,
    origin,
  ).toString();
}

export function updatePageUrl(origin: string, orgSlug: string, updateId: string): string {
  return new URL(
    `/${encodeURIComponent(orgSlug)}/updates/${encodeURIComponent(updateId)}`,
    origin,
  ).toString();
}

/**
 * Stored photo URLs are relative whenever S3 is not configured, and resident
 * photos are app-relative assets, so an email hero has to be absolute or the
 * mail client shows a broken image.
 */
export function emailPhotoUrl(origin: string, photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  try {
    return new URL(photoUrl, origin).toString();
  } catch {
    return null;
  }
}

/**
 * One send failure must not abandon the rest of the fan-out, nor strand the
 * update mid-approval, so every attempt is recorded rather than thrown.
 */
async function attempt(
  send: () => Promise<DescribedSend | null | void>,
  sponsorshipId: string,
  channel: Delivery["channel"],
): Promise<Delivery> {
  try {
    const described = await send();
    return {
      sponsorshipId,
      channel,
      status: "sent",
      ...(described ? { describedSend: described } : {}),
    };
  } catch (error) {
    return {
      sponsorshipId,
      channel,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deliverSponsorUpdate(
  orgId: string,
  sponsorUpdate: SponsorUpdateForDelivery,
  sponsorships: DeliverySponsorship[],
  createEmailSender: EmailSenderFactory = createOrganizationEmailSender,
): Promise<Delivery[]> {
  const sendEmail = await createEmailSender(orgId);
  return pMap(
    sponsorships,
    (sponsorship) =>
      attempt(
        () =>
          sendEmail({
            to: sponsorship.sponsor.email,
            subject: sponsorUpdate.subject,
            body: sponsorUpdate.bodyHtml ?? sponsorUpdate.bodyText,
            contentType: sponsorUpdate.bodyHtml ? "html" : "plain",
          }),
        sponsorship.id,
        "email",
      ),
    { concurrency: 4, stopOnError: false },
  );
}
