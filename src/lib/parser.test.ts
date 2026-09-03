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
    dobText: "1/2/23",
    ageText: "est DOB 1/2/23",
    sex: "female",
    weightText: "18 lbs",
    personality: "gentle",
    careNotes: ["Likes naps & snacks"],
    photoUrls: ["https://example.test/peanut.jpg"],
    adopted: false,
  }]);
});

function stubFetch(body: unknown) {
  const prompts: string[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    prompts.push(payload.messages[0].content);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }));
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
