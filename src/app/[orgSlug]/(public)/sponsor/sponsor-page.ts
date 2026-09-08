import { getPublicResidentBySource } from "@/lib/public-roster-cache";
import { normalizeSourceUrl } from "@/lib/source-url";

const MAX_SOURCE_URL_LENGTH = 2048;

type SourceSearchParam = string | string[] | undefined;
type SourceResident = { id: string; available: boolean };
type FindResidentBySource = (
  orgId: string,
  sourceUrl: string,
) => Promise<SourceResident | null>;

export type SponsorDestination =
  | { href: string; kind: "redirect" }
  | { kind: "unknown" };

function firstValue(value: SourceSearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export async function resolveSponsorDestination(
  {
    orgId,
    orgSlug,
    source,
  }: { orgId: string; orgSlug: string; source: SourceSearchParam },
  findResidentBySource: FindResidentBySource = getPublicResidentBySource,
): Promise<SponsorDestination> {
  const rawSource = firstValue(source);
  if (!rawSource || rawSource.length > MAX_SOURCE_URL_LENGTH) return { kind: "unknown" };

  const normalizedSource = normalizeSourceUrl(rawSource);
  if (!normalizedSource) return { kind: "unknown" };

  const resident = await findResidentBySource(orgId, normalizedSource);
  return resident
    ? { href: `/${orgSlug}/companions/${resident.id}`, kind: "redirect" }
    : { kind: "unknown" };
}
