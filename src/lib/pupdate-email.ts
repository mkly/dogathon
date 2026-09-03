/**
 * The HTML pupdate that lands in a sponsor's inbox.
 *
 * This is the felt design system ported to email rules, not a second design.
 * Email clients drop the things the site leans on -- SVG stitch rings, CSS
 * filters, pseudo-elements, custom properties -- so each idiom is rebuilt with
 * what survives Gmail and Outlook:
 *
 *   felt patch      -> a solid tone colour with the fabric tile behind it
 *   stitch ring     -> a dashed thread-coloured border on a nested table cell
 *   cut-out photo   -> the image ringed by that same dashed border
 *   drop shadow     -> dropped; nothing fakes it without image slices
 *
 * Everything structural is a table with inline styles. Rounded corners and the
 * background tile degrade to square edges and flat colour in Outlook, which
 * still reads as felt.
 */

export type PupdateEmailInput = {
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

/**
 * The site blends one fabric tile over each tone with `soft-light` and greys it
 * down for the craft mat. Email has no blend modes, so those composites are
 * baked into public/textures/email/ and referenced as plain tiles. Every one of
 * them sits on top of the matching solid colour, which is what Outlook shows.
 */
const TILE = {
  ground: "/textures/email/ground.jpg",
  oatmeal: "/textures/email/felt-oatmeal.jpg",
  moss: "/textures/email/felt-moss.jpg",
  mustard: "/textures/email/felt-mustard.jpg",
} as const;

const FONT = "Nunito, 'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function absolute(origin: string, path: string): string {
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

/**
 * The composer writes prose with blank-line paragraphs and "- " bullets. Both
 * become real markup so the mail is not one grey slab of text.
 */
function renderBody(bodyText: string): string {
  const paragraph = (text: string) =>
    `<p style="margin:0 0 18px;color:${CREAM};font-size:16px;font-weight:600;line-height:1.65;">${escapeHtml(text)}</p>`;

  const heading = (text: string) =>
    `<p style="margin:0 0 10px;color:${THREAD};font-size:12px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(
      text.replace(/:$/u, ""),
    )}</p>`;

  const list = (items: string[]) =>
    `<ul style="margin:0 0 18px;padding-left:20px;color:${CREAM};font-size:16px;font-weight:600;line-height:1.6;">${items
      .map((item) => `<li style="margin:0 0 10px;">${escapeHtml(item)}</li>`)
      .join("")}</ul>`;

  return bodyText
    .trim()
    .split(/\n\s*\n/u)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const out: string[] = [];
      let bullets: string[] = [];
      let prose: string[] = [];

      const flushProse = () => {
        if (prose.length === 0) return;
        // "Recent notes:" introduces the list rather than being a sentence.
        const last = prose[prose.length - 1];
        if (bullets.length === 0 && last.endsWith(":") && last.length < 60) {
          if (prose.length > 1) out.push(paragraph(prose.slice(0, -1).join(" ")));
          out.push(heading(last));
        } else {
          out.push(paragraph(prose.join(" ")));
        }
        prose = [];
      };
      const flushBullets = () => {
        if (bullets.length === 0) return;
        out.push(list(bullets));
        bullets = [];
      };

      for (const line of lines) {
        if (/^[-*\u2022]\s+/u.test(line)) {
          flushProse();
          bullets.push(line.replace(/^[-*\u2022]\s+/u, ""));
        } else {
          flushBullets();
          prose.push(line);
        }
      }
      flushProse();
      flushBullets();

      return out.join("");
    })
    .join("");
}

/** A felt patch: tone colour, fabric tile, and a dashed stitch ring inside it. */
function panel(tone: string, tile: string, radius: string, inner: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background-color:${tone};background-image:url('${tile}');background-size:200px;border-radius:${radius};">
  <tr><td style="padding:10px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;">
      <tr><td style="padding:22px 24px;border:2px dashed rgba(239,231,214,0.55);border-radius:14px;">${inner}</td></tr>
    </table>
  </td></tr>
</table>`;
}

export function renderPupdateEmail(input: PupdateEmailInput): string {
  const name = escapeHtml(input.companionName.trim());
  const graduation = input.type === "graduation";
  const wordmark = absolute(input.origin, "/brand/pawcast-wordmark.png");
  const ground = absolute(input.origin, TILE.ground);
  const photo = input.photoUrl ? absolute(input.origin, input.photoUrl) : null;
  const companionUrl = escapeHtml(input.companionUrl);
  const headline = escapeHtml(input.subject.trim());
  const eyebrow = graduation ? "Adoption day" : "A new pupdate";
  const heroTone = graduation ? MUSTARD : MOSS;
  const heroInk = graduation ? INK : CREAM;
  const heroThread = graduation ? "rgba(61,51,43,0.45)" : "rgba(239,231,214,0.55)";
  const heroTile = absolute(input.origin, graduation ? TILE.mustard : TILE.moss);

  const hero = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background-color:${heroTone};background-image:url('${heroTile}');background-size:200px;border-radius:26px 20px 24px 21px;">
  <tr><td style="padding:10px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;">
      <tr><td align="center" style="padding:26px 26px 30px;border:2px dashed ${heroThread};border-radius:18px;">
        <p style="margin:0 0 10px;color:${heroInk};font-size:12px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;">${eyebrow}</p>
        <h1 class="hero-title" style="margin:0;color:${heroInk};font-size:31px;font-weight:900;line-height:1.25;letter-spacing:-0.02em;">${headline}</h1>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  // The photo is cut into the felt: dashed thread ring, then the image itself.
  const photoBlock = photo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:0 0 22px;">
  <tr><td style="padding:7px;border:2px dashed rgba(239,231,214,0.6);border-radius:16px;">
    <img alt="${name}" src="${escapeHtml(photo)}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:10px;outline:none;text-decoration:none;" />
  </td></tr>
</table>`
    : "";

  const cta = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:6px auto 0;">
  <tr><td align="center" style="background-color:${MUSTARD};background-image:url('${absolute(input.origin, TILE.mustard)}');background-size:200px;border-radius:15px;">
    <a href="${companionUrl}" style="display:inline-block;padding:15px 30px;color:${INK};font-family:${FONT};font-size:16px;font-weight:900;text-decoration:none;">See ${name}&rsquo;s page &rarr;</a>
  </td></tr>
</table>`;

  const body = `${photoBlock}${renderBody(input.bodyText)}${cta}`;

  const preheader = graduation
    ? `${name} found a forever home &mdash; and you helped.`
    : `Fresh news from ${name}, straight off the volunteer notebook.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${headline}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&amp;display=swap" rel="stylesheet" />
<style>
  /* Clients that support media queries get a phone-friendly gutter. */
  @media only screen and (max-width:620px) {
    .shell { width:100% !important; }
    .gutter { padding-left:14px !important; padding-right:14px !important; }
    .hero-title { font-size:25px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};color:${INK};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${GROUND};background-image:url('${escapeHtml(ground)}');background-size:400px;">
  <tr><td align="center" class="gutter" style="padding:34px 20px 44px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="shell" style="border-collapse:separate;width:600px;max-width:600px;">
      <tr><td align="center" style="padding:0 0 22px;">
        <img alt="Pawcast" src="${escapeHtml(wordmark)}" width="230" style="display:block;width:230px;max-width:70%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:0 0 20px;">${hero}</td></tr>
      <tr><td style="padding:0 0 22px;">${panel(OATMEAL, absolute(input.origin, TILE.oatmeal), "24px 19px 22px 20px", body)}</td></tr>
      <tr><td align="center" style="padding:4px 8px 0;">
        <p style="margin:0 0 6px;color:${INK};font-size:13px;font-weight:800;line-height:1.6;opacity:0.72;">
          You get this because you sponsor ${name} for $25 a month until adoption.
        </p>
        <p style="margin:0;color:${INK};font-size:12px;font-weight:700;line-height:1.6;opacity:0.55;">
          Pawcast &middot; the good news from the kennel, written by the people who scoop it
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
