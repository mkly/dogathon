import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import ReactMarkdown from "react-markdown";

import { formatDateTime } from "@/lib/format";
import {
  escapeHtmlInMarkdown,
  neutralizeUnsafeMarkdownDestinations,
} from "@/lib/markdown-safety";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { isPublicResidentSponsorable } from "@/lib/public-roster-cache";
import { uuidSchema } from "@/lib/uuid";

import { PhotoSlideshow, type UpdatePhoto } from "./photo-slideshow";
import { ShareUpdateButton } from "./share-update-button";
import styles from "./updates.module.css";

export const dynamic = "force-dynamic";

type UpdatePageProps = {
  params: Promise<{ id: string; orgSlug: string }>;
};

const getUpdate = cache(
  (orgSlug: string, id: string, publiclyVisibleOnly = false) =>
    prisma.sponsorUpdate.findFirst({
      where: {
        id,
        organization: { slug: orgSlug },
        ...(publiclyVisibleOnly ? { status: "sent" as const } : {}),
      },
      select: {
        bodyText: true,
        heroPhotoUrl: true,
        sentAt: true,
        status: true,
        subject: true,
        teaser: true,
        type: true,
        updatedAt: true,
        organization: { select: { name: true } },
        resident: {
          select: {
            _count: {
              select: { sponsorships: { where: { status: "active" } } },
            },
            available: true,
            id: true,
            name: true,
            photoUrls: true,
          },
        },
        checkIns: {
          select: {
            photos: {
              orderBy: { createdAt: "asc" },
              select: {
                caption: true,
                createdAt: true,
                url: true,
                webUrl: true,
              },
            },
          },
        },
      },
    }),
);

function updatePhotos(
  update: NonNullable<Awaited<ReturnType<typeof getUpdate>>>,
): UpdatePhoto[] {
  return update.checkIns
    .flatMap((checkIn) => checkIn.photos)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((photo) => ({
      caption: photo.caption,
      src: photo.webUrl ?? photo.url,
    }));
}

async function getGraduationCompanions(orgSlug: string, residentId: string) {
  const residents = await prisma.resident.findMany({
    where: {
      available: true,
      id: { not: residentId },
      organization: { slug: orgSlug },
    },
    orderBy: { name: "asc" },
    select: {
      ageText: true,
      breed: true,
      id: true,
      name: true,
      photoUrls: true,
      _count: { select: { sponsorships: { where: { status: "active" } } } },
    },
  });

  return residents
    .sort(
      (left, right) =>
        left._count.sponsorships - right._count.sponsorships ||
        left.name.localeCompare(right.name),
    )
    .slice(0, 4);
}

export async function generateMetadata({
  params,
}: UpdatePageProps): Promise<Metadata> {
  const { id, orgSlug } = await params;
  if (!uuidSchema.safeParse(id).success) return { title: "Sponsor update" };
  const update = await getUpdate(orgSlug, id, true);
  if (!update) return { title: "Sponsor update" };

  const photos = updatePhotos(update);
  const heroUrl =
    update.heroPhotoUrl ?? photos[0]?.src ?? update.resident.photoUrls[0];
  const title = `${update.subject} | ${update.organization.name}`;

  return {
    title,
    description: update.teaser,
    openGraph: {
      type: "article",
      title: update.subject,
      description: update.teaser,
      ...(heroUrl
        ? { images: [{ alt: update.resident.name, url: heroUrl }] }
        : {}),
    },
    twitter: {
      card: heroUrl ? "summary_large_image" : "summary",
      title: update.subject,
      description: update.teaser,
      ...(heroUrl ? { images: [heroUrl] } : {}),
    },
  };
}

export default async function UpdatePage({ params }: UpdatePageProps) {
  const { id, orgSlug } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const update = await getUpdate(orgSlug, id);
  if (!update || update.status === "dismissed") notFound();

  const preview = update.status === "draft" || update.status === "approved";
  if (preview) {
    const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
      sponsorUpdate: ["manage"],
    });
    if (!access?.context) notFound();
  } else if (update.status !== "sent") {
    notFound();
  }

  const photos = updatePhotos(update);
  const heroUrl =
    update.heroPhotoUrl ?? photos[0]?.src ?? update.resident.photoUrls[0];
  const heroCaption = photos.find((photo) => photo.src === heroUrl)?.caption;
  const safeBody = neutralizeUnsafeMarkdownDestinations(
    escapeHtmlInMarkdown(update.bodyText),
  );
  const sponsorable = isPublicResidentSponsorable(update.resident);
  const graduationCompanions =
    update.type === "graduation"
      ? await getGraduationCompanions(orgSlug, update.resident.id)
      : [];

  return (
    <main className={styles.articleShell}>
      <article>
        {preview ? (
          <p className={styles.previewBanner}>Draft preview, not sent yet</p>
        ) : null}
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>
            {update.type === "graduation"
              ? `${update.resident.name} has been adopted`
              : update.organization.name}
          </p>
          <h1>{update.subject}</h1>
          <div className={styles.headerDetails}>
            <p>
              <time
                dateTime={(update.sentAt ?? update.updatedAt).toISOString()}
              >
                {formatDateTime(update.sentAt ?? update.updatedAt)}
              </time>
              <span aria-hidden="true"> · </span>
              An update about {update.resident.name}
            </p>
            <ShareUpdateButton title={update.subject} />
          </div>
        </header>

        {heroUrl ? (
          <figure className={styles.hero}>
            <Image
              alt={heroCaption || update.resident.name}
              className={styles.heroPhoto}
              height={900}
              priority
              sizes="(max-width: 48rem) calc(100vw - 2rem), 44rem"
              src={heroUrl}
              width={1400}
            />
            {heroCaption ? <figcaption>{heroCaption}</figcaption> : null}
          </figure>
        ) : null}

        <div className={styles.markdown}>
          <ReactMarkdown>{safeBody}</ReactMarkdown>
        </div>

        {photos.length ? (
          <section
            aria-labelledby="photo-heading"
            className={styles.photoSection}
          >
            <p className={styles.sectionLabel}>A few moments from the update</p>
            <h2 id="photo-heading">{update.resident.name}, lately</h2>
            <PhotoSlideshow
              companionName={update.resident.name}
              photos={photos}
            />
          </section>
        ) : null}

        <footer
          className={`${styles.articleFooter} ${graduationCompanions.length ? styles.graduationFooter : ""}`}
        >
          {graduationCompanions.length ? (
            <section
              aria-labelledby="graduation-companions-heading"
              className={styles.graduationCompanions}
            >
              <p
                className={styles.footerHeading}
                id="graduation-companions-heading"
              >
                Companions who could use a sponsor
              </p>
              <ul className={styles.graduationCompanionGrid}>
                {graduationCompanions.map((resident) => (
                  <li key={resident.id}>
                    <Link
                      className={styles.graduationCompanion}
                      href={`/${orgSlug}/companions/${resident.id}`}
                    >
                      {resident.photoUrls[0] ? (
                        <Image
                          alt={resident.name}
                          className={styles.graduationCompanionPhoto}
                          height={320}
                          sizes="(max-width: 30rem) calc(100vw - 2.5rem), 18rem"
                          src={resident.photoUrls[0]}
                          width={480}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={styles.graduationCompanionPlaceholder}
                        >
                          🐾
                        </span>
                      )}
                      <span className={styles.graduationCompanionCopy}>
                        <strong>{resident.name}</strong>
                        <span>
                          {[resident.breed, resident.ageText]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div>
              <p className={styles.footerHeading}>
                Keep following the good news
              </p>
              <p>
                Meet {update.resident.name} again or see who else is waiting at{" "}
                {update.organization.name}.
              </p>
              <nav aria-label="Related pages" className={styles.footerLinks}>
                {update.type === "regular" && sponsorable ? (
                  <Link href={`/${orgSlug}/companions/${update.resident.id}`}>
                    Sponsor {update.resident.name} too
                  </Link>
                ) : null}
                <Link href={`/${orgSlug}`}>Meet the rescue residents</Link>
              </nav>
            </div>
          )}
          <ShareUpdateButton title={update.subject} />
        </footer>
      </article>
    </main>
  );
}
