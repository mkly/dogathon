import assert from "node:assert/strict";
import test from "node:test";

import {
  sponsorAccountReturnPath,
  sponsorAccountSignInPath,
  sponsorAccountSwitchPath,
  switchedSponsorshipId,
} from "./sponsor-account-navigation";

const sponsorshipId = "550e8400-e29b-41d4-a716-446655440000";

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
