import { Heading, Text } from "@react-email/components";

import { formatMonthlyAmount } from "../lib/format.ts";
import {
  EmailLayout,
  emailBodyTextStyle,
  emailHeadingStyle,
} from "./email-design";

type SponsorshipChoiceEmailProps = {
  companionName?: string;
  companionPhotoUrl?: string | null;
  monthlyCents: number;
  organizationName: string;
  sponsorName: string;
  type: "transferred" | "ended";
};

export function sponsorshipChoiceEmailSubject(
  input: Pick<
    SponsorshipChoiceEmailProps,
    "companionName" | "organizationName" | "type"
  >,
) {
  return input.type === "transferred"
    ? `You are now following ${input.companionName}`
    : `Thank you for sponsoring with ${input.organizationName}`;
}

export function SponsorshipChoiceEmail(input: SponsorshipChoiceEmailProps) {
  const transferred = input.type === "transferred";
  const subject = sponsorshipChoiceEmailSubject(input);

  return (
    <EmailLayout
      footer={`A sponsorship note from ${input.organizationName}`}
      label={input.organizationName}
      photoAlt={transferred ? input.companionName : undefined}
      photoUrl={transferred ? input.companionPhotoUrl : null}
      preview={subject}
      title={subject}
    >
      <Heading as="h1" style={{ ...emailHeadingStyle, fontSize: "28px" }}>
        {subject}
      </Heading>
      {transferred ? (
        <>
          <Text style={emailBodyTextStyle}>
            Hi {input.sponsorName}, you have chosen to follow{" "}
            {input.companionName}. Your{" "}
            {formatMonthlyAmount(input.monthlyCents)} monthly sponsorship with{" "}
            {input.organizationName} continues as usual.
          </Text>
          <Text style={{ ...emailBodyTextStyle, marginBottom: 0 }}>
            You can switch companions or cancel at any time from your
            sponsorship page.
          </Text>
        </>
      ) : (
        <Text style={{ ...emailBodyTextStyle, marginBottom: 0 }}>
          Hi {input.sponsorName}, we have canceled your monthly sponsorship with{" "}
          {input.organizationName}. You will not be charged again. Thank you for
          supporting the rescue.
        </Text>
      )}
    </EmailLayout>
  );
}

export default SponsorshipChoiceEmail;
