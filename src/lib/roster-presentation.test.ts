import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicPage = readFile(
  new URL("../app/[orgSlug]/(public)/page.tsx", import.meta.url),
  "utf8",
);
const selectionPage = readFile(
  new URL("../app/[orgSlug]/(public)/sponsor/next/page.tsx", import.meta.url),
  "utf8",
);
const sharedPresentation = readFile(
  new URL("../app/[orgSlug]/(public)/roster-presentation.tsx", import.meta.url),
  "utf8",
);
const formerSharedStyles = readFile(
  new URL("../app/public.module.css", import.meta.url),
  "utf8",
);

test("public roster and companion reselection share the roster presentation", async () => {
  for (const page of await Promise.all([publicPage, selectionPage])) {
    assert.match(page, /<RosterShell/u);
    assert.match(page, /<CompanionGrid/u);
    assert.match(page, /<CompanionCard/u);
    assert.match(page, /<CompanionPhoto/u);
    assert.match(page, /<CompanionCardCopy/u);
  }

  assert.doesNotMatch(await formerSharedStyles, /^\.companionGrid\s*\{/mu);
});

test("shared cards retain roster details and the selection form retains its contract", async () => {
  const [presentation, selection] = await Promise.all([
    sharedPresentation,
    selectionPage,
  ]);

  assert.match(presentation, /<PhotoCharm id=\{resident\.id\}/u);
  assert.match(presentation, /resident\.personality\.trim\(\)/u);
  assert.match(presentation, /resident\.photoUrls\[0\]/u);
  assert.match(selection, /transferSponsorshipAction\.bind/u);
  assert.match(selection, /name="residentId"/u);
  assert.match(selection, /pendingLabel="Moving sponsorship…"/u);
});
