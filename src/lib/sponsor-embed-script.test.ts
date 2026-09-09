import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

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
  tiers: [
    {
      description: "Everyday care and treats",
      id: "tier-care",
      isDefault: false,
      monthlyCents: 3250,
    },
    {
      description: "Care plus veterinary support",
      id: "tier-vet",
      isDefault: true,
      monthlyCents: 5000,
    },
  ],
};

async function renderWidget({
  ok = true,
  response = companion,
  url = "https://rescue.example/dogs/biscuit#bio",
}: {
  ok?: boolean;
  response?: Omit<typeof companion, "tiers"> & {
    tiers: Array<
      Omit<(typeof companion.tiers)[number], "isDefault"> & {
        isDefault?: boolean;
      }
    >;
  };
  url?: string;
} = {}) {
  const dom = new JSDOM(
    `<!doctype html><body>
    <div data-sponsor-org="happy-paws"></div>
    <script type="application/json" src="https://pawcast.example/embed.js"></script>
  </body>`,
    { runScripts: "outside-only", url },
  );
  let requested = "";
  Object.defineProperty(dom.window, "fetch", {
    configurable: true,
    value: async (input: string) => {
      requested = String(input);
      return { json: async () => response, ok, status: ok ? 200 : 404 };
    },
  });

  const root =
    dom.window.document.querySelector<HTMLElement>("[data-sponsor-org]");
  assert.ok(root);
  dom.window.eval(sponsorEmbedScript);
  for (
    let index = 0;
    index < 20 && !root.hasAttribute("data-sponsor-rendered");
    index += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(
    root.hasAttribute("data-sponsor-rendered"),
    "widget did not finish rendering",
  );
  return { dom, requested, root };
}

test("renders companion data and a checkout form using the public endpoints", async () => {
  const { requested, root } = await renderWidget();

  assert.equal(
    requested,
    "https://pawcast.example/api/public/happy-paws/companion?source=https%3A%2F%2Frescue.example%2Fdogs%2Fbiscuit",
  );
  assert.equal(
    root.querySelector(".dogathon-sponsor-name")?.textContent,
    "Biscuit",
  );
  assert.equal(
    root.querySelector("img")?.getAttribute("src"),
    companion.photoUrl,
  );

  const form = root.querySelector("form");
  assert.equal(form?.method, "post");
  assert.equal(
    form?.action,
    "https://pawcast.example/api/public/happy-paws/checkout",
  );
  assert.equal(
    form?.querySelector<HTMLInputElement>('[name="source"]')?.value,
    "https://rescue.example/dogs/biscuit",
  );
  assert.equal(
    form?.querySelector<HTMLInputElement>('[name="returnTo"]')?.value,
    "https://rescue.example/dogs/biscuit#bio",
  );
  assert.ok(form?.querySelector('[name="sponsorName"][required]'));
  assert.ok(form?.querySelector('[name="sponsorEmail"][required]'));
  const tierInputs = form?.querySelectorAll<HTMLInputElement>('[name="tier"]');
  assert.equal(tierInputs?.length, 2);
  assert.equal(tierInputs?.[0]?.value, "tier-care");
  assert.equal(tierInputs?.[0]?.checked, false);
  assert.equal(tierInputs?.[1]?.value, "tier-vet");
  assert.equal(tierInputs?.[1]?.checked, true);
  assert.deepEqual(
    Array.from(form?.querySelectorAll(".dogathon-sponsor-tier") ?? []).map(
      (tier) => tier.textContent,
    ),
    [
      "$32.50 monthlyEveryday care and treats",
      "$50.00 monthlyCare plus veterinary support",
    ],
  );
  assert.equal(root.innerHTML.includes(companion.name), true);
});

test("falls back to the first tier when the companion response has no default", async () => {
  const tiers = [
    {
      description: "Everyday care and treats",
      id: "tier-care",
      monthlyCents: 3250,
    },
    {
      description: "Care plus veterinary support",
      id: "tier-vet",
      monthlyCents: 5000,
    },
  ];
  const { root } = await renderWidget({ response: { ...companion, tiers } });
  const tierInputs = root.querySelectorAll<HTMLInputElement>('[name="tier"]');

  assert.equal(tierInputs[0]?.checked, true);
  assert.equal(tierInputs[1]?.checked, false);
});

test("renders the default price and posts no tier when the organization has no tiers", async () => {
  const { root } = await renderWidget({
    response: { ...companion, tiers: [] },
  });

  assert.equal(
    root.querySelector(".dogathon-sponsor-price")?.textContent,
    "$32.50 monthly",
  );
  assert.ok(root.querySelector("form"));
  assert.equal(root.querySelector('[name="tier"]'), null);
  assert.equal(root.querySelector(".dogathon-sponsor-tiers"), null);
});

test("renders only a notice when the companion cannot be found", async () => {
  const { root } = await renderWidget({ ok: false });

  assert.equal(
    root.querySelector(".dogathon-sponsor-message")?.textContent,
    "We could not find this companion.",
  );
  assert.equal(root.querySelector("a"), null);
});

for (const [query, expected] of [
  ["sponsored=1", "Thank you! Your sponsorship is confirmed."],
  ["checkout=canceled", "Checkout was canceled. No payment was made."],
  ["error=invalid", "Please check your details and try again."],
  ["error=invalid-tier", "Please choose a sponsorship tier and try again."],
  [
    "error=rate-limited",
    "Too many checkout attempts. Please wait and try again.",
  ],
  [
    "error=unavailable",
    "This companion is not currently available for sponsorship.",
  ],
  [
    "error=billing",
    "Checkout is temporarily unavailable. Please try again later.",
  ],
] as const) {
  test(`renders the ${query} return state instead of the form`, async () => {
    const { root } = await renderWidget({
      url: `https://rescue.example/dogs/biscuit?${query}`,
    });

    assert.equal(
      root.querySelector(".dogathon-sponsor-message")?.textContent,
      expected,
    );
    assert.equal(root.querySelector("form"), null);
  });
}
