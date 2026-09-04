import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const registerScript = `
  const { register } = await import("./src/instrumentation.ts");
  await register();
`;

function runRegister(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", registerScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
  });
}

test("register validates the Node.js runtime environment before serving requests", () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, NEXT_RUNTIME: "nodejs" };
  delete environment.DATABASE_URL;

  const result = runRegister(environment);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid environment variables: DATABASE_URL:/u);
});

test("register does not load the Node.js environment module in the edge runtime", () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, NEXT_RUNTIME: "edge" };
  delete environment.DATABASE_URL;

  const result = runRegister(environment);

  assert.equal(result.status, 0, result.stderr);
});
