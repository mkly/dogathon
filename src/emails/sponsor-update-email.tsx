import { Heading, Section, Text } from "@react-email/components";

import {
  EMAIL_COLOR,
  EMAIL_FONT,
  EmailButton,
  EmailLayout,
  emailBodyTextStyle,
  emailHeadingStyle,
} from "./email-design";

export type SponsorUpdateEmailProps = {
  rescueName: string;
  companionName: string;
  updateSubject: string;
  teaser: string;
  updatePageUrl: string;
  photoUrl?: string | null;
  sponsorshipSelectionUrl?: string | null;
  type?: "regular" | "graduation";
};

export function sponsorUpdateEmailSubject(
  companionName: string,
  type: SponsorUpdateEmailProps["type"] = "regular",
): string {
  return type === "graduation"
    ? `${companionName.trim()} has been adopted`
    : `${companionName.trim()} has a new update`;
}

/** A short email notice that sends sponsors to the complete update online. */
export function SponsorUpdateEmail(input: SponsorUpdateEmailProps) {
  const rescueName = input.rescueName.trim();
  const companionName = input.companionName.trim();
  const updateSubject = input.updateSubject.trim();
  const graduation = input.type === "graduation";
  const headline = graduation
    ? sponsorUpdateEmailSubject(companionName, "graduation")
    : updateSubject;
  const preheader = graduation
    ? `${companionName} has been adopted. Read the story from ${rescueName}.`
    : `${companionName} has a new update from ${rescueName}.`;

  return (
    <EmailLayout
      footer={`An update from ${rescueName}`}
      label={rescueName}
      photoAlt={companionName}
      photoUrl={input.photoUrl}
      preview={preheader}
      title={headline}
    >
      <Heading as="h1" style={emailHeadingStyle}>
        {headline}
      </Heading>
      {graduation && updateSubject !== headline ? (
        <Heading
          as="h2"
          style={{
            color: EMAIL_COLOR.ink,
            fontFamily: EMAIL_FONT,
            fontSize: "18px",
            lineHeight: "1.4",
            margin: "0 0 10px",
          }}
        >
          {updateSubject}
        </Heading>
      ) : null}
      <Text style={{ ...emailBodyTextStyle, marginBottom: "24px" }}>
        {input.teaser.trim()}
      </Text>
      <EmailButton href={input.updatePageUrl}>
        {graduation ? `Read ${companionName}'s story` : "Read the update"}
      </EmailButton>

      {graduation && input.sponsorshipSelectionUrl ? (
        <Section
          style={{
            borderTop: `1px solid ${EMAIL_COLOR.rule}`,
            marginTop: "30px",
            paddingTop: "24px",
          }}
        >
          <Text style={{ ...emailBodyTextStyle, fontSize: "15px" }}>
            Your sponsorship can continue with another companion who could use
            your support.
          </Text>
          <EmailButton href={input.sponsorshipSelectionUrl}>
            Choose a new companion
          </EmailButton>
        </Section>
      ) : null}
    </EmailLayout>
  );
}

export default SponsorUpdateEmail;
