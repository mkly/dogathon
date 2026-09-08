import {
  getPublicOrganization,
  getPublicResidentBySlug,
  getPublicResidentBySource,
} from "@/lib/public-roster-cache";
import {
  anonymousRateLimitIdentity,
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS, isAllowedOrigin } from "@/lib/rescue-settings";
import { normalizeSourceUrl } from "@/lib/source-url";

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

type PublicOrganization = {
  id: string;
  settings: {
    allowedOrigins: string[];
  } | null;
  sponsorshipTiers: Array<{
    id: string;
    monthlyCents: number;
    description: string;
    isDefault: boolean;
  }>;
};

type PublicResident = {
  id: string;
  name: string;
  slug: string;
  sourceUrl: string;
  species: string;
  breed: string;
  ageText: string;
  sex: string;
  photoUrls: string[];
  available: boolean;
  _count: { sponsorships: number };
};

type PublicCompanionDependencies = {
  getOrganization: (slug: string) => Promise<PublicOrganization | null>;
  getResidentBySlug: (orgId: string, slug: string) => Promise<PublicResident | null>;
  getResidentBySource: (orgId: string, sourceUrl: string) => Promise<PublicResident | null>;
  rateLimit: (requestHeaders: Headers) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};

type RouteContext = { params: Promise<{ orgSlug: string }> };

const dependencies: PublicCompanionDependencies = {
  getOrganization: getPublicOrganization,
  getResidentBySlug: getPublicResidentBySlug,
  getResidentBySource: getPublicResidentBySource,
  async rateLimit(requestHeaders) {
    return checkRateLimit({
      ...RATE_LIMITS.publicRead,
      identity: anonymousRateLimitIdentity(requestHeaders),
      scope: "public-read",
    });
  },
};

function corsHeaders(request: Request, organization: PublicOrganization | null) {
  const headers = new Headers({
    "Cache-Control": CACHE_CONTROL,
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && organization?.settings && isAllowedOrigin(organization.settings, origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function withPublicHeaders(
  response: Response,
  request: Request,
  organization: PublicOrganization | null,
) {
  for (const [name, value] of corsHeaders(request, organization)) {
    response.headers.set(name, value);
  }
  return response;
}

function notFound(request: Request, organization: PublicOrganization | null) {
  return withPublicHeaders(
    Response.json({ error: "Companion not found" }, { status: 404 }),
    request,
    organization,
  );
}

export function createPublicCompanionHandlers(
  publicDependencies: PublicCompanionDependencies = dependencies,
) {
  async function GET(request: Request, { params }: RouteContext) {
    const { orgSlug } = await params;
    const organization = await publicDependencies.getOrganization(orgSlug);
    if (!organization) return notFound(request, null);

    const rateLimit = await publicDependencies.rateLimit(request.headers);
    if (!rateLimit.allowed) {
      const limited = withPublicHeaders(
        rateLimitResponse(rateLimit.retryAfterSeconds),
        request,
        organization,
      );
      // A rate limit is per-caller, so a shared cache must never hand this
      // refusal to the next reader of the same companion.
      limited.headers.set("Cache-Control", "no-store");
      return limited;
    }

    const searchParams = new URL(request.url).searchParams;
    const companionSlug = searchParams.get("companion");
    const sourceUrl = companionSlug === null
      ? normalizeSourceUrl(searchParams.get("source") ?? "")
      : "";
    const resident = companionSlug !== null
      ? companionSlug
        ? await publicDependencies.getResidentBySlug(organization.id, companionSlug)
        : null
      : sourceUrl
        ? await publicDependencies.getResidentBySource(organization.id, sourceUrl)
        : null;
    if (!resident) return notFound(request, organization);

    const routeBase = new URL(request.url);
    const encodedSlug = encodeURIComponent(orgSlug);
    const companionUrl = new URL(
      `/${encodedSlug}/companions/${encodeURIComponent(resident.id)}`,
      routeBase,
    );
    const sponsorUrl = new URL(`/${encodedSlug}/sponsor`, routeBase);
    sponsorUrl.searchParams.set("source", resident.sourceUrl);

    const status = !resident.available
      ? "unavailable"
      : resident._count.sponsorships > 0 ? "sponsored" : "available";
    const defaultTier = organization.sponsorshipTiers.find((tier) => tier.isDefault)
      ?? organization.sponsorshipTiers[0];
    const response = Response.json({
      id: resident.id,
      name: resident.name,
      slug: resident.slug,
      sourceUrl: resident.sourceUrl,
      species: resident.species,
      breed: resident.breed,
      ageText: resident.ageText,
      sex: resident.sex,
      photoUrl: resident.photoUrls[0] ?? null,
      tiers: organization.sponsorshipTiers.map(({ id, monthlyCents, description, isDefault }) => ({
        id,
        monthlyCents,
        description,
        isDefault,
      })),
      monthlyCents: defaultTier?.monthlyCents ?? DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
      currency: "usd",
      status,
      companionUrl: companionUrl.toString(),
      sponsorUrl: sponsorUrl.toString(),
    });
    return withPublicHeaders(response, request, organization);
  }

  async function OPTIONS(request: Request, { params }: RouteContext) {
    const { orgSlug } = await params;
    const organization = await publicDependencies.getOrganization(orgSlug);
    const headers = corsHeaders(request, organization);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    return new Response(null, { headers, status: 204 });
  }

  return { GET, OPTIONS };
}

export const { GET, OPTIONS } = createPublicCompanionHandlers();
