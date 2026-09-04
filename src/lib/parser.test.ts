import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCompanionRoster } from "./parser.ts";

const pageA = readFile(new URL("../../seed/dogs-page-A.html", import.meta.url), "utf8");
const pageB = readFile(new URL("../../seed/dogs-page-B.html", import.meta.url), "utf8");

test("offline fixture parsing returns a complete roster", async () => {
  const companions = await parseCompanionRoster(await pageA, { deterministic: true });

  assert.ok(companions.length >= 30);
  assert.ok(companions.every((companion) => companion.name && companion.photoUrls.length > 0));
  assert.equal(companions.find((companion) => companion.name === "Hattie")?.adopted, false);
  assert.equal(companions.find((companion) => companion.name === "Charlie")?.adopted, true);
  assert.equal(companions.find((companion) => companion.name === "Jack")?.adopted, true);
  assert.equal(companions.find((companion) => companion.name === "Romulus")?.adopted, true);
});

test("a hand-typed adoption marker updates the parsed record", async () => {
  const companions = await parseCompanionRoster(await pageB, { deterministic: true });
  const hattie = companions.find((companion) => companion.name === "Hattie");

  assert.ok(hattie);
  assert.equal(hattie.adopted, true);
});

test("HTML parsing uses DOM sections, decoded attributes, and list items", async () => {
  const companions = await parseCompanionRoster(`
    <h3>Peanut &amp; Butter</h3>
    <p><strong>Personality:</strong> gentle<br><strong>Breed:</strong> terrier mix<br>
      <strong>Age:</strong> est DOB 1/2/23<br><strong>Weight:</strong> 18 lbs<br>
      <strong>Sex:</strong> female</p>
    <ul><li>Likes naps &amp; snacks</li></ul>
    <img src="https://example.test/peanut.jpg?width=800&amp;fit=cover">
    <h3>Footer</h3>
  `, { deterministic: true });

  assert.deepEqual(companions, [{
    name: "Peanut & Butter",
    breed: "terrier mix",
    dobText: "2023-01-02",
    ageText: "est DOB 1/2/23",
    sex: "female",
    weightText: "18 lbs",
    personality: "gentle",
    careNotes: ["Likes naps & snacks"],
    photoUrls: ["https://example.test/peanut.jpg"],
    adopted: false,
  }]);
});

test("DOB phrases are normalized and markdown sections come from the mdast", async () => {
  const companions = await parseCompanionRoster(`
Willow
------

Personality: curious
Breed: shepherd mix
Age: Estimated DOB: January 2, 2023
Weight: 42 lbs
Sex: female

- Needs a quiet home

![Willow](https://example.test/willow.jpg)

Footer
------
  `, { deterministic: true });

  assert.deepEqual(companions, [{
    name: "Willow",
    breed: "shepherd mix",
    dobText: "2023-01-02",
    ageText: "Estimated DOB: January 2, 2023",
    sex: "female",
    weightText: "42 lbs",
    personality: "curious",
    careNotes: ["Needs a quiet home"],
    photoUrls: ["https://example.test/willow.jpg"],
    adopted: false,
  }]);
});

test("wrapped cards and non-breaking spaces parse like plain sections", async () => {
  const companions = await parseCompanionRoster(`
    <div class="grid"><div class="card">
      <div><h3>Juniper</h3></div>
      <div><p><strong>Personality:</strong>&nbsp;calm<br><strong>Breed:</strong> beagle mix<br>
        <strong>Age:</strong> 3 years<br><strong>Weight:</strong> 22&nbsp;lbs<br>
        <strong>Sex:</strong> female</p>
      <ul><li>Walks&nbsp;well on leash</li></ul>
      <img src="https://example.test/juniper.png"></div>
    </div></div>
  `, { deterministic: true });

  assert.equal(companions.length, 1);
  assert.deepEqual(companions[0].careNotes, ["Walks well on leash"]);
  assert.equal(companions[0].personality, "calm");
  assert.equal(companions[0].weightText, "22 lbs");
  assert.deepEqual(companions[0].photoUrls, ["https://example.test/juniper.png"]);
});

function stubFetch(body: unknown) {
  const prompts: string[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    prompts.push(payload.messages[0].content);
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ elements: body }) } }],
    });
  }) as unknown as typeof fetch;

  return { fetcher, prompts };
}

test("the model prompt carries the photo URLs the records need", async () => {
  const { fetcher, prompts } = stubFetch([]);

  await parseCompanionRoster(await pageA, {
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    model: "roster-parser",
    fetch: fetcher,
  });

  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /\[photo: https:\/\/\S+\.jpg\]/);
});

test("a model parse with no usable records falls back to the offline parser", async () => {
  const { fetcher } = stubFetch([{ name: "Ghost", photoUrls: [] }]);

  const companions = await parseCompanionRoster(await pageA, {
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    model: "roster-parser",
    fetch: fetcher,
  });

  assert.ok(companions.length >= 30);
  assert.equal(companions.find((companion) => companion.name === "Ghost"), undefined);
});

test("a successful model parse is returned as-is", async () => {
  const { fetcher } = stubFetch([
    { name: "Biscuit", breed: "corgi mix", photoUrls: ["https://example.test/biscuit.jpg"], adopted: true },
  ]);

  const companions = await parseCompanionRoster(await pageA, {
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    model: "roster-parser",
    fetch: fetcher,
  });

  assert.deepEqual(companions.map((companion) => companion.name), ["Biscuit"]);
  assert.equal(companions[0].adopted, true);
  assert.deepEqual(companions[0].careNotes, []);
});

test("a scraped detail page with a gallery above its Meet heading parses offline", async () => {
  const companions = await parseCompanionRoster(`
[Back to All Dogs](https://rescue.example/adoptions/dogs/)

![Stripe - Photo 1](https://rescue.example/uploads/stripe-1.jpg)

![Stripe - Photo 2](https://rescue.example/uploads/stripe-2.jpg)

## Meet Stripe

Stripe is currently in a foster home. Sign up to meet him!

**Age:**
1 y, 11 m

**Weight:**
50 lbs; 11 oz

**Gender:**
Male

**Breed:**
Shepherd

[how to adopt me](https://rescue.example/adoption-process/)

![Tulip - Photo 1](https://rescue.example/uploads/tulip-1.jpg)

## Meet Tulip

Tulip and Daisy are a bonded pair.

**Age:**
4 y

**Gender:**
Female

**Breed:**
Australian Cattle Dog
  `, { deterministic: true });

  assert.deepEqual(companions.map((companion) => ({
    name: companion.name,
    sex: companion.sex,
    breed: companion.breed,
    ageText: companion.ageText,
    weightText: companion.weightText,
    careNotes: companion.careNotes,
    photoUrls: companion.photoUrls,
    adopted: companion.adopted,
  })), [
    {
      name: "Stripe",
      sex: "Male",
      breed: "Shepherd",
      ageText: "1 y, 11 m",
      weightText: "50 lbs; 11 oz",
      careNotes: ["In a foster home"],
      photoUrls: [
        "https://rescue.example/uploads/stripe-1.jpg",
        "https://rescue.example/uploads/stripe-2.jpg",
      ],
      adopted: false,
    },
    {
      name: "Tulip",
      sex: "Female",
      breed: "Australian Cattle Dog",
      ageText: "4 y",
      weightText: "",
      careNotes: ["Bonded pair"],
      photoUrls: ["https://rescue.example/uploads/tulip-1.jpg"],
      adopted: false,
    },
  ]);
});

test("the model prompt turns markdown images into photo markers", async () => {
  const { fetcher, prompts } = stubFetch([
    { name: "Stripe", photoUrls: ["https://rescue.example/uploads/stripe-1.jpg"] },
  ]);

  await parseCompanionRoster(
    "![Stripe](https://rescue.example/uploads/stripe-1.jpg?w=800)\n\n## Meet Stripe\n\n**Breed:** Shepherd",
    {
      apiKey: "test-key",
      baseUrl: "https://model.example/v1",
      model: "roster-parser",
      fetch: fetcher,
    },
  );

  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /\[photo: https:\/\/rescue\.example\/uploads\/stripe-1\.jpg\]/);
  assert.doesNotMatch(prompts[0], /!\[Stripe\]/);
  assert.match(prompts[0], /Meet Stripe/);
});
