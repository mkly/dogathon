import {
  FeltButton,
  FeltPanel,
  PhotoPatch,
  StitchBadge,
} from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";

import styles from "./styleguide.module.css";

export default function FeltStyleguidePage() {
  return (
    <PageViewTransition>
      <main className={styles.page}>
        <header className={styles.header}>
          <StitchBadge tone="brick">Pawcast design system</StitchBadge>
          <h1>Cut from the same cloth</h1>
          <p>
            Shared felt primitives for warm, practical rescue experiences. The
            irregular edges, layered shadows, and visible stitches come from the
            original Pawcast mockups.
          </p>
        </header>

        <section className={styles.grid} aria-label="Felt component examples">
          <FeltPanel className={styles.hero} tone="moss">
            <StitchBadge tone="mustard">FeltPanel</StitchBadge>
            <h2>A soft surface with sturdy edges.</h2>
            <p>Use panels to group a story, form, or staff-room task.</p>
          </FeltPanel>

          <FeltPanel className={styles.sample} tone="oatmeal">
            <h2>Pressable patches</h2>
            <p>The shadow collapses when the button is pressed.</p>
            <div className={styles.actions}>
              <FeltButton>Pick Biscuit</FeltButton>
              <FeltButton tone="brick">Approve &amp; send</FeltButton>
            </div>
          </FeltPanel>

          <FeltPanel className={styles.sample} tone="denim">
            <h2>Status stitches</h2>
            <p>Compact badges keep state legible without losing the texture.</p>
            <div className={styles.actions}>
              <StitchBadge tone="moss">Available</StitchBadge>
              <StitchBadge tone="brick">Needs review</StitchBadge>
              <StitchBadge tone="mustard">Draft</StitchBadge>
            </div>
          </FeltPanel>

          <FeltPanel className={styles.photoSample} tone="cream">
            <PhotoPatch alt="Companion photo placeholder" />
            <div>
              <StitchBadge tone="moss">PhotoPatch</StitchBadge>
              <h2>Photos stitched on, never boxed in.</h2>
              <p>Pass a source URL to replace this accessible placeholder.</p>
            </div>
          </FeltPanel>
        </section>
      </main>
    </PageViewTransition>
  );
}
