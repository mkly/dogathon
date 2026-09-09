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
import { interviewTranscriptSchema } from "@/lib/volunteer-interview-request";
import { uuidSchema } from "@/lib/uuid";

import styles from "./resident.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companion updates | Dogathon staff",
  description: "Private volunteer update history for a companion.",
};

type ResidentPageProps = { params: Promise<{ orgSlug: string; residentId: string }> };

function transcriptMessages(transcript: unknown) {
  const parsed = interviewTranscriptSchema.safeParse(transcript);
  if (!parsed.success) return [];

  return parsed.data.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.parts.map((part) => part.text).join("\n"),
  }));
}

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
        where: { sponsorUpdateId: null, status: "completed" },
        orderBy: { updatedAt: "desc" },
        select: {
          _count: { select: { photos: true } },
          id: true,
          transcript: true,
          updatedAt: true,
          user: { select: { name: true } },
        },
      },
      sponsorUpdates: {
        where: { status: { in: ["draft", "approved", "sent"] } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, sentAt: true, status: true, subject: true, updatedAt: true },
      },
    },
  });
  if (!resident) notFound();

  const previews = resident.sponsorUpdates.filter((update) => update.status !== "sent");
  const sentUpdates = resident.sponsorUpdates
    .filter((update) => update.status === "sent" && update.sentAt)
    .sort((left, right) => right.sentAt!.getTime() - left.sentAt!.getTime());

  return (
    <PageViewTransition>
      <AdminPage variant="directory">
        <AdminHeader
          actions={<AdminLink href={`/${orgSlug}/admin`} transitionTypes={["nav-back"]}>Back to staff room</AdminLink>}
          eyebrow="Companion record"
          lede="See the volunteer chats waiting to be composed and the updates already shared with sponsors."
          title={resident.name}
          variant="directory"
        />

        <section aria-labelledby="waiting-heading">
          <div className={styles.title}>
            <h2 id="waiting-heading">Waiting to be composed</h2>
            <AdminBadge tone="mustard">
              {resident.checkIns.length} {pluralize("chat", resident.checkIns.length)}
            </AdminBadge>
          </div>
          {resident.checkIns.length ? (
            <div className={styles.chatList}>
              {resident.checkIns.map((checkIn) => {
                const messages = transcriptMessages(checkIn.transcript);
                return (
                  <AdminSurface className={styles.chat} key={checkIn.id} tone="oatmeal">
                    <div className={styles.chatMeta}>
                      <p><strong>{checkIn.user.name}</strong></p>
                      <p>
                        <time dateTime={checkIn.updatedAt.toISOString()}>{formatDateTime(checkIn.updatedAt)} UTC</time>
                        <span aria-hidden="true"> · </span>
                        {checkIn._count.photos} {pluralize("photo", checkIn._count.photos)}
                      </p>
                    </div>
                    <details className={styles.transcript}>
                      <summary>Read transcript</summary>
                      {messages.length ? (
                        <ol>
                          {messages.map((message) => (
                            <li key={message.id}>
                              <strong>{message.role === "user" ? checkIn.user.name : "Interviewer"}</strong>
                              <p>{message.text}</p>
                            </li>
                          ))}
                        </ol>
                      ) : <p>Transcript unavailable.</p>}
                    </details>
                  </AdminSurface>
                );
              })}
            </div>
          ) : (
            <AdminSurface className={styles.empty} tone="oatmeal">No volunteer chats are waiting.</AdminSurface>
          )}
        </section>

        <section aria-labelledby="past-heading">
          <div className={styles.title}>
            <h2 id="past-heading">Past updates</h2>
            <AdminBadge tone="mustard">
              {sentUpdates.length} {pluralize("update", sentUpdates.length)} sent
            </AdminBadge>
          </div>

          {previews.length ? (
            <AdminSurface className={styles.previews} tone="oatmeal">
              <h3>Draft previews</h3>
              <ul>
                {previews.map((update) => (
                  <li key={update.id}>
                    <div>
                      <strong>{update.subject}</strong>
                      <span>Edited {formatDateTime(update.updatedAt)} UTC</span>
                    </div>
                    <AdminLink href={`/${orgSlug}/updates/${update.id}`}>Preview</AdminLink>
                  </li>
                ))}
              </ul>
            </AdminSurface>
          ) : null}

          {sentUpdates.length ? (
            <AdminSurface tone="oatmeal">
              <AdminTable>
                <thead><tr><th scope="col">Update</th><th scope="col">Sent</th><th scope="col">Status</th><th scope="col">Page</th></tr></thead>
                <tbody>
                  {sentUpdates.map((update) => (
                    <tr key={update.id}>
                      <td>{update.subject}</td>
                      <td><time dateTime={update.sentAt!.toISOString()}>{formatDateTime(update.sentAt!)} UTC</time></td>
                      <td><AdminStatus>Sent</AdminStatus></td>
                      <td><AdminLink href={`/${orgSlug}/updates/${update.id}`}>Open update</AdminLink></td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminSurface>
          ) : (
            <AdminSurface className={styles.empty} tone="oatmeal">No updates have been sent yet.</AdminSurface>
          )}
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
