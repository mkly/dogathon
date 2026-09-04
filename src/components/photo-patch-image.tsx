"use client";

import { clsx } from "clsx";
import Image, { type ImageProps } from "next/image";
import { useState } from "react";

import styles from "./felt.module.css";

const blurDataUrl =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjYiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjYiIGZpbGw9IiNjZmM4YmEiLz48L3N2Zz4=";

type PhotoPatchImageProps = Omit<
  ImageProps,
  "alt" | "blurDataURL" | "height" | "placeholder" | "src" | "width"
> & {
  alt: string;
  src: string;
};

export function PhotoPatchImage({
  alt,
  className,
  onLoad,
  preload = false,
  sizes = "(max-width: 640px) calc(100vw - 80px), 22rem",
  src,
  ...props
}: PhotoPatchImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Image
      {...props}
      {...(preload ? { preload: true } : { loading: "lazy" as const })}
      alt={alt}
      blurDataURL={blurDataUrl}
      className={clsx(styles["photo-patch-image"], loaded && styles.loaded, className)}
      decoding="async"
      height={768}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      placeholder="blur"
      sizes={sizes}
      src={src}
      width={1024}
    />
  );
}
