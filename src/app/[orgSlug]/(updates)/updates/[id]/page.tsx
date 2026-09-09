import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

import { escapeHtmlInMarkdown, neutralizeUnsafeMarkdownDestinations } from "@/lib/markdown-safety";

import { updateFixture } from "./fixture";
import { PhotoSlideshow } from "./photo-slideshow";
import { ShareUpdateButton } from "./share-update-button";
import styles from "./updates.module.css";

type UpdatePageProps = {
  params: Promise<{ id: string; orgSlug: string }>;
};

export function generateMetadata(): Metadata {
  const hero = updateFixture.photos[0];

  return {
    title: `${updateFixture.headline} | ${updateFixture.rescueName}`,
    description: updateFixture.teaser,
    openGraph: {
      type: "article",
      title: updateFixture.headline,
      description: updateFixture.teaser,
      images: [{ alt: hero.alt, height: 900, url: hero.src, width: 1400 }],
    },
    twitter: {
      card: "summary_large_image",
      title: updateFixture.headline,
      description: updateFixture.teaser,
      images: [hero.src],
    },
  };
}

export default async function UpdatePage({ params }: UpdatePageProps) {
  const { orgSlug } = await params;
  const hero = updateFixture.photos[0];
  const safeBody = neutralizeUnsafeMarkdownDestinations(escapeHtmlInMarkdown(updateFixture.body));

  return (
    <main className={styles.articleShell}>
      <article>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>{updateFixture.rescueName}</p>
          <h1>{updateFixture.headline}</h1>
          <div className={styles.headerDetails}>
            <p>
              <time dateTime="2026-09-04">{updateFixture.date}</time>
              <span aria-hidden="true"> · </span>
              An update about {updateFixture.companionName}
            </p>
            <ShareUpdateButton title={updateFixture.headline} />
          </div>
        </header>

        <figure className={styles.hero}>
          <Image
            alt={hero.alt}
            className={styles.heroPhoto}
            height={900}
            priority
            sizes="(max-width: 48rem) calc(100vw - 2rem), 44rem"
            src={hero.src}
            width={1400}
          />
          <figcaption>{hero.caption}</figcaption>
        </figure>

        <div className={styles.markdown}>
          <ReactMarkdown>{safeBody}</ReactMarkdown>
        </div>

        <section aria-labelledby="photo-heading" className={styles.photoSection}>
          <p className={styles.sectionLabel}>A few moments from the week</p>
          <h2 id="photo-heading">Juniper, lately</h2>
          <PhotoSlideshow photos={updateFixture.photos} />
        </section>

        <footer className={styles.articleFooter}>
          <div>
            <p className={styles.footerHeading}>Keep following the good news</p>
            <p>
              Meet Juniper again or see who else is waiting at {updateFixture.rescueName}.
            </p>
            <nav aria-label="Related pages" className={styles.footerLinks}>
              <Link href={`/${orgSlug}/companions/${updateFixture.companionId}`}>
                Sponsor Juniper too
              </Link>
              <Link href={`/${orgSlug}`}>Meet the rescue residents</Link>
            </nav>
          </div>
          <ShareUpdateButton title={updateFixture.headline} />
        </footer>
      </article>
    </main>
  );
}
