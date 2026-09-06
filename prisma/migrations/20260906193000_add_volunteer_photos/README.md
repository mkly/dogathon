# Volunteer photo storage rollout

This data migration deliberately spans the two adjacent Prisma migrations:

1. Apply `20260906193000_add_volunteer_photos` to create `VolunteerPhoto`.
2. Run `npm run photos:migrate`. It uploads every inline photo and is safe to rerun.
3. Apply `20260906194000_drop_inline_volunteer_photo_bytes` only after the script reports no failures.

Do not run both database migrations in one unattended deploy when an existing database may contain `VolunteerNote.photoData` rows. New installations with no legacy data may apply both normally.
