import styles from "./route-status.module.css";

type AdminRouteLoadingProps = {
  variant?: "dashboard" | "directory" | "members" | "settings";
};

function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`${styles.skeleton} ${className}`} />;
}

export function AdminRouteLoading({ variant = "directory" }: AdminRouteLoadingProps) {
  if (variant === "dashboard") {
    return (
      <main aria-busy="true" aria-label="Loading staff room" className={styles.page}>
        <Skeleton className={styles.header} />
        <div className={styles.stats}>{Array.from({ length: 3 }, (_, index) => <Skeleton className={styles.stat} key={index} />)}</div>
        <Skeleton className={styles.sectionTitle} />
        <div className={styles.grid}>{Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.card} key={index} />)}</div>
        <Skeleton className={styles.sectionTitle} />
        <div className={styles.queue}><Skeleton className={styles.queueCard} /><Skeleton className={styles.queueCard} /></div>
      </main>
    );
  }

  if (variant === "settings") {
    return (
      <main aria-busy="true" aria-label="Loading staff settings" className={styles.page}>
        <Skeleton className={styles.header} />
        <div className={styles.stack}>{Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.settingsCard} key={index} />)}</div>
      </main>
    );
  }

  if (variant === "members") {
    return (
      <main aria-busy="true" aria-label="Loading organization members" className={styles.page}>
        <Skeleton className={styles.header} />
        <Skeleton className={styles.sectionTitle} />
        <div className={styles.stack}>{Array.from({ length: 3 }, (_, index) => <Skeleton className={styles.row} key={index} />)}</div>
        <Skeleton className={styles.sectionTitle} />
        <div className={styles.stack}><Skeleton className={styles.row} /><Skeleton className={styles.row} /></div>
      </main>
    );
  }

  return (
    <main aria-busy="true" aria-label="Loading staff page" className={`${styles.page} ${styles.directory}`}>
      <Skeleton className={styles.header} />
      <Skeleton className={styles.sectionTitle} />
      <div className={styles.stack}>{Array.from({ length: 3 }, (_, index) => <Skeleton className={styles.queueCard} key={index} />)}</div>
    </main>
  );
}

export function VolunteerRouteLoading() {
  return (
    <main aria-busy="true" aria-label="Loading volunteer check-in" className={styles.volunteer}>
      <Skeleton className={styles.volunteerHeader} />
      <div className={styles.companions}>{Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.companion} key={index} />)}</div>
      <Skeleton className={styles.note} />
      <Skeleton className={styles.submit} />
    </main>
  );
}

export function AccountRouteLoading() {
  return (
    <main aria-busy="true" aria-label="Loading sponsor account" className={styles.account}>
      <Skeleton className={styles.header} />
      <div className={styles.accountLayout}><Skeleton className={styles.accountCard} /><Skeleton className={styles.accountCard} /></div>
    </main>
  );
}

export function OrganizationsRouteLoading() {
  return (
    <main aria-busy="true" aria-label="Loading rescue organizations" className={styles.organizations}>
      <Skeleton className={styles.organizationCard} />
      <Skeleton className={styles.organizationCard} />
      <Skeleton className={styles.organizationCard} />
    </main>
  );
}
