import { sendEmail, sendSms } from "./arcade.ts";

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
};

export type Delivery = {
  sponsorshipId: string;
  channel: "email" | "sms";
  status: "sent" | "failed";
  error?: string;
};

type Senders = {
  email: typeof sendEmail;
  sms: typeof sendSms;
};

export function dogPageUrl(origin: string, residentId: string): string {
  return new URL(`/dogs/${encodeURIComponent(residentId)}`, origin).toString();
}

function smsWithDogLink(body: string, link: string): string {
  return body.includes(link) ? body : `${body.trim()} ${link}`;
}

/**
 * One send failure must not abandon the rest of the fan-out, nor strand the
 * pupdate mid-approval, so every attempt is recorded rather than thrown.
 */
async function attempt(
  send: () => Promise<unknown>,
  sponsorshipId: string,
  channel: Delivery["channel"],
): Promise<Delivery> {
  try {
    await send();
    return { sponsorshipId, channel, status: "sent" };
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
  pupdate: PupdateForDelivery,
  sponsorships: DeliverySponsorship[],
  dogUrl: string,
  senders: Senders = { email: sendEmail, sms: sendSms },
): Promise<Delivery[]> {
  const deliveries: Delivery[] = [];

  for (const sponsorship of sponsorships) {
    const phone = sponsorship.sponsorPhone;

    if (sponsorship.channel === "email" || sponsorship.channel === "both") {
      deliveries.push(
        await attempt(
          () =>
            senders.email({
              to: sponsorship.sponsorEmail,
              subject: pupdate.subject,
              body: pupdate.bodyText,
            }),
          sponsorship.id,
          "email",
        ),
      );
    }

    if (
      (sponsorship.channel === "sms" || sponsorship.channel === "both") &&
      phone
    ) {
      deliveries.push(
        await attempt(
          () =>
            senders.sms({
              to: phone,
              body: smsWithDogLink(pupdate.smsText, dogUrl),
            }),
          sponsorship.id,
          "sms",
        ),
      );
    }
  }

  return deliveries;
}
