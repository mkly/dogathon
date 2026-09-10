import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  sponsorAccountReturnPath,
  sponsorAccountSignInPath,
  sponsorAccountSwitchPath,
  switchedSponsorshipId,
} from "./sponsor-account-navigation";

const sponsorshipId = "550e8400-e29b-41d4-a716-446655440000";

const source = (relativePath: string) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

test("successful signed-in switches navigate to the sponsor account", () => {
  assert.equal(
    sponsorAccountSwitchPath(sponsorshipId),
    `/account?switched=${sponsorshipId}`,
  );
});

test("token switches use sign-in without carrying the selection token", () => {
  const path = sponsorAccountSignInPath(
    sponsorAccountSwitchPath(sponsorshipId),
  );

  assert.equal(
    path,
    `/account/sign-in?next=%2Faccount%3Fswitched%3D${sponsorshipId}`,
  );
  assert.doesNotMatch(path, /token/);
});

test("account sign-in only accepts validated account return paths", () => {
  assert.equal(
    sponsorAccountReturnPath(`/account?switched=${sponsorshipId}`),
    `/account?switched=${sponsorshipId}`,
  );
  assert.equal(
    sponsorAccountReturnPath("https://attacker.test/account"),
    "/account",
  );
  assert.equal(sponsorAccountReturnPath("//attacker.test/account"), "/account");
  assert.equal(sponsorAccountReturnPath("http://["), "/account");
  assert.equal(sponsorAccountReturnPath("/staff/organizations"), "/account");
  assert.equal(sponsorAccountReturnPath("/account?switched=bad"), "/account");
});

test("the account only recognizes a single valid sponsorship id", () => {
  assert.equal(
    switchedSponsorshipId({ switched: sponsorshipId }),
    sponsorshipId,
  );
  assert.equal(switchedSponsorshipId({ switched: "bad" }), undefined);
  assert.equal(
    switchedSponsorshipId({ switched: [sponsorshipId, sponsorshipId] }),
    undefined,
  );
});

test("the transfer action routes successful signed-in and token selections through the account flow", async () => {
  const action = await source(
    "../app/[orgSlug]/(public)/sponsor/next/actions.ts",
  );

  assert.match(
    action,
    /await transferSponsorship\(sponsorship\.id, parsed\.data\.residentId\);[\s\S]*const accountPath = sponsorAccountSwitchPath\(sponsorship\.id\);[\s\S]*selection\.token \? sponsorAccountSignInPath\(accountPath\) : accountPath/u,
  );
  assert.match(
    action,
    /SponsorshipTransferError[\s\S]*redirect\(destination\(orgSlug, selection, error\.code\)\)/u,
  );
  assert.match(
    action,
    /endAwaitingSponsorship[\s\S]*redirect\(destination\(orgSlug, selection\)\)/u,
  );
});

test("account sign-in preserves the validated return path for sessions and magic links", async () => {
  const signInPage = await source("../app/account/sign-in/page.tsx");

  assert.match(signInPage, /redirect\(redirectTo\)/u);
  assert.match(signInPage, /<MagicLinkForm callbackURL=\{redirectTo\} \/>/u);
});

test("the account renders an ownership-validated, one-time switch confirmation", async () => {
  const [accountPage, confirmation] = await Promise.all([
    source("../app/account/page.tsx"),
    source("../app/account/switch-confirmation.tsx"),
  ]);

  assert.match(
    accountPage,
    /sponsorships\.find\([\s\S]*record\.id === switchedId[\s\S]*<SwitchConfirmation[\s\S]*companionName=\{switchedSponsorship\.resident\.name\}[\s\S]*organizationName=\{switchedSponsorship\.organization\.name\}/u,
  );
  assert.match(confirmation, /aria-live="polite"[\s\S]*role="status"/u);
  assert.match(confirmation, /url\.searchParams\.delete\("switched"\)/u);
  assert.match(confirmation, /window\.history\.replaceState/u);
});
