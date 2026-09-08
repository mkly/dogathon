import styles from "./route-status.module.css";

type AdminRouteLoadingProps = {
  variant?: "dashboard" | "directory" | "members" | "settings" | "sponsors" | "sponsor" | "companions";
};

function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`${styles.skeleton} ${className}`} />;
}

export function AdminRouteLoading({ variant = "directory" }: AdminRouteLoadingProps) {
  if (variant === "dashboard") {
    return (
      <main aria-busy="true" aria-label="Loading staff room" className={styles.page}>
        <Skeleton className={styles.header} />
        <div className={styles.stats}>{Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.stat} key={index} />)}</div>
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
        <div className={styles.stack}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton
              className={`${styles.settingsCard} ${index === 2 ? styles.settingsEditorCard : ""}`}
              key={index}
            />
          ))}
        </div>
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

  if (variant === "sponsor") {
    return (
      <main aria-busy="true" aria-label="Loading sponsor details" className={`${styles.page} ${styles.directory}`}>
        <Skeleton className={styles.header} />
        <Skeleton className={styles.profileRow} />
        <Skeleton className={styles.sectionTitle} />
        <Skeleton className={styles.tableCard} />
      </main>
    );
  }

  if (variant === "sponsors" || variant === "companions") {
    return (
      <main
        aria-busy="true"
        aria-label={variant === "sponsors" ? "Loading sponsors" : "Loading companions covered"}
        className={`${styles.page} ${styles.directory}`}
      >
        <Skeleton className={styles.header} />
        <Skeleton className={styles.directorySummary} />
        <div className={styles.stack}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className={variant === "companions" ? styles.companionTableCard : styles.tableCard} key={index} />
          ))}
        </div>
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
    <main aria-busy="true" aria-label="Loading volunteer update" className={styles.volunteer}>
      <Skeleton className={styles.volunteerHeader} />
      <div className={styles.companions}>{Array.from({ length: 4 }, (_, index) => <Skeleton className={styles.companion} key={index} />)}</div>
      <div className={styles.volunteerThread}>
        <Skeleton className={styles.assistantMessage} />
        <Skeleton className={styles.userMessage} />
        <Skeleton className={styles.assistantMessage} />
      </div>
      <Skeleton className={styles.volunteerComposer} />
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

export function PublicRouteLoading() {
  return (
    <main aria-busy="true" aria-label="Loading rescue companions" className={styles.publicPage}>
      <Skeleton className={styles.publicWordmark} />
      <Skeleton className={styles.publicOrganization} />
      <Skeleton className={styles.publicHero} />
      <div className={styles.publicGrid}>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className={styles.publicCard} key={index} />
        ))}
      </div>
    </main>
  );
}

export function SignInRouteLoading() {
  return (
    <main aria-busy="true" aria-label="Loading sign in" className={styles.centeredPage}>
      <Skeleton className={styles.signInCard} />
    </main>
  );
}

export function InvitationRouteLoading() {
  return (
    <main aria-busy="true" aria-label="Loading invitation" className={styles.centeredPage}>
      <Skeleton className={styles.invitationCard} />
    </main>
  );
}
