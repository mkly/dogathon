import { randomUUID } from "node:crypto";

import { processVolunteerPhoto } from "@/app/[orgSlug]/volunteer/photo";
import { MAX_PHOTO_BYTES } from "@/app/[orgSlug]/volunteer/photo-limits";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { deletePhoto, photoKey, putPhoto } from "@/lib/photo-storage";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRateLimitIdentity, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import { parseVolunteerPhotoUpload } from "@/lib/volunteer-photo-upload";

function uploadError(error: "photo-size" | "photo-type") {
  return Response.json({ error }, { status: 400 });
}

type UploadDependencies = {
  createPhoto: (input: {
    id: string;
    checkInId: string;
    orgId: string;
    residentId: string;
    storageKey: string;
    url: string;
    mime: string;
    byteSize: number;
  }) => Promise<void>;
  deletePhoto: typeof deletePhoto;
  findCheckIn: (orgId: string, userId: string, checkInId: string) => Promise<string | null>;
  getAccess: typeof getOrganizationAccessBySlug;
  newId: () => string;
  processPhoto: typeof processVolunteerPhoto;
  putPhoto: typeof putPhoto;
  rateLimit: (requestHeaders: Headers) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};

const uploadDependencies: UploadDependencies = {
  async createPhoto(input) {
    await prisma.volunteerPhoto.create({ data: input });
  },
  deletePhoto,
  async findCheckIn(orgId, userId, checkInId) {
    const checkIn = await prisma.checkIn.findFirst({
      where: {
        id: checkInId,
        orgId,
        status: "in_progress",
        userId,
      },
      select: { residentId: true },
    });
    return checkIn?.residentId ?? null;
  },
  getAccess: getOrganizationAccessBySlug,
  newId: randomUUID,
  processPhoto: processVolunteerPhoto,
  putPhoto,
  async rateLimit(requestHeaders) {
    return checkRateLimit({
      ...RATE_LIMITS.volunteerPhotoUpload,
      identity: await getRateLimitIdentity(requestHeaders),
      scope: "volunteer-photo-upload",
    });
  },
};

export function createVolunteerPhotoPostHandler(dependencies: UploadDependencies) {
  return async function postVolunteerPhoto(request: Request) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: "photo-type" }, { status: 400 });
    }

    const parsed = parseVolunteerPhotoUpload(formData);
    if (!parsed.success) return Response.json({ error: "photo-type" }, { status: 400 });
    const { orgSlug, checkInId, photo } = parsed.data;

    const access = await dependencies.getAccess(request.headers, orgSlug, {
      roster: ["contribute"],
    });
    if (!access) return Response.json({ error: "Organization not found" }, { status: 404 });
    if (!access.context) {
      return Response.json(
        { error: "Organization membership required" },
        { status: access.authenticated ? 403 : 401 },
      );
    }

    const rateLimit = await dependencies.rateLimit(request.headers);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

    const residentId = await dependencies.findCheckIn(
      access.context.orgId,
      access.context.userId,
      checkInId,
    );
    if (!residentId) return Response.json({ error: "Check-in not found" }, { status: 404 });
    if (photo.size > MAX_PHOTO_BYTES) return uploadError("photo-size");

    const processed = await dependencies.processPhoto(new Uint8Array(await photo.arrayBuffer()));
    if (!processed) return uploadError("photo-type");

    const id = dependencies.newId();
    const storageKey = photoKey({ orgId: access.context.orgId, photoId: id, ext: "jpg" });
    const { url } = await dependencies.putPhoto({
      key: storageKey,
      data: processed.data,
      mime: processed.mime,
    });
    try {
      await dependencies.createPhoto({
        id,
        checkInId,
        orgId: access.context.orgId,
        residentId,
        storageKey,
        url,
        mime: processed.mime,
        byteSize: processed.data.byteLength,
      });
    } catch (error) {
      await dependencies.deletePhoto(storageKey).catch(() => undefined);
      throw error;
    }

    return Response.json({ id, url }, { status: 201 });
  };
}

export const POST = createVolunteerPhotoPostHandler(uploadDependencies);
