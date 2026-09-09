import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties } from "react";

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

const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const INK = "#1f2933";
const MUTED = "#5d6873";
const ACCENT = "#2f6651";

const buttonStyle: CSSProperties = {
  backgroundColor: ACCENT,
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontFamily: FONT,
  fontSize: "15px",
  fontWeight: 700,
  padding: "13px 22px",
  textDecoration: "none",
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
    <Html lang="en">
      <Head>
        <title>{headline}</title>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body
        style={{
          backgroundColor: "#f4f6f5",
          color: INK,
          fontFamily: FONT,
          margin: 0,
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e7e4",
            borderRadius: "12px",
            margin: "0 auto",
            maxWidth: "560px",
            overflow: "hidden",
            width: "100%",
          }}
        >
          {input.photoUrl ? (
            <Img
              alt={companionName}
              src={input.photoUrl}
              width="560"
              style={{
                display: "block",
                height: "auto",
                maxWidth: "560px",
                width: "100%",
              }}
            />
          ) : null}

          <Section style={{ padding: "34px 36px 36px" }}>
            <Text
              style={{
                color: ACCENT,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                margin: "0 0 12px",
                textTransform: "uppercase",
              }}
            >
              {rescueName}
            </Text>
            <Heading
              as="h1"
              style={{
                color: INK,
                fontSize: "30px",
                letterSpacing: "-0.025em",
                lineHeight: "1.2",
                margin: "0 0 16px",
              }}
            >
              {headline}
            </Heading>
            {graduation && updateSubject !== headline ? (
              <Heading
                as="h2"
                style={{
                  color: INK,
                  fontSize: "18px",
                  lineHeight: "1.4",
                  margin: "0 0 10px",
                }}
              >
                {updateSubject}
              </Heading>
            ) : null}
            <Text
              style={{
                color: MUTED,
                fontSize: "16px",
                lineHeight: "1.65",
                margin: "0 0 24px",
              }}
            >
              {input.teaser.trim()}
            </Text>
            <Button href={input.updatePageUrl} style={buttonStyle}>
              {graduation ? `Read ${companionName}'s story` : "Read the update"}
            </Button>

            {graduation && input.sponsorshipSelectionUrl ? (
              <Section
                style={{
                  borderTop: "1px solid #e2e7e4",
                  marginTop: "30px",
                  paddingTop: "24px",
                }}
              >
                <Text
                  style={{
                    color: MUTED,
                    fontSize: "15px",
                    lineHeight: "1.6",
                    margin: "0 0 18px",
                  }}
                >
                  Your sponsorship can continue with another companion who could
                  use your support.
                </Text>
                <Button
                  href={input.sponsorshipSelectionUrl}
                  style={buttonStyle}
                >
                  Choose a new companion
                </Button>
              </Section>
            ) : null}
          </Section>

          <Text
            style={{
              borderTop: "1px solid #e2e7e4",
              color: MUTED,
              fontSize: "12px",
              lineHeight: "1.5",
              margin: 0,
              padding: "18px 36px",
              textAlign: "center",
            }}
          >
            An update from {rescueName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SponsorUpdateEmail;
