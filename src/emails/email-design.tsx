import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

export const EMAIL_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export const EMAIL_COLOR = {
  accent: "#2f6651",
  canvas: "#f3f0e8",
  card: "#ffffff",
  ink: "#26332d",
  muted: "#56635c",
  rule: "#dce4df",
  softAccent: "#edf4f0",
} as const;

export const emailHeadingStyle: CSSProperties = {
  color: EMAIL_COLOR.ink,
  fontFamily: EMAIL_FONT,
  fontSize: "30px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: "1.2",
  margin: "0 0 16px",
};

export const emailBodyTextStyle: CSSProperties = {
  color: EMAIL_COLOR.muted,
  fontFamily: EMAIL_FONT,
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 18px",
};

type EmailLayoutProps = {
  children: ReactNode;
  footer: string;
  label: string;
  photoAlt?: string;
  photoUrl?: string | null;
  preview: string;
  title: string;
};

/**
 * A deliberately conservative, table-backed email shell. React Email inlines
 * these styles for Gmail and Apple Mail; Outlook may ignore rounded corners,
 * but retains the spacing, hierarchy, image sizing, and readable fallbacks.
 */
export function EmailLayout(input: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <title>{input.title}</title>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
      </Head>
      <Preview>{input.preview}</Preview>
      <Body
        style={{
          backgroundColor: EMAIL_COLOR.canvas,
          color: EMAIL_COLOR.ink,
          fontFamily: EMAIL_FONT,
          margin: 0,
          padding: "24px 12px",
        }}
      >
        <Container
          style={{
            backgroundColor: EMAIL_COLOR.card,
            border: `1px solid ${EMAIL_COLOR.rule}`,
            borderRadius: "12px",
            margin: "0 auto",
            maxWidth: "560px",
            overflow: "hidden",
            width: "100%",
          }}
        >
          {input.photoUrl ? (
            <Img
              alt={input.photoAlt ?? ""}
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

          <Section style={{ padding: "28px 24px 30px" }}>
            <Text
              style={{
                color: EMAIL_COLOR.accent,
                fontFamily: EMAIL_FONT,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                margin: "0 0 12px",
                textTransform: "uppercase",
              }}
            >
              {input.label}
            </Text>
            {input.children}
          </Section>

          <Text
            style={{
              borderTop: `1px solid ${EMAIL_COLOR.rule}`,
              color: EMAIL_COLOR.muted,
              fontFamily: EMAIL_FONT,
              fontSize: "12px",
              lineHeight: "1.5",
              margin: 0,
              padding: "18px 24px",
              textAlign: "center",
            }}
          >
            {input.footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailButton({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: EMAIL_COLOR.accent,
        borderRadius: "8px",
        color: "#ffffff",
        display: "inline-block",
        fontFamily: EMAIL_FONT,
        fontSize: "15px",
        fontWeight: 700,
        lineHeight: "1.2",
        padding: "14px 22px",
        textDecoration: "none",
      }}
    >
      {children}
    </Button>
  );
}
