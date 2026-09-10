import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const feltStyles = readFileSync(
  new URL("./felt.module.css", import.meta.url),
  "utf8",
);
const adminStyles = readFileSync(
  new URL("./admin-ui.module.css", import.meta.url),
  "utf8",
);
const publicStyles = readFileSync(
  new URL("../app/public.module.css", import.meta.url),
  "utf8",
);
const feltGlobals = readFileSync(
  new URL("../app/felt.css", import.meta.url),
  "utf8",
);
const companionBanner = readFileSync(
  new URL(
    "../app/[orgSlug]/(public)/companions/[id]/companion-banner.tsx",
    import.meta.url,
  ),
  "utf8",
);

function rule(stylesheet: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  assert.ok(match, `Expected to find the ${selector} CSS rule`);
  return match[1];
}

test("button-styled links reset text decoration in shared styles", () => {
  assert.match(rule(feltStyles, ".felt-button"), /text-decoration:\s*none/);
  assert.match(rule(adminStyles, ".button"), /text-decoration:\s*none/);
});

test("public card buttons do not override the shared decoration reset", () => {
  assert.doesNotMatch(rule(publicStyles, ".cardLink"), /text-decoration/);
  assert.doesNotMatch(
    publicStyles,
    /\.cardLink:(?:hover|focus-visible|active)/,
  );
});

test("success CTA keeps its destination and keyboard focus indicator", () => {
  assert.match(
    companionBanner,
    /<FeltLink className=\{styles\.cardLink\} href="\/account\/sign-in">/,
  );
  assert.match(
    rule(feltGlobals, ":focus-visible"),
    /outline:\s*3px solid var\(--felt-mustard\)/,
  );
});

test("ordinary public text links retain their underline affordance", () => {
  assert.match(rule(publicStyles, ".footer a"), /text-underline-offset/);
  assert.doesNotMatch(
    rule(publicStyles, ".footer a"),
    /text-decoration:\s*none/,
  );
});
