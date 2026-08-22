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
