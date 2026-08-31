import {
  sendOrganizationEmail,
  type DescribedSend,
  type EmailInput,
} from "./email-connectors.ts";

export type DeliverySponsorship = {
  id: string;
  sponsorEmail: string;
  sponsorPhone: string | null;
  channel: "email" | "sms" | "both";
};

export type PupdateForDelivery = {
  subject: string;
  bodyText: string;
  smsText: string;
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

type EmailSender = (
  orgId: string,
  input: EmailInput,
) => Promise<DescribedSend | null | void>;

export function dogPageUrl(origin: string, residentId: string): string {
  return new URL(`/dogs/${encodeURIComponent(residentId)}`, origin).toString();
}

/**
 * One send failure must not abandon the rest of the fan-out, nor strand the
 * pupdate mid-approval, so every attempt is recorded rather than thrown.
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

export async function deliverPupdate(
  orgId: string,
  pupdate: PupdateForDelivery,
  sponsorships: DeliverySponsorship[],
  sendEmail: EmailSender = sendOrganizationEmail,
): Promise<Delivery[]> {
  const deliveries: Delivery[] = [];

  for (const sponsorship of sponsorships) {
    deliveries.push(
      await attempt(
        () =>
          sendEmail(orgId, {
            to: sponsorship.sponsorEmail,
            subject: pupdate.subject,
            body: pupdate.bodyHtml ?? pupdate.bodyText,
            contentType: pupdate.bodyHtml ? "html" : "plain",
          }),
        sponsorship.id,
        "email",
      ),
    );
  }

  return deliveries;
}
