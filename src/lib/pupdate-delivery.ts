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

export async function deliverPupdate(
  pupdate: PupdateForDelivery,
  sponsorships: DeliverySponsorship[],
  dogUrl: string,
  senders: Senders = { email: sendEmail, sms: sendSms },
): Promise<Delivery[]> {
  const deliveries: Delivery[] = [];

  for (const sponsorship of sponsorships) {
    if (sponsorship.channel === "email" || sponsorship.channel === "both") {
      await senders.email({
        to: sponsorship.sponsorEmail,
        subject: pupdate.subject,
        body: pupdate.bodyText,
      });
      deliveries.push({ sponsorshipId: sponsorship.id, channel: "email" });
    }

    if (
      (sponsorship.channel === "sms" || sponsorship.channel === "both") &&
      sponsorship.sponsorPhone
    ) {
      await senders.sms({
        to: sponsorship.sponsorPhone,
        body: smsWithDogLink(pupdate.smsText, dogUrl),
      });
      deliveries.push({ sponsorshipId: sponsorship.id, channel: "sms" });
    }
  }

  return deliveries;
}
