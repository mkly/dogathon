type CompanionFactValues = {
  ageText?: string | null;
  breed?: string | null;
  sex?: string | null;
  weightText?: string | null;
};

type CompanionSearchParams = {
  error?: string | string[];
  sponsored?: string | string[];
};

export function companionFacts(companion: CompanionFactValues) {
  return [companion.breed, companion.sex, companion.ageText, companion.weightText]
    .filter(Boolean)
    .join(" · ");
}

export function sponsorshipSucceeded(searchParams: CompanionSearchParams) {
  return searchParams.sponsored === "1" && !searchParams.error;
}
