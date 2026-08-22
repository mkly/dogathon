import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
} from "react";

type FeltTone =
  | "oatmeal"
  | "mustard"
  | "brick"
  | "moss"
  | "denim"
  | "denim-lt"
  | "cream";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

// Dashed hand-stitch ring from the sirius-proto mockups: an SVG rect pair
// (dark offset "shadow" under a thread-colored dash) sized entirely in CSS.
function Stitch({ fine = false }: { fine?: boolean }) {
  return (
    <svg aria-hidden="true" className={fine ? "stitch fine" : "stitch"}>
      <rect className="shadow" />
      <rect className="thread" />
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
      className={classes("felt-panel", `felt-${tone}`, className)}
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
      className={classes("felt-button", `felt-${tone}`, className)}
      type={type}
      {...props}
    >
      {stitched ? <Stitch fine /> : null}
      {children}
    </button>
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
      className={classes("felt-field", "felt-inset", `felt-${tone}`, className)}
      {...props}
    >
      <Stitch fine />
      {children}
    </div>
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
      className={classes("stitch-badge", `felt-${tone}`, className)}
      {...props}
    />
  );
}

// Ink-wobble text filters ported from the mockups' shared <defs>: #ink for
// display headings, #ink-s (gentler displacement) for body copy.
export function FeltFilters() {
  return (
    <svg aria-hidden="true" className="felt-filter-definitions">
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
      <filter id="ink-s">
        <feTurbulence
          baseFrequency="0.06"
          numOctaves="2"
          result="inkNoiseSoft"
          seed="7"
          type="fractalNoise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="inkNoiseSoft"
          scale="0.6"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
