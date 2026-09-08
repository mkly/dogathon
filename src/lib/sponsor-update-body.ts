export const SPONSOR_UPDATE_BODY_MAX_LENGTH = 10_000;

export function sponsorUpdateBodyOverLimitMessage(): string {
  return `Email body must be ${SPONSOR_UPDATE_BODY_MAX_LENGTH} characters or fewer.`;
}
