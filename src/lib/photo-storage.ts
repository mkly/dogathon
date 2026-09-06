import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env as appEnv } from "./env.ts";
import type { AppEnvironment } from "./env.ts";

const DEFAULT_CACHE_CONTROL = "public,max-age=31536000,immutable";
const LOCAL_PHOTO_ROOT = ".photos";

type PhotoStorageEnvironment = Pick<
  AppEnvironment,
  | "AWS_REGION"
  | "AWS_ACCESS_KEY_ID"
  | "AWS_SECRET_ACCESS_KEY"
  | "S3_USE_AMBIENT_CREDENTIALS"
  | "S3_PHOTO_BUCKET"
  | "S3_PUBLIC_BASE_URL"
  | "features"
>;

type PhotoStorageDependencies = {
  env?: PhotoStorageEnvironment;
  localRoot?: string;
  log?: (message: string) => void;
  s3Client?: S3Client;
};

type PutPhotoInput = {
  key: string;
  data: Uint8Array;
  mime: string;
  cacheControl?: string;
};

type StoredPhoto = {
  data: Uint8Array;
  mime: string;
};

let describedLocalFallback = false;

function describeLocalFallback(log: (message: string) => void) {
  if (describedLocalFallback) return;
  describedLocalFallback = true;
  log("[photo-storage] S3 is not configured; storing volunteer photos in ./.photos/.");
}

function storageEnvironment(dependencies: PhotoStorageDependencies) {
  return dependencies.env ?? appEnv;
}

function s3Client(environment: PhotoStorageEnvironment, dependencies: PhotoStorageDependencies) {
  if (dependencies.s3Client) return dependencies.s3Client;
  if (environment.S3_USE_AMBIENT_CREDENTIALS) {
    return new S3Client({ region: environment.AWS_REGION });
  }
  if (!environment.AWS_ACCESS_KEY_ID || !environment.AWS_SECRET_ACCESS_KEY) {
    throw new Error("S3 credentials are required unless S3_USE_AMBIENT_CREDENTIALS is enabled.");
  }
  return new S3Client({
    region: environment.AWS_REGION,
    credentials: {
      accessKeyId: environment.AWS_ACCESS_KEY_ID,
      secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function encodedKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function publicS3Url(environment: PhotoStorageEnvironment, key: string) {
  const base = environment.S3_PUBLIC_BASE_URL
    ?? `https://${environment.S3_PHOTO_BUCKET}.s3.${environment.AWS_REGION}.amazonaws.com`;
  return `${base}/${encodedKey(key)}`;
}

function localPhotoPath(key: string, dependencies: PhotoStorageDependencies) {
  if (path.isAbsolute(key) || key.split(/[\\/]/u).some((part) => part === "..")) {
    throw new Error("Photo storage keys must stay within the configured photo directory.");
  }
  const root = path.resolve(dependencies.localRoot ?? path.join(process.cwd(), LOCAL_PHOTO_ROOT));
  const file = path.resolve(root, key);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new Error("Photo storage keys must stay within the configured photo directory.");
  }
  return file;
}

function localPhotoUrl(key: string) {
  const match = /^orgs\/([^/]+)\/volunteer-photos\/([^/.]+)\.[^/]+$/u.exec(key);
  if (!match) throw new Error(`Invalid volunteer photo key: ${key}`);
  return `/api/volunteer-photos/${encodeURIComponent(match[2])}?org=${encodeURIComponent(match[1])}`;
}

function isMissingObject(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = "$metadata" in error
    ? (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
  return error.name === "NoSuchKey" || error.name === "NotFound" || status === 404;
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function photoKey(input: { orgId: string; photoId: string; ext: string }) {
  const extension = input.ext.replace(/^\.+/u, "");
  if (!input.orgId || !input.photoId || !extension || extension.includes("/") || extension.includes("\\")) {
    throw new Error("Photo keys require an organization ID, photo ID, and file extension.");
  }
  return `orgs/${input.orgId}/volunteer-photos/${input.photoId}.${extension}`;
}

export async function putPhoto(
  input: PutPhotoInput,
  dependencies: PhotoStorageDependencies = {},
): Promise<{ url: string }> {
  const environment = storageEnvironment(dependencies);
  if (environment.features.s3) {
    await s3Client(environment, dependencies).send(new PutObjectCommand({
      Bucket: environment.S3_PHOTO_BUCKET,
      Key: input.key,
      Body: input.data,
      ContentType: input.mime,
      CacheControl: input.cacheControl ?? DEFAULT_CACHE_CONTROL,
    }));
    return { url: publicS3Url(environment, input.key) };
  }

  describeLocalFallback(dependencies.log ?? console.info);
  const file = localPhotoPath(input.key, dependencies);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, input.data);
  await writeFile(`${file}.json`, JSON.stringify({ mime: input.mime }));
  return { url: localPhotoUrl(input.key) };
}

export async function getPhoto(
  key: string,
  dependencies: PhotoStorageDependencies = {},
): Promise<StoredPhoto | null> {
  const environment = storageEnvironment(dependencies);
  if (environment.features.s3) {
    try {
      const response = await s3Client(environment, dependencies).send(new GetObjectCommand({
        Bucket: environment.S3_PHOTO_BUCKET,
        Key: key,
      }));
      if (!response.Body) return null;
      return {
        data: await response.Body.transformToByteArray(),
        mime: response.ContentType ?? "application/octet-stream",
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  describeLocalFallback(dependencies.log ?? console.info);
  const file = localPhotoPath(key, dependencies);
  try {
    const [data, metadata] = await Promise.all([
      readFile(file),
      readFile(`${file}.json`, "utf8"),
    ]);
    const parsed = JSON.parse(metadata) as { mime?: unknown };
    if (typeof parsed.mime !== "string") {
      throw new Error(`Photo metadata is missing its MIME type: ${key}`);
    }
    return { data: new Uint8Array(data), mime: parsed.mime };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function deletePhoto(
  key: string,
  dependencies: PhotoStorageDependencies = {},
): Promise<void> {
  const environment = storageEnvironment(dependencies);
  if (environment.features.s3) {
    await s3Client(environment, dependencies).send(new DeleteObjectCommand({
      Bucket: environment.S3_PHOTO_BUCKET,
      Key: key,
    }));
    return;
  }

  describeLocalFallback(dependencies.log ?? console.info);
  const file = localPhotoPath(key, dependencies);
  await Promise.all([rm(file, { force: true }), rm(`${file}.json`, { force: true })]);
}
