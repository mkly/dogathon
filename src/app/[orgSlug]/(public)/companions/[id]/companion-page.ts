import { speciesLabel } from "@/lib/species";

type CompanionFactValues = {
  ageText?: string | null;
  breed?: string | null;
  species?: string | null;
  sex?: string | null;
  weightText?: string | null;
};

type CompanionSearchParams = {
  error?: string | string[];
  sponsored?: string | string[];
};

// Matches URLSearchParams.get, which the client banner reads: a repeated
// parameter resolves to its first value rather than to nothing.
function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function companionFacts(companion: CompanionFactValues) {
  return [
    companion.species ? speciesLabel(companion.species) : "",
    companion.breed,
    companion.sex,
    companion.ageText,
    companion.weightText,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function sponsorshipSucceeded(searchParams: CompanionSearchParams) {
  return firstValue(searchParams.sponsored) === "1" && !firstValue(searchParams.error);
}
