import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import ReactMarkdown from "react-markdown";

import { formatDateTime } from "@/lib/format";
import { escapeHtmlInMarkdown, neutralizeUnsafeMarkdownDestinations } from "@/lib/markdown-safety";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

import { PhotoSlideshow, type UpdatePhoto } from "./photo-slideshow";
import { ShareUpdateButton } from "./share-update-button";
import styles from "./updates.module.css";

export const dynamic = "force-dynamic";

type UpdatePageProps = {
  params: Promise<{ id: string; orgSlug: string }>;
};

const getUpdate = cache((orgSlug: string, id: string, publiclyVisibleOnly = false) => (
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
      updatedAt: true,
      organization: { select: { name: true } },
      resident: {
        select: {
          _count: { select: { sponsorships: { where: { status: "active" } } } },
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
            select: { caption: true, createdAt: true, url: true, webUrl: true },
          },
        },
      },
    },
  })
));

function updatePhotos(update: NonNullable<Awaited<ReturnType<typeof getUpdate>>>): UpdatePhoto[] {
  return update.checkIns
    .flatMap((checkIn) => checkIn.photos)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((photo) => ({ caption: photo.caption, src: photo.webUrl ?? photo.url }));
}

export async function generateMetadata({ params }: UpdatePageProps): Promise<Metadata> {
  const { id, orgSlug } = await params;
  if (!uuidSchema.safeParse(id).success) return { title: "Sponsor update" };
  const update = await getUpdate(orgSlug, id, true);
  if (!update) return { title: "Sponsor update" };

  const photos = updatePhotos(update);
  const heroUrl = update.heroPhotoUrl ?? photos[0]?.src ?? update.resident.photoUrls[0];
  const title = `${update.subject} | ${update.organization.name}`;

  return {
    title,
    description: update.teaser,
    openGraph: {
      type: "article",
      title: update.subject,
      description: update.teaser,
      ...(heroUrl ? { images: [{ alt: update.resident.name, url: heroUrl }] } : {}),
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
  const heroUrl = update.heroPhotoUrl ?? photos[0]?.src ?? update.resident.photoUrls[0];
  const heroCaption = photos.find((photo) => photo.src === heroUrl)?.caption;
  const safeBody = neutralizeUnsafeMarkdownDestinations(escapeHtmlInMarkdown(update.bodyText));
  const sponsorable = update.resident.available && update.resident._count.sponsorships === 0;

  return (
    <main className={styles.articleShell}>
      <article>
        {preview ? <p className={styles.previewBanner}>Draft preview, not sent yet</p> : null}
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>{update.organization.name}</p>
          <h1>{update.subject}</h1>
          <div className={styles.headerDetails}>
            <p>
              <time dateTime={(update.sentAt ?? update.updatedAt).toISOString()}>
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
          <section aria-labelledby="photo-heading" className={styles.photoSection}>
            <p className={styles.sectionLabel}>A few moments from the update</p>
            <h2 id="photo-heading">{update.resident.name}, lately</h2>
            <PhotoSlideshow companionName={update.resident.name} photos={photos} />
          </section>
        ) : null}

        <footer className={styles.articleFooter}>
          <div>
            <p className={styles.footerHeading}>Keep following the good news</p>
            <p>
              Meet {update.resident.name} again or see who else is waiting at{" "}
              {update.organization.name}.
            </p>
            <nav aria-label="Related pages" className={styles.footerLinks}>
              {sponsorable ? (
                <Link href={`/${orgSlug}/companions/${update.resident.id}`}>
                  Sponsor {update.resident.name} too
                </Link>
              ) : null}
              <Link href={`/${orgSlug}`}>Meet the rescue residents</Link>
            </nav>
          </div>
          <ShareUpdateButton title={update.subject} />
        </footer>
      </article>
    </main>
  );
}
