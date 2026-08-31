import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
} from "react";

import styles from "./admin-ui.module.css";

type AdminTone = "oatmeal" | "mustard" | "brick" | "moss" | "denim" | "cream";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ToneProps = { tone?: AdminTone };

export type AdminSurfaceProps = HTMLAttributes<HTMLDivElement> & ToneProps;

export function AdminSurface({
  className,
  tone = "oatmeal",
  ...props
}: AdminSurfaceProps) {
  return <div className={classes(styles.surface, styles[tone], className)} {...props} />;
}

export type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ToneProps;

export function AdminButton({
  className,
  tone = "denim",
  type = "button",
  ...props
}: AdminButtonProps) {
  return (
    <button
      className={classes(styles.button, styles[tone], className)}
      type={type}
      {...props}
    />
  );
}

export type AdminLinkProps = ComponentProps<typeof Link> & ToneProps;

export function AdminLink({ className, tone = "denim", ...props }: AdminLinkProps) {
  return <Link className={classes(styles.button, styles[tone], className)} {...props} />;
}

export type AdminFieldProps = HTMLAttributes<HTMLDivElement>;

export function AdminField({ className, ...props }: AdminFieldProps) {
  return <div className={classes(styles.field, className)} {...props} />;
}

export type AdminBadgeProps = HTMLAttributes<HTMLSpanElement> & ToneProps;

export function AdminBadge({
  className,
  tone = "denim",
  ...props
}: AdminBadgeProps) {
  return <span className={classes(styles.badge, styles[tone], className)} {...props} />;
}
