import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedOrigin,
  parseAllowedOrigins,
  parseSettingsForm,
} from "./rescue-settings";
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

test("parses sponsorship tiers and canonical allowed origins", () => {
  const formData = new FormData();
  formData.append("tierMonthlyDollars", "32.50");
  formData.append("tierDescription", "  Everyday care\n and treats  ");
  formData.append("tierMonthlyDollars", "50");
  formData.append("tierDescription", "Vet care");
  formData.set("allowedOrigins", "https://rescue.example/\nhttps://rescue.example\nhttps://embed.example:8443");

  assert.deepEqual(parseSettingsForm(formData), {
    ok: true,
    message: "Sponsorship settings saved.",
    settings: {
      allowedOrigins: ["https://rescue.example", "https://embed.example:8443"],
    },
    sponsorshipTiers: [
      { monthlyCents: 3250, description: "Everyday care and treats" },
      { monthlyCents: 5000, description: "Vet care" },
    ],
  });
});

test("rejects markup and more than six sponsorship tiers", () => {
  const markup = new FormData();
  markup.set("allowedOrigins", "");
  markup.append("tierMonthlyDollars", "25");
  markup.append("tierDescription", "<strong>Care</strong>");
  assert.equal(parseSettingsForm(markup).ok, false);

  const tooMany = new FormData();
  tooMany.set("allowedOrigins", "");
  for (let index = 0; index < 7; index += 1) {
    tooMany.append("tierMonthlyDollars", "25");
    tooMany.append("tierDescription", "Care");
  }
  assert.equal(parseSettingsForm(tooMany).ok, false);
});

test("allowed origins are exact, scheme-sensitive, and port-sensitive", () => {
  const settings = { allowedOrigins: ["https://rescue.example", "https://embed.example:8443"] };

  assert.equal(isAllowedOrigin(settings, "https://rescue.example"), true);
  assert.equal(isAllowedOrigin(settings, "http://rescue.example"), false);
  assert.equal(isAllowedOrigin(settings, "https://embed.example"), false);
  assert.equal(isAllowedOrigin(settings, "https://embed.example:8443"), true);
  assert.equal(isAllowedOrigin({ allowedOrigins: ["https://*.example"] }, "https://dogs.example"), false);
});

test("rejects paths, wildcards, and production localhost origins", () => {
  assert.equal(parseAllowedOrigins("https://rescue.example/embed", false), null);
  assert.equal(parseAllowedOrigins("https://*.example", false), null);
  assert.equal(parseAllowedOrigins("http://localhost:3000", true), null);
  assert.deepEqual(parseAllowedOrigins("http://localhost:3000", false), ["http://localhost:3000"]);
});
