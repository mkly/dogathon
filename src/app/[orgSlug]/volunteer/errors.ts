export const VOLUNTEER_ERRORS = {
  "no-companion": "Choose a companion first.",
  "no-note": "Add a quick note before submitting.",
  "note-too-long": "Keep the note to 2,000 characters or fewer.",
  unavailable: "That companion is no longer available. Pick another.",
  "photo-type": "Choose a JPG, PNG, WebP, or GIF photo.",
  "photo-size": "Choose a photo smaller than 8 MB.",
} as const;

export type VolunteerErrorCode = keyof typeof VOLUNTEER_ERRORS;

/** Query params are user-controlled, so only known codes render a message. */
export function volunteerErrorMessage(code: string | undefined) {
  if (!code) {
    return undefined;
  }

  return VOLUNTEER_ERRORS[code as VolunteerErrorCode] ?? "Something went wrong. Try again.";
}
