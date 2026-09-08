import { isAllowedOrigin } from "@/lib/rescue-settings";
import { getPublicOrganization } from "@/lib/public-roster-cache";
import {
  startSponsorshipCheckout,
  type SponsorshipCheckoutDependencies,
  type SponsorshipCheckoutErrorCode,
  type SponsorshipOrganization,
} from "@/lib/sponsorship-checkout";

type CheckoutPayload = {
  returnTo?: unknown;
  source?: unknown;
  sponsorEmail?: unknown;
  sponsorName?: unknown;
  tier?: unknown;
};

type HandlerDependencies = {
  checkoutDependencies?: SponsorshipCheckoutDependencies;
  findOrganization(slug: string): Promise<SponsorshipOrganization | null>;
};

const defaultDependencies: HandlerDependencies = {
  findOrganization: getPublicOrganization,
};

function corsHeaders(organization: SponsorshipOrganization | null, origin: string | null) {
  const headers = new Headers({ Vary: "Origin" });
  if (origin && organization?.settings && isAllowedOrigin(organization.settings, origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function destination(returnTo: unknown, organization: SponsorshipOrganization) {
  if (typeof returnTo !== "string") return null;
  let base: URL;
  try {
    base = new URL(returnTo);
  } catch {
    return null;
  }
  if (
    !organization.settings
    || !isAllowedOrigin(organization.settings, base.origin)
    || base.username
    || base.password
  ) return null;

  const withQuery = (key: string, value: string) => {
    const url = new URL(base);
    url.searchParams.set(key, value);
    return url;
  };
  const success = withQuery("sponsored", "1");
  success.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  const successUrl = success.toString().replace(
    "%7BCHECKOUT_SESSION_ID%7D",
    "{CHECKOUT_SESSION_ID}",
  );

  return {
    cancelUrl: withQuery("checkout", "canceled").toString(),
    errorUrl(code: SponsorshipCheckoutErrorCode) {
      return withQuery("error", code).toString();
    },
    successUrl,
  };
}

async function readPayload(request: Request): Promise<{ format: "form" | "json"; payload: CheckoutPayload } | null> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  try {
    if (contentType === "application/json") {
      const payload: unknown = await request.json();
      return payload && typeof payload === "object"
        ? { format: "json", payload: payload as CheckoutPayload }
        : null;
    }
    if (contentType === "application/x-www-form-urlencoded") {
      return { format: "form", payload: Object.fromEntries(await request.formData()) };
    }
  } catch {
    return null;
  }
  return null;
}

function jsonError(code: SponsorshipCheckoutErrorCode, status: number, headers: Headers) {
  return Response.json({ error: code }, { status, headers });
}

function redirectResponse(url: string, headers: Headers) {
  const redirectHeaders = new Headers(headers);
  redirectHeaders.set("Location", url);
  return new Response(null, { status: 303, headers: redirectHeaders });
}

export function createPublicCheckoutPostHandler(dependencies: HandlerDependencies = defaultDependencies) {
  return async function post(
    request: Request,
    { params }: { params: Promise<{ orgSlug: string }> },
  ) {
    const { orgSlug } = await params;
    const origin = request.headers.get("origin");
    const organization = await dependencies.findOrganization(orgSlug);
    const responseHeaders = corsHeaders(organization, origin);
    const parsed = await readPayload(request);
    if (!parsed || !organization) return jsonError("invalid", 400, responseHeaders);

    const urls = destination(parsed.payload.returnTo, organization);
    if (!urls) return jsonError("invalid", 400, responseHeaders);

    const result = await startSponsorshipCheckout({
      headers: request.headers,
      orgSlug,
      sponsorEmail: parsed.payload.sponsorEmail,
      sponsorName: parsed.payload.sponsorName,
      target: { kind: "source", value: parsed.payload.source },
      tier: parsed.payload.tier,
    }, () => urls, {
      dependencies: dependencies.checkoutDependencies,
      organization,
    });

    if (result.ok) {
      if (parsed.format === "form") return redirectResponse(result.url, responseHeaders);
      return Response.json({ url: result.url }, { headers: responseHeaders });
    }

    const code = result.reason === "checkout-error" ? result.code : "invalid";
    if (result.reason === "checkout-error" && result.retryAfterSeconds) {
      responseHeaders.set("Retry-After", String(result.retryAfterSeconds));
    }
    if (parsed.format === "form") {
      return redirectResponse(
        result.reason === "checkout-error" && result.errorUrl
          ? result.errorUrl
          : urls.errorUrl(code),
        responseHeaders,
      );
    }
    const status = code === "rate-limited"
      ? 429
      : code === "unavailable" ? 409 : code === "billing" ? 502 : 400;
    return jsonError(code, status, responseHeaders);
  };
}

export function createPublicCheckoutOptionsHandler(dependencies: HandlerDependencies = defaultDependencies) {
  return async function options(
    request: Request,
    { params }: { params: Promise<{ orgSlug: string }> },
  ) {
    const { orgSlug } = await params;
    const headers = corsHeaders(
      await dependencies.findOrganization(orgSlug),
      request.headers.get("origin"),
    );
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    return new Response(null, { status: 204, headers });
  };
}

export const POST = createPublicCheckoutPostHandler();
export const OPTIONS = createPublicCheckoutOptionsHandler();
