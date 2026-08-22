import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
} from "react";

type FeltTone = "oatmeal" | "mustard" | "brick" | "moss" | "denim" | "cream";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type FeltPanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: FeltTone;
  stitched?: boolean;
};

export function FeltPanel({
  className,
  tone = "oatmeal",
  stitched = true,
  ...props
}: FeltPanelProps) {
  return (
    <div
      className={classes(
        "felt-panel",
        `felt-${tone}`,
        stitched ? "felt-stitched" : undefined,
        className,
      )}
      {...props}
    />
  );
}

export type FeltButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: FeltTone;
};

export function FeltButton({
  className,
  tone = "mustard",
  type = "button",
  ...props
}: FeltButtonProps) {
  return (
    <button
      className={classes("felt-button", `felt-${tone}`, className)}
      type={type}
      {...props}
    />
  );
}

export type PhotoPatchProps = HTMLAttributes<HTMLElement> & {
  alt: string;
  src?: string;
  imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;
};

export function PhotoPatch({
  alt,
  className,
  imageProps,
  src,
  ...props
}: PhotoPatchProps) {
  return (
    <figure className={classes("photo-patch", className)} {...props}>
      {src ? (
        // This primitive intentionally accepts local, uploaded, or remote rescue photos.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} src={src} {...imageProps} />
      ) : (
        <div aria-label={alt} className="photo-patch-placeholder" role="img">
          <span aria-hidden="true">🐾</span>
          <small>{alt}</small>
        </div>
      )}
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
      className={classes("stitch-badge", `felt-${tone}`, className)}
      {...props}
    />
  );
}

export function FeltFilters() {
  return (
    <svg aria-hidden="true" className="felt-filter-definitions">
      <filter id="felt-fuzzy-edge">
        <feTurbulence
          baseFrequency="0.035"
          numOctaves="2"
          result="feltNoise"
          seed="7"
          type="fractalNoise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="feltNoise"
          scale="0.7"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
