import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

import { formatMonthlyAmount } from "../lib/format.ts";

type SponsorshipChoiceEmailProps = {
  companionName?: string;
  monthlyCents: number;
  organizationName: string;
  sponsorName: string;
  type: "transferred" | "ended";
};

export function SponsorshipChoiceEmail(input: SponsorshipChoiceEmailProps) {
  const transferred = input.type === "transferred";
  const subject = transferred
    ? `You are now following ${input.companionName}`
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
                  Hi {input.sponsorName}, you have chosen to follow {input.companionName}. Your {formatMonthlyAmount(input.monthlyCents)} monthly sponsorship with {input.organizationName} continues as usual.
                </Text>
                <Text style={{ fontSize: "16px", lineHeight: "1.6" }}>
                  You can switch companions or cancel at any time from your sponsorship page.
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: "16px", lineHeight: "1.6" }}>
                Hi {input.sponsorName}, we have canceled your monthly sponsorship with {input.organizationName}. You will not be charged again. Thank you for supporting the rescue.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default SponsorshipChoiceEmail;
