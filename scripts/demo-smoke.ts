/**
 * End-to-end smoke test for the 90-second demo path, against a running app.
 *
 *   1. docker compose up -d   (or any PostgreSQL matching DATABASE_URL)
 *   2. npm run db:migrate -- --name init
 *   3. npm run seed
 *   4. npm run dev            (or npm run build && npm start)
 *   5. npx tsx scripts/demo-smoke.ts
 *
 * Override the app origin with DEMO_BASE_URL (default http://localhost:3000).
 *
 * Public-page beats (sponsor, volunteer note) go through the real no-JS form
 * posts that React renders for server actions, so the same code path a browser
 * uses is what gets verified. Staff beats hit the JSON routes the admin
 * buttons call, which now require a session, so the run signs in first (and
 * creates the staff account on the first run) and carries the cookie the way
 * the browser does. Override the account with DEMO_STAFF_EMAIL /
 * DEMO_STAFF_PASSWORD. The staff settings flip (source URL A -> B) is written
 * through Prisma, mirroring what the admin Settings form saves.
 */
import "dotenv/config";

import { prisma } from "../src/lib/prisma.ts";

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.DEMO_STAFF_EMAIL ?? "demo-staff@example.com";
const STAFF_PASSWORD = process.env.DEMO_STAFF_PASSWORD ?? "demo-staff-password";

let step = 0;
let staffCookie = "";

function ok(message: string) {
  step += 1;
  console.log(`  ✓ ${step}. ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

async function pageHtml(path: string): Promise<string> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) fail(`GET ${path} returned ${response.status}`);
  return response.text();
}

/**
 * Submit a server-action form the way a no-JS browser would: read the page,
 * find the hidden $ACTION_ID field React rendered into its form, and POST the
 * fields back to the same URL. A redirect() in the action comes back as 303.
 */
async function submitActionForm(
  path: string,
  fields: Record<string, string>,
): Promise<string> {
  const html = await pageHtml(path);
  const actionId = html.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  if (!actionId) fail(`No server-action form found on ${path}`);

  const body = new FormData();
  body.append(actionId, "");
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body,
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  if (response.status < 300 || response.status >= 400) {
    fail(`POST ${path} expected a redirect, got ${response.status}`);
  }
  return location;
}

async function postJson(path: string, payload?: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(payload !== undefined ? { "content-type": "application/json" } : {}),
      ...(staffCookie ? { cookie: staffCookie } : {}),
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    fail(`POST ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Sign in the staff account the way the sign-in form does, creating it on the
 * first run. Every staff route (/api/sync, compose, approve, the Arcade
 * routes) rejects an anonymous request with a 401, so the cookie Better Auth
 * hands back here is what the rest of the run posts with.
 */
async function signInStaff() {
  for (const endpoint of ["/api/auth/sign-up/email", "/api/auth/sign-in/email"]) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
        ...(endpoint.endsWith("sign-up/email") ? { name: "Demo Staff" } : {}),
      }),
    });
    // Set-Cookie carries attributes (Path, HttpOnly, ...); a request cookie
    // header wants only the name=value pairs.
    const cookie = (response.headers.getSetCookie?.() ?? [])
      .map((value) => value.split(";")[0])
      .join("; ");
    if (response.ok && cookie) {
      staffCookie = cookie;
      return;
    }
  }
  fail(
    `Could not sign in ${STAFF_EMAIL}; set DEMO_STAFF_EMAIL / DEMO_STAFF_PASSWORD to a staff account`,
  );
}

async function sponsorDog(
  residentId: string,
  sponsor: { name: string; email: string; phone?: string; channel: string },
) {
  const location = await submitActionForm(`/dogs/${residentId}`, {
    residentId,
    sponsorName: sponsor.name,
    sponsorEmail: sponsor.email,
    sponsorPhone: sponsor.phone ?? "",
    channel: sponsor.channel,
  });
  if (!location.includes("sponsored=1")) {
    fail(`Sponsorship form did not confirm; redirected to ${location}`);
  }
  const record = await prisma.sponsorship.findFirst({
    where: { residentId, sponsorEmail: sponsor.email, status: "active" },
  });
  if (!record) fail(`No active sponsorship row for ${sponsor.email}`);
  return record;
}

async function setSourceCapture(capture: "A" | "B") {
  await prisma.rescueSettings.upsert({
    where: { id: "default" },
    update: { sourceUrl: `seed/dogs-page-${capture}.html` },
    create: { id: "default", sourceUrl: `seed/dogs-page-${capture}.html` },
  });
}

async function main() {
  console.log(`Demo smoke against ${BASE_URL}`);

  // Beat 1-2: Biscuit is on the public grid and gets a new sponsor.
  const biscuit = await prisma.resident.findUnique({ where: { name: "Biscuit" } });
  if (!biscuit || biscuit.status !== "available") {
    fail("Seeded resident Biscuit is missing or not available; run npm run seed");
  }
  if (!(await pageHtml("/")).includes("Biscuit")) {
    fail("Public grid does not show Biscuit");
  }
  ok("Public page lists Biscuit");

  await sponsorDog(biscuit.id, {
    name: "Demo Smoke Sponsor",
    email: `smoke-${Date.now()}@example.com`,
    channel: "email",
  });
  ok("Sponsored Biscuit from the public dog page");

  // Beat 3: a volunteer drops a one-line note from the phone page.
  const noteText = `Smoke test note ${Date.now()}`;
  const noteLocation = await submitActionForm("/volunteer", {
    residentId: biscuit.id,
    note: noteText,
  });
  if (!noteLocation.includes("submitted=1")) {
    fail(`Volunteer form did not confirm; redirected to ${noteLocation}`);
  }
  if (!(await prisma.volunteerNote.findFirst({ where: { residentId: biscuit.id, note: noteText } }))) {
    fail("Volunteer note row was not created");
  }
  ok("Submitted a volunteer note from /volunteer");

  // Beat 4: the staff room is behind sign-in, so take a session before the
  // staff routes; then compose a pupdate and approve it, fanning out per channel.
  await signInStaff();
  ok(`Signed in to the staff room as ${STAFF_EMAIL}`);

  const composed = (await postJson("/api/pupdates/compose", {
    residentId: biscuit.id,
  })) as { pupdate: { id: string; bodyText: string } };
  if (!composed.pupdate.bodyText.includes(noteText)) {
    fail("Composed pupdate does not include the fresh volunteer note");
  }
  ok("Composed a pupdate draft from the volunteer notes");

  const approved = (await postJson(`/api/pupdates/${composed.pupdate.id}/approve`)) as {
    pupdate: { status: string };
    deliveries: Array<{ channel: string; status: string }>;
  };
  const activeSponsors = await prisma.sponsorship.count({
    where: { residentId: biscuit.id, status: "active" },
  });
  if (approved.pupdate.status !== "sent") fail("Approved pupdate is not marked sent");
  if (approved.deliveries.length < activeSponsors) {
    fail(`Expected at least ${activeSponsors} deliveries, got ${approved.deliveries.length}`);
  }
  if (approved.deliveries.some((delivery) => delivery.status !== "sent")) {
    fail(`A delivery failed: ${JSON.stringify(approved.deliveries)}`);
  }
  ok(`Approved the pupdate; ${approved.deliveries.length} deliveries fanned out per sponsor channel`);

  // Beat 5a: sync the roster from capture A; the grid fills with ~33 dogs.
  await setSourceCapture("A");
  const syncA = (await postJson("/api/sync")) as { created: number; updated: number };
  const available = await prisma.resident.count({ where: { status: "available" } });
  if (syncA.created + syncA.updated < 30) {
    fail(`Sync A processed only ${syncA.created + syncA.updated} dogs`);
  }
  // Capture A carries ~33 dogs, but a few are already marked adopted in it
  // (and seeded Biscuit, absent from the roster, is adopted on sync).
  if (available < 25) fail(`Only ${available} dogs are available after sync A`);
  const hattie = await prisma.resident.findUnique({ where: { name: "Hattie" } });
  if (!hattie || hattie.status !== "available") fail("Hattie is not available after sync A");
  if (!(await pageHtml("/")).includes("Hattie")) fail("Public grid does not show Hattie after sync A");
  ok(`Synced capture A; ${available} dogs on the public grid`);

  await sponsorDog(hattie.id, {
    name: "Hattie Smoke Sponsor",
    email: `hattie-smoke-${Date.now()}@example.com`,
    phone: "+14155550199",
    channel: "both",
  });
  ok("Sponsored Hattie");

  // Beat 5b: capture B marks Hattie adopted; her sponsorship closes and a
  // graduation draft lands in the approval queue.
  await setSourceCapture("B");
  const syncB = (await postJson("/api/sync")) as {
    adopted: number;
    sponsorshipsClosed: number;
  };
  if (syncB.adopted < 1) fail("Sync B adopted no dogs");
  if (syncB.sponsorshipsClosed < 1) fail("Sync B closed no sponsorships");

  const hattieAfter = await prisma.resident.findUnique({
    where: { id: hattie.id },
    include: {
      sponsorships: true,
      pupdates: { where: { type: "graduation", status: "draft" } },
    },
  });
  if (hattieAfter?.status !== "adopted") fail("Hattie is not marked adopted after sync B");
  const closed = hattieAfter.sponsorships.some(
    (sponsorship) => sponsorship.status === "ended" && sponsorship.endedReason === "adopted",
  );
  if (!closed) {
    fail("Hattie's sponsorship was not closed as adopted");
  }
  if (hattieAfter.pupdates.length < 1) fail("No graduation draft queued for Hattie");
  if (!(await pageHtml(`/dogs/${hattie.id}`)).includes("Adopted")) {
    fail("Hattie's dog page does not show the Adopted state");
  }
  ok("Synced capture B; Hattie adopted, sponsorship closed, graduation draft queued");

  console.log("\nDemo smoke passed: the full 90-second path works end to end.");
}

main()
  .catch((error) => {
    console.error(`\n✗ Demo smoke failed at step ${step + 1}:`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
