import { z } from "zod";

import { uuidSchema } from "./uuid.ts";

const uploadSchema = z.object({
  orgSlug: z.string().trim().min(1),
  residentId: uuidSchema,
  photo: z.file(),
});

export function parseVolunteerPhotoUpload(formData: FormData) {
  return uploadSchema.safeParse(Object.fromEntries(formData));
}
