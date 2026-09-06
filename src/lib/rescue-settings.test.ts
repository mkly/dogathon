import assert from "node:assert/strict";
import test from "node:test";

import { parseSettingsForm } from "./rescue-settings";
import { POSTSCRIPT_MAX_LENGTH, postscriptOverLimitMessage } from "./postscript";

test("the postscript form does not clear the roster source", () => {
  const formData = new FormData();
  formData.set("pinnedPostscript", "  Thanks for helping!  ");

  assert.deepEqual(parseSettingsForm(formData), {
    ok: true,
    message: "Email postscript saved.",
    settings: { pinnedPostscript: "Thanks for helping!" },
  });
});

test("normalizes and neutralizes the saved Markdown postscript", () => {
  const formData = new FormData();
  formData.set("pinnedPostscript", "  **Bold**\r\n[unsafe](javascript:alert(1))\r[safe](https://example.org)  ");

  assert.deepEqual(parseSettingsForm(formData), {
    ok: true,
    message: "Email postscript saved.",
    settings: { pinnedPostscript: "**Bold**\n[unsafe](#))\n[safe](https://example.org)" },
  });
});

test("rejects an over-limit postscript", () => {
  const formData = new FormData();
  formData.set("pinnedPostscript", "x".repeat(POSTSCRIPT_MAX_LENGTH + 1));

  assert.deepEqual(parseSettingsForm(formData), {
    ok: false,
    message: postscriptOverLimitMessage(),
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
    message: "Enter a public http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
  });
});

test("a non-http scheme is rejected rather than read as a local capture path", () => {
  for (const value of ["file:///etc/passwd.html", "javascript:alert(1).html", "ftp://example.com/dogs.html"]) {
    const formData = new FormData();
    formData.set("sourceUrl", value);

    assert.deepEqual(parseSettingsForm(formData), {
      ok: false,
      message: "Enter a public http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
    }, `expected ${value} to be rejected`);
  }
});

test("private and IP-literal roster sources are rejected", () => {
  for (const value of [
    "http://localhost/dogs",
    "http://rescue.localhost/dogs",
    "http://10.0.0.1/dogs",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/dogs",
    "https://metadata.google.internal/computeMetadata/v1",
  ]) {
    const formData = new FormData();
    formData.set("sourceUrl", value);

    assert.equal(parseSettingsForm(formData).ok, false, `expected ${value} to be rejected`);
  }
});
