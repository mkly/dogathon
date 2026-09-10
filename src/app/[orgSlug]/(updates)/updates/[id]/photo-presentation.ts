export type UpdatePhoto = {
  caption: string | null;
  src: string;
};

type PhotoPresentationInput = {
  heroPhotoUrl: string | null;
  photos: readonly UpdatePhoto[];
  residentPhotoUrls: readonly string[];
};

function usableUrl(url: string | null | undefined) {
  const normalized = url?.trim();
  return normalized || null;
}

function distinctPhotos(photos: readonly UpdatePhoto[]) {
  const distinct: UpdatePhoto[] = [];
  const indexes = new Map<string, number>();

  for (const photo of photos) {
    const src = usableUrl(photo.src);
    if (!src) continue;

    const existingIndex = indexes.get(src);
    if (existingIndex === undefined) {
      indexes.set(src, distinct.length);
      distinct.push({ caption: photo.caption, src });
    } else if (!distinct[existingIndex].caption && photo.caption) {
      distinct[existingIndex] = { caption: photo.caption, src };
    }
  }

  return distinct;
}

export function buildPhotoPresentation({
  heroPhotoUrl,
  photos,
  residentPhotoUrls,
}: PhotoPresentationInput) {
  const updatePhotos = distinctPhotos(photos);
  const configuredHeroUrl = usableUrl(heroPhotoUrl);
  const matchingHero = configuredHeroUrl
    ? updatePhotos.find((photo) => photo.src === configuredHeroUrl)
    : undefined;
  const fallbackHeroUrl = residentPhotoUrls
    .map((src) => usableUrl(src))
    .find((src): src is string => Boolean(src));
  const heroPhoto = configuredHeroUrl
    ? { caption: matchingHero?.caption ?? null, src: configuredHeroUrl }
    : (updatePhotos[0] ??
      (fallbackHeroUrl ? { caption: null, src: fallbackHeroUrl } : null));

  const displayedUpdatePhotos = [...updatePhotos];
  if (
    configuredHeroUrl &&
    !displayedUpdatePhotos.some((photo) => photo.src === configuredHeroUrl)
  ) {
    displayedUpdatePhotos.unshift({ caption: null, src: configuredHeroUrl });
  }

  return {
    heroPhoto,
    slideshowPhotos:
      displayedUpdatePhotos.length > 1 ? displayedUpdatePhotos : [],
  };
}
