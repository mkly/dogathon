"use client";

import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { UpdatePhoto } from "./photo-presentation";
import styles from "./updates.module.css";

type PhotoSlideshowProps = {
  companionName: string;
  photos: readonly UpdatePhoto[];
};

const subscribeToHydration = () => () => undefined;

export function PhotoSlideshow({ companionName, photos }: PhotoSlideshowProps) {
  const [viewportRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const enhanced = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  const updateSelection = useCallback(() => {
    if (emblaApi) setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    emblaApi.on("select", updateSelection);
    emblaApi.on("reInit", updateSelection);

    return () => {
      emblaApi.off("select", updateSelection);
      emblaApi.off("reInit", updateSelection);
    };
  }, [emblaApi, updateSelection]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      emblaApi?.scrollPrev();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      emblaApi?.scrollNext();
    }
  }

  return (
    <section
      aria-label={`More photos of ${companionName}`}
      aria-roledescription="carousel"
      className={`${styles.slideshow} ${enhanced ? styles.enhanced : ""}`}
    >
      <div
        className={styles.slideshowViewport}
        onKeyDown={handleKeyDown}
        ref={viewportRef}
        tabIndex={enhanced ? 0 : undefined}
      >
        <ol className={styles.slides}>
          {photos.map((photo, index) => (
            <li
              aria-label={`${index + 1} of ${photos.length}`}
              aria-roledescription="slide"
              className={styles.slide}
              key={photo.src}
            >
              <figure>
                <Image
                  alt={photo.caption || `${companionName}, photo ${index + 1}`}
                  className={styles.slidePhoto}
                  height={900}
                  sizes="(max-width: 48rem) calc(100vw - 2rem), 44rem"
                  src={photo.src}
                  width={1400}
                />
                {photo.caption ? (
                  <figcaption>{photo.caption}</figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ol>
      </div>

      <div aria-hidden={!enhanced} className={styles.slideshowControls}>
        <div className={styles.arrowButtons}>
          <button
            aria-label="Previous photo"
            onClick={() => emblaApi?.scrollPrev()}
            type="button"
          >
            ←
          </button>
          <button
            aria-label="Next photo"
            onClick={() => emblaApi?.scrollNext()}
            type="button"
          >
            →
          </button>
        </div>
        <p aria-live="polite" className={styles.counter}>
          {selectedIndex + 1} / {photos.length}
        </p>
      </div>
    </section>
  );
}
