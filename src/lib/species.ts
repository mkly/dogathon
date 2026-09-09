import pluralize from "pluralize";

const SPECIES_ALIASES: Record<string, string> = {
  puppy: "dog",
  canine: "dog",
  kitten: "cat",
  feline: "cat",
  bunny: "rabbit",
  cavy: "guinea-pig",
  hen: "bird",
  parrot: "bird",
  parakeet: "bird",
  snake: "reptile",
  lizard: "reptile",
  turtle: "reptile",
  tortoise: "reptile",
  pony: "horse",
};

const SPECIES_LABELS: Record<string, string> = {
  dog: "Dog",
  cat: "Cat",
  rabbit: "Rabbit",
  "guinea-pig": "Guinea pig",
  bird: "Bird",
  reptile: "Reptile",
  horse: "Horse",
  pig: "Pig",
  ferret: "Ferret",
};

export function normalizeSpecies(raw: string): string {
  const words = raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
  if (!words || !/[\p{L}\p{N}]/u.test(words)) return "";

  const singular = pluralize.singular(words);
  const slug = singular
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return SPECIES_ALIASES[slug] ?? slug;
}

export function speciesLabel(slug: string): string {
  const normalized = normalizeSpecies(slug);
  if (!normalized) return "";
  return (
    SPECIES_LABELS[normalized] ??
    normalized
      .split("-")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
  );
}
