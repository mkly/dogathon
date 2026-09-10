import { AdminBadge, AdminLink, AdminSurface } from "@/components/admin-ui";
import { VolunteerPhoto } from "./volunteer-ui";
import styles from "./volunteer.module.css";

export function CheckInConfirmation({
  residentName,
  residentPhoto,
  photos,
  orgSlug,
}: {
  residentName: string;
  residentPhoto?: string;
  photos: { id: string; url: string; webUrl?: string | null }[];
  orgSlug: string;
}) {
  return (
    <AdminSurface className={styles.confirmation} tone="moss">
      <VolunteerPhoto
        alt=""
        className={styles.confirmationPhoto}
        sizes="9rem"
        src={residentPhoto}
      />
      <AdminBadge className={styles.savedBadge} tone="moss">
        Update saved
      </AdminBadge>
      <h1>Thanks for the update on {residentName}!</h1>
      <p>
        Your photo and notes are saved for {residentName}’s next sponsor update.
      </p>
      {photos.length ? (
        <div
          aria-label="Photos added to this update"
          role="group"
          className={styles.confirmationPhotos}
        >
          {photos.map((photo) => (
            <VolunteerPhoto
              alt={`${residentName} from this update`}
              className={styles.confirmationThumbnail}
              key={photo.id}
              sizes="4rem"
              unoptimized
              src={photo.webUrl ?? photo.url}
            />
          ))}
        </div>
      ) : null}
      <AdminLink
        className={`${styles.action} ${styles.againLink}`}
        tone="denim"
        href={`/${orgSlug}/volunteer`}
      >
        Share another update
      </AdminLink>
    </AdminSurface>
  );
}
