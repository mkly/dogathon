import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("renders email presentation fixtures outside the React Server condition", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      fileURLToPath(new URL("./email-design-render.ts", import.meta.url)),
    ],
    { stdio: "pipe" },
  );
});
