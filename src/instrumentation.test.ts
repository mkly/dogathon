import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Records how register() ended: returning or rejecting both leave the server
// running, which is the failure mode this instrumentation hook exists to close.
const registerScript = `
  const { register } = await import("./src/instrumentation.ts");
  try {
    await register();
    console.log("REGISTER_RETURNED");
  } catch {
    console.log("REGISTER_REJECTED");
  }
`;

function runRegister(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", registerScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
  });
}

test("register stops the Node.js runtime before it can serve a misconfigured request", () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, NEXT_RUNTIME: "nodejs" };
  delete environment.DATABASE_URL;

  const result = runRegister(environment);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid environment variables: DATABASE_URL:/u);
  assert.doesNotMatch(result.stdout, /REGISTER_(RETURNED|REJECTED)/u);
});

test("register returns without incident when the Node.js environment is valid", () => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_RUNTIME: "nodejs",
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon?schema=public",
  };

  const result = runRegister(environment);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REGISTER_RETURNED/u);
});

test("register does not load the Node.js environment module in the edge runtime", () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, NEXT_RUNTIME: "edge" };
  delete environment.DATABASE_URL;

  const result = runRegister(environment);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REGISTER_RETURNED/u);
});
