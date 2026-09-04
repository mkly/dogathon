import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
} from "react";
import { clsx } from "clsx";

import { PhotoPatchImage } from "./photo-patch-image";
import styles from "./felt.module.css";

type FeltTone =
  | "oatmeal"
  | "mustard"
  | "brick"
  | "moss"
  | "denim"
  | "denim-lt"
  | "cream";

// Dashed hand-stitch ring from the sirius-proto mockups: an SVG rect pair
// (dark offset "shadow" under a thread-colored dash) sized entirely in CSS.
function Stitch({ fine = false }: { fine?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={clsx(styles.stitch, fine ? styles.fine : undefined)}
    >
      <rect className={styles.shadow} />
      <rect className={styles.thread} />
    </svg>
  );
}

export type FeltPanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: FeltTone;
  stitched?: boolean;
};

export function FeltPanel({
  children,
  className,
  tone = "oatmeal",
  stitched = true,
  ...props
}: FeltPanelProps) {
  return (
    <div
      className={clsx(styles["felt-panel"], `felt-${tone}`, className)}
      {...props}
    >
      {stitched ? <Stitch /> : null}
      {children}
    </div>
  );
}

export type FeltButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: FeltTone;
  stitched?: boolean;
};

export function FeltButton({
  children,
  className,
  tone = "mustard",
  stitched = false,
  type = "button",
  ...props
}: FeltButtonProps) {
  return (
    <button
      className={clsx(styles["felt-button"], `felt-${tone}`, className)}
      type={type}
      {...props}
    >
      {stitched ? <Stitch fine /> : null}
      {children}
    </button>
  );
}

export type FeltLinkProps = ComponentProps<typeof Link> & {
  tone?: FeltTone;
};

export function FeltLink({
  className,
  tone = "mustard",
  ...props
}: FeltLinkProps) {
  return (
    <Link
      className={clsx(styles["felt-button"], `felt-${tone}`, className)}
      transitionTypes={["nav-forward"]}
      {...props}
    />
  );
}

// form field: a cut-out hole in the felt holding a chrome-less control, with
// the fine stitch ring running outside the edge (mockups' .ps-field)
export type FeltFieldProps = HTMLAttributes<HTMLDivElement> & {
  tone?: FeltTone;
};

export function FeltField({
  children,
  className,
  tone = "cream",
  ...props
}: FeltFieldProps) {
  return (
    <div
      className={clsx(
        styles["felt-field"],
        styles["felt-inset"],
        `felt-${tone}`,
        className,
      )}
      {...props}
    >
      <Stitch fine />
      {children}
    </div>
  );
}

export type PhotoPatchProps = HTMLAttributes<HTMLElement> & {
  alt: string;
  preload?: boolean;
  sizes?: string;
  src?: string;
};

export function PhotoPatch({
  alt,
  className,
  preload,
  sizes,
  src,
  ...props
}: PhotoPatchProps) {
  return (
    <figure className={clsx(styles["photo-patch"], className)} {...props}>
      {src ? (
        <PhotoPatchImage alt={alt} preload={preload} sizes={sizes} src={src} />
      ) : (
        <div
          aria-label={alt}
          className={styles["photo-patch-placeholder"]}
          role="img"
        >
          <span aria-hidden="true">🐾</span>
          <small>{alt}</small>
        </div>
      )}
      <Stitch fine />
    </figure>
  );
}

export type StitchBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: FeltTone;
};

export function StitchBadge({
  className,
  tone = "moss",
  ...props
}: StitchBadgeProps) {
  return (
    <span
      className={clsx(styles["stitch-badge"], `felt-${tone}`, className)}
      {...props}
    />
  );
}

export function FeltFilters() {
  return (
    <svg aria-hidden="true" className={styles["felt-filter-definitions"]}>
      <filter id="ink">
        <feTurbulence
          baseFrequency="0.06"
          numOctaves="2"
          result="inkNoise"
          seed="7"
          type="fractalNoise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="inkNoise"
          scale="1.3"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
