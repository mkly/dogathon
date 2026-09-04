import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  ComponentPropsWithoutRef,
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
} from "react";
import { clsx } from "clsx";

import { AdminLinkStatus } from "./admin-link-status";
import styles from "./admin-ui.module.css";

type AdminTone = "oatmeal" | "mustard" | "brick" | "moss" | "denim" | "cream";

type ToneProps = { tone?: AdminTone };

type AdminPageVariant = "wide" | "directory" | "volunteer";

export type AdminPageProps = ComponentPropsWithoutRef<"main"> & {
  variant?: AdminPageVariant;
};

export function AdminPage({
  className,
  variant = "wide",
  ...props
}: AdminPageProps) {
  return (
    <main
      className={clsx(
        variant === "volunteer" ? undefined : "admin-shell",
        styles.page,
        styles[`page-${variant}`],
        className,
      )}
      {...props}
    />
  );
}

type AdminHeaderVariant = "brand" | "directory" | "volunteer";

export type AdminHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  actions?: ReactNode;
  actionsClassName?: string;
  brand?: ReactNode;
  eyebrow?: ReactNode;
  lede?: ReactNode;
  title: ReactNode;
  titleId?: string;
  variant?: AdminHeaderVariant;
};

export function AdminHeader({
  actions,
  actionsClassName,
  brand,
  className,
  eyebrow,
  lede,
  title,
  titleId,
  variant = "brand",
  ...props
}: AdminHeaderProps) {
  return (
    <header
      className={clsx(styles.header, styles[`header-${variant}`], className)}
      {...props}
    >
      {brand ? <div className={styles.brand}>{brand}</div> : null}
      <div>
        {eyebrow ? (
          variant === "volunteer" ? eyebrow : <AdminEyebrow>{eyebrow}</AdminEyebrow>
        ) : null}
        <h1 id={titleId}>{title}</h1>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
      </div>
      {actions ? (
        <div className={clsx(styles.headerActions, actionsClassName)}>{actions}</div>
      ) : null}
    </header>
  );
}

export type AdminEyebrowProps = HTMLAttributes<HTMLParagraphElement> & {
  tone?: "brick" | "denim";
};

export function AdminEyebrow({
  className,
  tone = "brick",
  ...props
}: AdminEyebrowProps) {
  return (
    <p
      className={clsx(styles.eyebrow, tone === "denim" ? styles.eyebrowDenim : undefined, className)}
      {...props}
    />
  );
}

export type AdminSectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
};

export function AdminSectionHeader({
  actions,
  className,
  eyebrow,
  title,
  titleId,
  ...props
}: AdminSectionHeaderProps) {
  return (
    <div className={clsx(styles.sectionHeader, className)} {...props}>
      <div>
        {eyebrow ? <AdminEyebrow>{eyebrow}</AdminEyebrow> : null}
        <h2 id={titleId}>{title}</h2>
      </div>
      {actions}
    </div>
  );
}

type AdminEmptyStateVariant = "dashboard" | "directory" | "volunteer";

export type AdminEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AdminEmptyStateVariant;
};

export function AdminEmptyState({
  className,
  variant = "directory",
  ...props
}: AdminEmptyStateProps) {
  return (
    <div
      className={clsx(styles.empty, styles[`empty-${variant}`], className)}
      {...props}
    />
  );
}

export type AdminTableProps = TableHTMLAttributes<HTMLTableElement> & {
  wrapperClassName?: string;
};

export function AdminTable({
  className,
  wrapperClassName,
  ...props
}: AdminTableProps) {
  return (
    <div className={clsx(styles.tableWrap, wrapperClassName)}>
      <table className={clsx(styles.table, className)} {...props} />
    </div>
  );
}

export type AdminStatusProps = HTMLAttributes<HTMLSpanElement>;

export function AdminStatus({ className, ...props }: AdminStatusProps) {
  return <span className={clsx(styles.status, className)} {...props} />;
}

export type AdminFooterProps = HTMLAttributes<HTMLElement>;

export function AdminFooter({ className, ...props }: AdminFooterProps) {
  return <footer className={clsx(styles.footer, className)} {...props} />;
}

export type AdminSurfaceProps = HTMLAttributes<HTMLDivElement> & ToneProps;

export function AdminSurface({
  className,
  tone = "oatmeal",
  ...props
}: AdminSurfaceProps) {
  return <div className={clsx(styles.surface, styles[tone], className)} {...props} />;
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
      className={clsx(styles.button, styles[tone], className)}
      type={type}
      {...props}
    />
  );
}

export type AdminLinkProps = ComponentProps<typeof Link> & ToneProps;

export function AdminLink({ children, className, tone = "denim", ...props }: AdminLinkProps) {
  return (
    <Link className={clsx(styles.button, styles[tone], className)} {...props}>
      <span>{children}</span>
      <AdminLinkStatus />
    </Link>
  );
}

export type AdminFieldProps = HTMLAttributes<HTMLDivElement>;

export function AdminField({ className, ...props }: AdminFieldProps) {
  return <div className={clsx(styles.field, className)} {...props} />;
}

export type AdminBadgeProps = HTMLAttributes<HTMLSpanElement> & ToneProps;

export function AdminBadge({
  className,
  tone = "denim",
  ...props
}: AdminBadgeProps) {
  return <span className={clsx(styles.badge, styles[tone], className)} {...props} />;
}
