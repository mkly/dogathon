import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";

import {
  AdminBadge,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminStatus,
  AdminSurface,
  AdminTable,
} from "@/components/admin-ui";
import { PageViewTransition } from "@/components/page-view-transition";
import { formatDateTime } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

import styles from "./resident.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companion updates | Dogathon staff",
  description: "Private volunteer update history for a companion.",
};

type ResidentPageProps = { params: Promise<{ orgSlug: string; residentId: string }> };
const CHECK_IN_LIMIT = 100;

export default async function ResidentPage({ params }: ResidentPageProps) {
  const { orgSlug, residentId } = await params;
  if (!uuidSchema.safeParse(residentId).success) notFound();
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, { roster: ["manage"] });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/companions/${residentId}`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }

  const resident = await prisma.resident.findFirst({
    where: { id: residentId, orgId: access.context.orgId },
    select: {
      name: true,
      checkIns: {
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, id: true, status: true, user: { select: { name: true } } },
        take: CHECK_IN_LIMIT,
      },
      _count: { select: { checkIns: true } },
    },
  });
  if (!resident) notFound();

  return (
    <PageViewTransition>
      <AdminPage variant="directory">
        <AdminHeader
          actions={<AdminLink href={`/${orgSlug}/admin`} transitionTypes={["nav-back"]}>Back to staff room</AdminLink>}
          eyebrow="Companion record"
          lede="Volunteer conversations are logged from their first message through the saved note."
          title={resident.name}
          variant="directory"
        />
        <section aria-labelledby="updates-heading">
          <div className={styles.title}>
            <h2 id="updates-heading">Past updates</h2>
            <AdminBadge tone="mustard">
              {resident._count.checkIns} {pluralize("session", resident._count.checkIns)}
            </AdminBadge>
          </div>
          <AdminSurface tone="oatmeal">
            <AdminTable>
              <thead><tr><th scope="col">Started</th><th scope="col">Volunteer</th><th scope="col">Status</th><th scope="col">Session</th></tr></thead>
              <tbody>
                {resident.checkIns.map((checkIn) => (
                  <tr key={checkIn.id}>
                    <td>{formatDateTime(checkIn.createdAt)} UTC</td>
                    <td>{checkIn.user.name}</td>
                    <td><AdminStatus>{checkIn.status === "completed" ? "Completed" : "In progress"}</AdminStatus></td>
                    <td><AdminLink href={`/${orgSlug}/volunteer/${checkIn.id}`}>Open check-in</AdminLink></td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </AdminSurface>
          {resident._count.checkIns > CHECK_IN_LIMIT ? <p>Showing the latest {CHECK_IN_LIMIT} sessions.</p> : null}
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
