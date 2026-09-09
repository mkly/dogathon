import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseEnvironment } from "./env.ts";
import { deletePhoto, getPhoto, photoKey, putPhoto, webPhotoKey } from "./photo-storage.ts";

const databaseUrl = "postgresql://dogathon:dogathon@localhost:5432/dogathon";

test("builds the organization-scoped volunteer photo key", () => {
  const key = photoKey({ orgId: "org-123", photoId: "photo-456", ext: ".jpeg" });
  assert.equal(key, "orgs/org-123/volunteer-photos/photo-456.jpeg");
  assert.equal(webPhotoKey(key), "orgs/org-123/volunteer-photos/photo-456-web.jpeg");
});

test("round trips and deletes a photo through the local fallback", async () => {
  const localRoot = await mkdtemp(path.join(tmpdir(), "dogathon-photo-storage-"));
  const environment = parseEnvironment({ DATABASE_URL: databaseUrl });
  const logs: string[] = [];
  const dependencies = { env: environment, localRoot, log: (message: string) => logs.push(message) };
  const key = photoKey({ orgId: "org with spaces", photoId: "photo-456", ext: "webp" });
  const data = Uint8Array.from([1, 3, 5, 7]);

  try {
    assert.deepEqual(await putPhoto({ key, data, mime: "image/webp" }, dependencies), {
      url: "/api/volunteer-photos/photo-456?org=org%20with%20spaces",
    });
    assert.deepEqual(await getPhoto(key, dependencies), { data, mime: "image/webp" });
    assert.match(logs[0] ?? "", /storing volunteer photos in \.\/\.photos\//u);

    await deletePhoto(key, dependencies);
    assert.equal(await getPhoto(key, dependencies), null);
  } finally {
    await rm(localRoot, { recursive: true, force: true });
  }
});

test("uploads to S3 with content metadata and builds the default public URL", async (context) => {
  const environment = parseEnvironment({
    DATABASE_URL: databaseUrl,
    AWS_REGION: "us-west-2",
    AWS_ACCESS_KEY_ID: "access-key",
    AWS_SECRET_ACCESS_KEY: "secret-key",
    S3_PHOTO_BUCKET: "dogathon-photos",
  });
  const client = new S3Client({
    region: environment.AWS_REGION,
    credentials: { accessKeyId: "access-key", secretAccessKey: "secret-key" },
  });
  const commands: unknown[] = [];
  context.mock.method(
    client as unknown as { send: (command: unknown) => Promise<unknown> },
    "send",
    async (command: unknown) => {
      commands.push(command);
      return {};
    },
  );
  const key = photoKey({ orgId: "org-123", photoId: "photo-456", ext: "jpg" });

  assert.deepEqual(
    await putPhoto({ key, data: Uint8Array.from([2, 4]), mime: "image/jpeg" }, {
      env: environment,
      s3Client: client,
    }),
    { url: "https://dogathon-photos.s3.us-west-2.amazonaws.com/orgs/org-123/volunteer-photos/photo-456.jpg" },
  );
  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.deepEqual(commands[0].input, {
    Bucket: "dogathon-photos",
    Key: key,
    Body: Uint8Array.from([2, 4]),
    ContentType: "image/jpeg",
    CacheControl: "public,max-age=31536000,immutable",
  });
  assert.equal("ACL" in commands[0].input, false);
});

test("uses the configured S3 public base URL and custom cache policy", async (context) => {
  const environment = parseEnvironment({
    DATABASE_URL: databaseUrl,
    AWS_REGION: "us-east-1",
    S3_PHOTO_BUCKET: "dogathon-photos",
    S3_USE_AMBIENT_CREDENTIALS: "true",
    S3_PUBLIC_BASE_URL: "https://photos.example.com///",
  });
  const client = new S3Client({ region: environment.AWS_REGION });
  let command: unknown;
  context.mock.method(
    client as unknown as { send: (input: unknown) => Promise<unknown> },
    "send",
    async (input: unknown) => {
      command = input;
      return {};
    },
  );
  const key = photoKey({ orgId: "org-123", photoId: "photo-456", ext: "png" });

  assert.deepEqual(await putPhoto({
    key,
    data: Uint8Array.from([8]),
    mime: "image/png",
    cacheControl: "public,max-age=60",
  }, { env: environment, s3Client: client }), {
    url: "https://photos.example.com/orgs/org-123/volunteer-photos/photo-456.png",
  });
  assert.ok(command instanceof PutObjectCommand);
  assert.equal(command.input.CacheControl, "public,max-age=60");
});
