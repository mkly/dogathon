import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

import { formatDate, formatMonthlyAmount } from "../lib/format.ts";

type SponsorshipChoiceEmailProps = {
  companionName?: string;
  monthlyCents: number;
  nextChargeDate?: Date;
  organizationName: string;
  sponsorName: string;
  type: "transferred" | "ended";
};

export function SponsorshipChoiceEmail(input: SponsorshipChoiceEmailProps) {
  const transferred = input.type === "transferred";
  const subject = transferred
    ? `Your sponsorship now supports ${input.companionName}`
    : `Thank you for sponsoring with ${input.organizationName}`;

  return (
    <Html lang="en">
      <Head><title>{subject}</title></Head>
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: "#ede4d4", color: "#3d332b", fontFamily: "Nunito, Arial, sans-serif", margin: 0, padding: "32px 16px" }}>
        <Container style={{ margin: "0 auto", maxWidth: "560px" }}>
          <Section style={{ backgroundColor: transferred ? "#7a8c5e" : "#9a886c", borderRadius: "22px", color: "#f8f2e7", padding: "30px" }}>
            <Text style={{ fontSize: "12px", fontWeight: 900, letterSpacing: "0.14em", margin: "0 0 8px", textTransform: "uppercase" }}>
              {input.organizationName}
            </Text>
            <Heading style={{ fontSize: "28px", lineHeight: "1.2", margin: "0 0 18px" }}>{subject}</Heading>
            {transferred ? (
              <>
                <Text style={{ fontSize: "16px", lineHeight: "1.6" }}>
                  Hi {input.sponsorName}, your {formatMonthlyAmount(input.monthlyCents)} monthly sponsorship now helps care for {input.companionName}.
                </Text>
                {input.nextChargeDate ? (
                  <Text style={{ fontSize: "16px", lineHeight: "1.6" }}>
                    Your next charge is scheduled for {formatDate(input.nextChargeDate)}.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={{ fontSize: "16px", lineHeight: "1.6" }}>
                Hi {input.sponsorName}, your sponsorship has ended. Thank you for the care you gave while it was needed.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default SponsorshipChoiceEmail;
