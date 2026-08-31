import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseDogRoster } from "./parser.ts";

const pageA = readFile(new URL("../../seed/dogs-page-A.html", import.meta.url), "utf8");
const pageB = readFile(new URL("../../seed/dogs-page-B.html", import.meta.url), "utf8");

test("offline fixture parsing returns a complete roster", async () => {
  const dogs = await parseDogRoster(await pageA, { deterministic: true });

  assert.ok(dogs.length >= 30);
  assert.ok(dogs.every((dog) => dog.name && dog.photoUrls.length > 0));
  assert.equal(dogs.find((dog) => dog.name === "Hattie")?.adopted, false);
  assert.equal(dogs.find((dog) => dog.name === "Charlie")?.adopted, true);
  assert.equal(dogs.find((dog) => dog.name === "Jack")?.adopted, true);
  assert.equal(dogs.find((dog) => dog.name === "Romulus")?.adopted, true);
});

test("a hand-typed adoption marker updates the parsed record", async () => {
  const dogs = await parseDogRoster(await pageB, { deterministic: true });
  const hattie = dogs.find((dog) => dog.name === "Hattie");

  assert.ok(hattie);
  assert.equal(hattie.adopted, true);
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

  await parseDogRoster(await pageA, {
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

  const dogs = await parseDogRoster(await pageA, {
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    model: "roster-parser",
    fetch: fetcher,
  });

  assert.ok(dogs.length >= 30);
  assert.equal(dogs.find((dog) => dog.name === "Ghost"), undefined);
});

test("a successful model parse is returned as-is", async () => {
  const { fetcher } = stubFetch([
    { name: "Biscuit", breed: "corgi mix", photoUrls: ["https://example.test/biscuit.jpg"], adopted: true },
  ]);

  const dogs = await parseDogRoster(await pageA, {
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    model: "roster-parser",
    fetch: fetcher,
  });

  assert.deepEqual(dogs.map((dog) => dog.name), ["Biscuit"]);
  assert.equal(dogs[0].adopted, true);
  assert.deepEqual(dogs[0].careNotes, []);
});
