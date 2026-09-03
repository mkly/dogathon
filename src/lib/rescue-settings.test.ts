import assert from "node:assert/strict";
import test from "node:test";

import { parseSettingsForm } from "./rescue-settings";

test("the postscript form does not clear the roster source", () => {
  const formData = new FormData();
  formData.set("pinnedPostscript", "  Thanks for helping!  ");

  assert.deepEqual(parseSettingsForm(formData), {
    ok: true,
    message: "Email postscript saved.",
    settings: { pinnedPostscript: "Thanks for helping!" },
  });
});

test("the roster-source form does not clear the email postscript", () => {
  const formData = new FormData();
  formData.set("sourceUrl", "https://example.com/adoptable-companions");

  assert.deepEqual(parseSettingsForm(formData), {
    ok: true,
    message: "Roster source saved.",
    savedSourceInput: "https://example.com/adoptable-companions",
    settings: { sourceUrl: "https://example.com/adoptable-companions" },
  });
});

test("an invalid roster source is rejected without an update", () => {
  const formData = new FormData();
  formData.set("sourceUrl", "../companions.html");

  assert.deepEqual(parseSettingsForm(formData), {
    ok: false,
    message: "Enter an http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
  });
});

test("a non-http scheme is rejected rather than read as a local capture path", () => {
  for (const value of ["file:///etc/passwd.html", "javascript:alert(1).html", "ftp://example.com/dogs.html"]) {
    const formData = new FormData();
    formData.set("sourceUrl", value);

    assert.deepEqual(parseSettingsForm(formData), {
      ok: false,
      message: "Enter an http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
    }, `expected ${value} to be rejected`);
  }
});
