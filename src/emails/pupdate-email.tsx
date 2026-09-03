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
import { Markdown } from "@react-email/markdown";
import type { CSSProperties } from "react";

export type PupdateEmailProps = {
  companionName: string;
  subject: string;
  bodyText: string;
  companionUrl: string;
  /** Absolute origin for the wordmark, texture, and photo. */
  origin: string;
  photoUrl?: string | null;
  type?: "regular" | "graduation";
};

const INK = "#3d332b";
const CREAM = "#f8f2e7";
const THREAD = "#efe7d6";
const GROUND = "#ede4d4";
const OATMEAL = "#9a886c";
const MOSS = "#7a8c5e";
const MUSTARD = "#d9a521";
const FONT = "Nunito, 'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif";

const TILE = {
  ground: "/textures/email/ground.jpg",
  oatmeal: "/textures/email/felt-oatmeal.jpg",
  moss: "/textures/email/felt-moss.jpg",
  mustard: "/textures/email/felt-mustard.jpg",
} as const;

function absolute(origin: string, path: string): string {
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

/** The composer controls Markdown, but sponsor-facing text must never inject HTML. */
function escapeHtmlInMarkdown(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

const SAFE_DESTINATION = /^(?:https?:|mailto:|[/#])/iu;

/**
 * Markdown link and image destinations are author-supplied and reach a preview
 * page served from our own origin, so only web schemes are allowed through.
 */
function neutralizeUnsafeDestinations(value: string): string {
  return value.replace(
    /(\]\(\s*)([^)\s]*)/gu,
    (match, open: string, destination: string) =>
      destination === "" || SAFE_DESTINATION.test(destination) ? match : `${open}#`,
  );
}

function feltBackground(tone: string, tile: string): CSSProperties {
  return {
    backgroundColor: tone,
    backgroundImage: `url('${tile}')`,
    backgroundSize: "200px",
  };
}

const markdownStyles = {
  h2: {
    color: THREAD,
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    lineHeight: "1.4",
    margin: "0 0 10px",
    padding: 0,
    textTransform: "uppercase",
  },
  p: {
    color: CREAM,
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "1.65",
    margin: "0 0 18px",
  },
  ul: {
    color: CREAM,
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "1.6",
    margin: "0 0 18px",
    paddingLeft: "20px",
  },
  ol: {
    color: CREAM,
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "1.6",
    margin: "0 0 18px",
    paddingLeft: "20px",
  },
  li: { margin: "0 0 10px" },
  link: { color: CREAM, textDecoration: "underline" },
  bold: { fontWeight: 900 },
} satisfies Record<string, CSSProperties>;

/** Sponsor pupdate rendered with email-client-safe React Email primitives. */
export function PupdateEmail(input: PupdateEmailProps) {
  const name = input.companionName.trim();
  const headline = input.subject.trim();
  const graduation = input.type === "graduation";
  const ground = absolute(input.origin, TILE.ground);
  const heroTile = absolute(input.origin, graduation ? TILE.mustard : TILE.moss);
  const photo = input.photoUrl ? absolute(input.origin, input.photoUrl) : null;
  const preheader = graduation
    ? `${name} found a forever home — and you helped.`
    : `Fresh news from ${name}, straight off the volunteer notebook.`;

  return (
    <Html lang="en">
      <Head>
        <title>{headline}</title>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- email clients need an in-document font link */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{preheader}</Preview>
      <Body
        style={{
          ...feltBackground(GROUND, ground),
          color: INK,
          fontFamily: FONT,
          margin: 0,
          padding: "34px 20px 44px",
        }}
      >
        <Container style={{ margin: "0 auto", maxWidth: "600px", width: "100%" }}>
          <Img
            alt="Pawcast"
            src={absolute(input.origin, "/brand/pawcast-wordmark.png")}
            width="230"
            style={{ display: "block", height: "auto", margin: "0 auto 22px", maxWidth: "70%" }}
          />

          <Section
            style={{
              ...feltBackground(graduation ? MUSTARD : MOSS, heroTile),
              borderRadius: "26px 20px 24px 21px",
              marginBottom: "20px",
              padding: "10px",
            }}
          >
            <Section
              style={{
                border: `2px dashed ${graduation ? "rgba(61,51,43,0.45)" : "rgba(239,231,214,0.55)"}`,
                borderRadius: "18px",
                padding: "26px 26px 30px",
                textAlign: "center",
              }}
            >
              <Text
                style={{
                  color: graduation ? INK : CREAM,
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  margin: "0 0 10px",
                  opacity: 0.85,
                  textTransform: "uppercase",
                }}
              >
                {graduation ? "Adoption day" : "A new pupdate"}
              </Text>
              <Heading
                as="h1"
                style={{
                  color: graduation ? INK : CREAM,
                  fontSize: "31px",
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  lineHeight: "1.25",
                  margin: 0,
                }}
              >
                {headline}
              </Heading>
            </Section>
          </Section>

          <Section
            style={{
              ...feltBackground(OATMEAL, absolute(input.origin, TILE.oatmeal)),
              borderRadius: "24px 19px 22px 20px",
              marginBottom: "22px",
              padding: "10px",
            }}
          >
            <Section
              style={{
                border: "2px dashed rgba(239,231,214,0.55)",
                borderRadius: "14px",
                padding: "22px 24px",
              }}
            >
              {photo ? (
                <Section
                  style={{
                    border: "2px dashed rgba(239,231,214,0.6)",
                    borderRadius: "16px",
                    marginBottom: "22px",
                    padding: "7px",
                  }}
                >
                  <Img
                    alt={name}
                    src={photo}
                    width="512"
                    style={{
                      borderRadius: "10px",
                      display: "block",
                      height: "auto",
                      maxWidth: "512px",
                      width: "100%",
                    }}
                  />
                </Section>
              ) : null}

              <Markdown markdownCustomStyles={markdownStyles}>
                {neutralizeUnsafeDestinations(escapeHtmlInMarkdown(input.bodyText.trim()))}
              </Markdown>

              <Section style={{ textAlign: "center" }}>
                <Button
                  href={input.companionUrl}
                  style={{
                    ...feltBackground(MUSTARD, absolute(input.origin, TILE.mustard)),
                    borderRadius: "15px",
                    color: INK,
                    display: "inline-block",
                    fontFamily: FONT,
                    fontSize: "16px",
                    fontWeight: 900,
                    marginTop: "6px",
                    padding: "15px 30px",
                    textDecoration: "none",
                  }}
                >
                  See {name}&rsquo;s page &rarr;
                </Button>
              </Section>
            </Section>
          </Section>

          <Text style={{ color: INK, fontSize: "13px", fontWeight: 800, lineHeight: "1.6", margin: "0 8px 6px", opacity: 0.72, textAlign: "center" }}>
            You get this because you sponsor {name} for $25 a month until adoption.
          </Text>
          <Text style={{ color: INK, fontSize: "12px", fontWeight: 700, lineHeight: "1.6", margin: "0 8px", opacity: 0.55, textAlign: "center" }}>
            Pawcast · the good news from the kennel, written by the people who scoop it
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PupdateEmail;
