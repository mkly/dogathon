import assert from "node:assert/strict";
import test from "node:test";

import { composeAndRefresh } from "./compose-and-refresh.ts";

test("refreshes the admin view after a successful composition", async () => {
  let refreshes = 0;
  const response = new Response(null, { status: 201 });

  const result = await composeAndRefresh(
    async () => response,
    () => {
      refreshes += 1;
    },
  );

  assert.equal(result, response);
  assert.equal(refreshes, 1);
});

test("does not refresh after an unsuccessful composition response", async () => {
  let refreshes = 0;
  const response = new Response(null, { status: 422 });

  const result = await composeAndRefresh(
    async () => response,
    () => {
      refreshes += 1;
    },
  );

  assert.equal(result, response);
  assert.equal(refreshes, 0);
});

test("does not refresh when composition cannot reach the server", async () => {
  let refreshes = 0;

  await assert.rejects(
    composeAndRefresh(
      async () => {
        throw new Error("offline");
      },
      () => {
        refreshes += 1;
      },
    ),
    /offline/,
  );
  assert.equal(refreshes, 0);
});
