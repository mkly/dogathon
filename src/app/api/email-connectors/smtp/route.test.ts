import assert from "node:assert/strict";
import test from "node:test";

import { smtpVerificationErrorMessage } from "./route.ts";

test("SMTP verification errors are safe fixed messages", () => {
  assert.match(
    smtpVerificationErrorMessage(new Error("535 login failed for secret-user")),
    /authentication failed/u,
  );
  assert.match(
    smtpVerificationErrorMessage(new Error("ECONNREFUSED 10.0.0.4")),
    /refused the connection/u,
  );
  assert.match(
    smtpVerificationErrorMessage(new Error("self signed TLS certificate")),
    /TLS/u,
  );
  assert.match(
    smtpVerificationErrorMessage(new Error("unexpected server response")),
    /verification failed/u,
  );
});
