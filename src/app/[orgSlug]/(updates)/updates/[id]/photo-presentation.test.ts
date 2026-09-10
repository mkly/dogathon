import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPhotoPresentation } from "./photo-presentation.ts";

test("a fallback hero keeps the zero-update-photo layout free of a slideshow", () => {
  assert.deepEqual(
    buildPhotoPresentation({
      heroPhotoUrl: null,
      photos: [],
      residentPhotoUrls: ["", "/resident.jpg"],
    }),
    {
      heroPhoto: { caption: null, src: "/resident.jpg" },
      slideshowPhotos: [],
    },
  );
});

test("one update photo is shown once as a static hero", () => {
  assert.deepEqual(
    buildPhotoPresentation({
      heroPhotoUrl: "/visit.jpg",
      photos: [
        { caption: null, src: " /visit.jpg " },
        { caption: "Enjoying the sunshine", src: "/visit.jpg" },
      ],
      residentPhotoUrls: ["/resident.jpg"],
    }),
    {
      heroPhoto: {
        caption: "Enjoying the sunshine",
        src: "/visit.jpg",
      },
      slideshowPhotos: [],
    },
  );
});

test("multiple distinct update photos retain order and captions for the slideshow", () => {
  assert.deepEqual(
    buildPhotoPresentation({
      heroPhotoUrl: "/hero.jpg",
      photos: [
        { caption: "First visit", src: "/first.jpg" },
        { caption: null, src: " " },
        { caption: "Second visit", src: "/second.jpg" },
      ],
      residentPhotoUrls: [],
    }),
    {
      heroPhoto: { caption: null, src: "/hero.jpg" },
      slideshowPhotos: [
        { caption: null, src: "/hero.jpg" },
        { caption: "First visit", src: "/first.jpg" },
        { caption: "Second visit", src: "/second.jpg" },
      ],
    },
  );
});

test("the multi-photo carousel retains keyboard, touch, and responsive-image behavior", () => {
  const slideshow = readFileSync(
    new URL("./photo-slideshow.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("./updates.module.css", import.meta.url),
    "utf8",
  );

  assert.match(slideshow, /event\.key === "ArrowLeft"/);
  assert.match(slideshow, /event\.key === "ArrowRight"/);
  assert.match(slideshow, /aria-roledescription="carousel"/);
  assert.match(slideshow, /sizes="\(max-width: 48rem\)/);
  assert.match(styles, /touch-action:\s*pan-y pinch-zoom/);
});
