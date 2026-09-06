export const POSTSCRIPT_MAX_LENGTH = 2000;

export function postscriptOverLimitMessage(): string {
  return `Email postscript must be ${POSTSCRIPT_MAX_LENGTH} characters or fewer.`;
}
