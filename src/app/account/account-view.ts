type SponsorshipActionInput = {
  id: string;
  organizationSlug: string;
  status: string;
  stripeCustomerId: string | null;
};

export function sponsorshipAccountActions({
  id,
  organizationSlug,
  status,
  stripeCustomerId,
}: SponsorshipActionInput) {
  const canSwitchCompanions = status === "active" || status === "awaiting";

  return {
    billingPortal: Boolean(stripeCustomerId),
    switchCompanionsHref: canSwitchCompanions
      ? `/${organizationSlug}/sponsor/next?sponsorship=${id}`
      : null,
  };
}
