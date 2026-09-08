import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import { GET } from "@/app/embed.js/route";
import { sponsorEmbedScript } from "./sponsor-embed-script";

const companion = {
  ageText: "Adult",
  breed: "Corgi mix",
  companionUrl: "https://pawcast.example/happy-paws/companions/companion-1",
  currency: "usd",
  id: "companion-1",
  monthlyCents: 3250,
  name: "Biscuit",
  photoUrl: "https://images.example/biscuit.jpg",
  sex: "Female",
  sponsorUrl: "https://pawcast.example/happy-paws/sponsor",
  status: "available",
};

async function renderWidget({
  details,
  intro,
  name,
  ok = true,
  photo,
  response = companion,
  url = "https://rescue.example/dogs/biscuit#bio",
}: {
  details?: string;
  intro?: string;
  name?: string;
  ok?: boolean;
  photo?: string;
  response?: typeof companion;
  url?: string;
} = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-sponsor-org="happy-paws"></div>
    <script type="application/json" src="https://pawcast.example/embed.js"></script>
  </body>`, { runScripts: "outside-only", url });
  let requested = "";
  Object.defineProperty(dom.window, "fetch", {
    configurable: true,
    value: async (input: string) => {
      requested = String(input);
      return { json: async () => response, ok, status: ok ? 200 : 404 };
    },
  });

  const root = dom.window.document.querySelector<HTMLElement>("[data-sponsor-org]");
  assert.ok(root);
  if (details !== undefined) root.setAttribute("data-sponsor-details", details);
  if (intro !== undefined) root.setAttribute("data-sponsor-intro", intro);
  if (name !== undefined) root.setAttribute("data-sponsor-name", name);
  if (photo !== undefined) root.setAttribute("data-sponsor-photo", photo);
  dom.window.eval(sponsorEmbedScript);
  for (let index = 0; index < 20 && !root.hasAttribute("data-sponsor-rendered"); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(root.hasAttribute("data-sponsor-rendered"), "widget did not finish rendering");
  return { dom, requested, root };
}

test("serves a cacheable dependency-free script below the size limit", async () => {
  const response = GET();

  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.ok(new TextEncoder().encode(await response.text()).byteLength < 12_000);
});

test("renders companion data and a checkout form using the public endpoints", async () => {
  const { requested, root } = await renderWidget();

  assert.equal(
    requested,
    "https://pawcast.example/api/public/happy-paws/companion?source=https%3A%2F%2Frescue.example%2Fdogs%2Fbiscuit",
  );
  assert.equal(root.querySelector(".dogathon-sponsor-name")?.textContent, "Biscuit");
  assert.equal(root.querySelector(".dogathon-sponsor-price")?.textContent, "$32.50 monthly");
  assert.equal(root.querySelector(".dogathon-sponsor-status")?.textContent, "Available for sponsorship");
  assert.equal(root.querySelector("img")?.getAttribute("src"), companion.photoUrl);

  const form = root.querySelector("form");
  assert.equal(form?.method, "post");
  assert.equal(form?.action, "https://pawcast.example/api/public/happy-paws/checkout");
  assert.equal(form?.querySelector<HTMLInputElement>('[name="source"]')?.value, "https://rescue.example/dogs/biscuit");
  assert.equal(form?.querySelector<HTMLInputElement>('[name="returnTo"]')?.value, "https://rescue.example/dogs/biscuit#bio");
  assert.ok(form?.querySelector('[name="sponsorName"][required]'));
  assert.ok(form?.querySelector('[name="sponsorEmail"][required]'));
  assert.equal(root.innerHTML.includes(companion.name), true);
});

test("renders only a notice when the companion cannot be found", async () => {
  const { root } = await renderWidget({ ok: false });

  assert.equal(root.querySelector(".dogathon-sponsor-message")?.textContent, "We could not find this companion.");
  assert.equal(root.querySelector("a"), null);
});

test("renders the default sponsor intro for an available companion", async () => {
  const { root } = await renderWidget();

  assert.equal(
    root.querySelector(".dogathon-sponsor-intro")?.textContent,
    "A monthly sponsorship helps cover Biscuit's care while they wait for a home.",
  );
});

test("data-sponsor-intro can hide the sponsor intro", async () => {
  const { root } = await renderWidget({ intro: "hide" });

  assert.equal(root.querySelector(".dogathon-sponsor-intro"), null);
});

test("data-sponsor-intro can replace the default sponsor intro", async () => {
  const { root } = await renderWidget({ intro: "Help Biscuit thrive." });

  assert.equal(root.querySelector(".dogathon-sponsor-intro")?.textContent, "Help Biscuit thrive.");
});

test("data-sponsor-intro renders custom markup as text", async () => {
  const { root } = await renderWidget({ intro: "<strong>Help Biscuit</strong>" });
  const intro = root.querySelector(".dogathon-sponsor-intro");

  assert.equal(intro?.textContent, "<strong>Help Biscuit</strong>");
  assert.equal(intro?.children.length, 0);
});

for (const [photo, expected] of [
  [undefined, true],
  ["show", true],
  ["hide", false],
] as const) {
  test(`${photo ?? "an absent value"} for data-sponsor-photo ${expected ? "shows" : "hides"} the photo`, async () => {
    const { root } = await renderWidget({ photo });

    assert.equal(Boolean(root.querySelector(".dogathon-sponsor-photo")), expected);
    if (!expected) {
      assert.equal(root.querySelector("style")?.nextElementSibling?.className, "dogathon-sponsor-name");
    }
  });
}

test("data-sponsor-name hides only the visible companion name", async () => {
  const { root } = await renderWidget({ name: "hide" });

  assert.equal(root.querySelector(".dogathon-sponsor-name"), null);
  assert.equal(root.querySelector(".dogathon-sponsor-details")?.textContent, "Corgi mix · Adult · Female");
  assert.equal(root.querySelector("img")?.getAttribute("alt"), companion.name);
});

test("data-sponsor-details hides only the companion details", async () => {
  const { root } = await renderWidget({ details: "hide" });

  assert.equal(root.querySelector(".dogathon-sponsor-name")?.textContent, companion.name);
  assert.equal(root.querySelector(".dogathon-sponsor-details"), null);
});

test("name, details, and photo attributes can hide all three card parts", async () => {
  const { root } = await renderWidget({ details: "hide", name: "hide", photo: "hide" });

  assert.equal(root.querySelector(".dogathon-sponsor-name"), null);
  assert.equal(root.querySelector(".dogathon-sponsor-details"), null);
  assert.equal(root.querySelector(".dogathon-sponsor-photo"), null);
});

for (const [query, expected] of [
  ["sponsored=1", "Thank you! Your sponsorship is confirmed."],
  ["checkout=canceled", "Checkout was canceled. No payment was made."],
  ["error=invalid", "Please check your details and try again."],
  ["error=rate-limited", "Too many checkout attempts. Please wait and try again."],
  ["error=unavailable", "This companion is not currently available for sponsorship."],
  ["error=billing", "Checkout is temporarily unavailable. Please try again later."],
] as const) {
  test(`renders the ${query} return state instead of the form`, async () => {
    const { root } = await renderWidget({ url: `https://rescue.example/dogs/biscuit?${query}` });

    assert.equal(root.querySelector(".dogathon-sponsor-message")?.textContent, expected);
    assert.equal(root.querySelector("form"), null);
  });
}

for (const [status, expected] of [
  ["sponsored", "This companion already has an active sponsor."],
  ["adopted", "This companion has been adopted and is no longer accepting sponsorships."],
] as const) {
  test(`renders a ${status} message and companion link`, async () => {
    const { root } = await renderWidget({ response: { ...companion, status } });

    assert.equal(root.querySelector(".dogathon-sponsor-message")?.textContent, expected);
    assert.equal(root.querySelector("form"), null);
    assert.equal(root.querySelector(".dogathon-sponsor-intro"), null);
    assert.equal(root.querySelector<HTMLAnchorElement>("a")?.href, companion.companionUrl);
  });
}

test("renders containers parsed after a script loaded from the head", async () => {
  const dom = new JSDOM(`<!doctype html><html><head>
    <script type="application/json" src="https://pawcast.example/embed.js"></script>
  </head><body></body></html>`, { runScripts: "outside-only", url: "https://rescue.example/dogs/biscuit" });
  Object.defineProperty(dom.window, "fetch", {
    configurable: true,
    value: async () => ({ json: async () => companion, ok: true, status: 200 }),
  });

  assert.equal(dom.window.document.readyState, "loading");
  dom.window.eval(sponsorEmbedScript);

  const root = dom.window.document.createElement("div");
  root.setAttribute("data-sponsor-org", "happy-paws");
  dom.window.document.body.append(root);

  for (let index = 0; index < 20 && !root.hasAttribute("data-sponsor-rendered"); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(root.hasAttribute("data-sponsor-rendered"), "widget did not render a late container");
  assert.equal(root.querySelector(".dogathon-sponsor-name")?.textContent, "Biscuit");
});
