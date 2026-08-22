export const VOLUNTEER_ERRORS = {
  "no-dog": "Choose a dog first.",
  "no-note": "Add a quick note before submitting.",
  "note-too-long": "Keep the note to 240 characters or fewer.",
  unavailable: "That dog is no longer available. Pick another.",
  "photo-type": "Choose a JPG, PNG, WebP, GIF, HEIC, or HEIF photo.",
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
