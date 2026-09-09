import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCompanionRoster } from "./parser.ts";
import { normalizeSpecies, speciesLabel } from "./species.ts";

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
    <p><strong>Personality:</strong> gentle<br><strong>Species:</strong> Dogs<br><strong>Breed:</strong> terrier mix<br>
      <strong>Age:</strong> est DOB 1/2/23<br><strong>Weight:</strong> 18 lbs<br>
      <strong>Sex:</strong> female</p>
    <ul><li>Likes naps &amp; snacks</li></ul>
    <img src="https://example.test/peanut.jpg?width=800&amp;fit=cover">
    <h3>Footer</h3>
  `, { deterministic: true });

  assert.deepEqual(companions, [{
    name: "Peanut & Butter",
    species: "Dogs",
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
    species: "",
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

test("species values normalize to open-ended canonical slugs and human labels", () => {
  assert.equal(normalizeSpecies("  Puppies  "), "dog");
  assert.equal(normalizeSpecies("GUINEA   PIGS"), "guinea-pig");
  assert.equal(normalizeSpecies("Tortoises"), "reptile");
  assert.equal(normalizeSpecies("Sugar Gliders"), "sugar-glider");
  assert.equal(normalizeSpecies("---"), "");
  assert.equal(speciesLabel("guinea-pig"), "Guinea pig");
  assert.equal(speciesLabel("sugar-glider"), "Sugar Glider");
});

test("a labeled descriptor line keeps its value as the description offline", async () => {
  const companions = await parseCompanionRoster(`
Maple
-----

Temperament: calm and cuddly
Breed: beagle mix
Age: 3 years

![Maple](https://example.test/maple.jpg)
  `, { deterministic: true });

  assert.equal(companions[0]?.personality, "calm and cuddly");
});
