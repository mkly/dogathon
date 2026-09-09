import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  FeltLink,
  FeltPanel,
  PhotoPatch,
  Stitch,
  StitchBadge,
} from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import {
  getPublicOrganizations,
  getPublicResidents,
} from "@/lib/public-roster-cache";

import wordmark from "../../public/brand/pawcast-wordmark.png";
import feltPup from "../../public/mascot/felt-pup-2.png";
import styles from "./landing.module.css";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Pawcast | Sponsor a rescue companion",
  description:
    "Chip in a little each month for a companion at a rescue, and hear how they are doing from the people who spend time with them.",
};

const steps = [
  {
    title: "Pick a companion",
    copy: "Browse the residents at a rescue and choose the one you keep coming back to.",
  },
  {
    title: "Give a little each month",
    copy: "Choose an amount that suits you. It goes to the rescue for food, beds, vet visits and the rest of daily life. Stop whenever you like.",
  },
  {
    title: "Hear how they are doing",
    copy: "Volunteers who spend time with your companion share what they got up to. The rescue turns that into an update with photos and sends it to you.",
  },
];

const questions = [
  {
    question: "Where does the money go?",
    answer:
      "To the rescue. It helps cover the everyday cost of looking after their residents, from food and bedding to trips to the vet. Each rescue sets its own amounts, and you will see them on the companion's page.",
  },
  {
    question: "Is sponsoring the same as adopting?",
    answer:
      "No. Sponsoring supports a companion while the rescue looks after them. You do not need to live nearby or be ready to adopt. If you would like to adopt, the rescue can tell you how.",
  },
  {
    question: "What happens when my companion is adopted?",
    answer:
      "You will hear the good news in an update, then choose the companion you would like to follow next. Your monthly sponsorship continues, and you can switch companions or cancel at any time from your sponsorship page.",
  },
  {
    question: "Can I stop?",
    answer:
      "Yes. You can switch companions or cancel at any time from your sponsorship page.",
  },
];

export default async function LandingPage() {
  const organizations = await getPublicOrganizations();
  const featuredOrganization =
    organizations.find(({ slug }) => slug === "huffy-puff") ?? organizations[0];
  const residents = featuredOrganization
    ? await getPublicResidents(featuredOrganization.id)
    : [];
  const photographedResidents = residents.filter(
    (resident) => resident.photoUrls[0],
  );
  const companion =
    photographedResidents.find(({ name }) => name === "Bingo") ??
    photographedResidents[0];

  return (
    <PageViewTransition>
      <main className={styles.shell}>
        <a className={styles.skipLink} href="#content">
          Skip to content
        </a>
        <header className={styles.header}>
          <Link aria-label="Pawcast home" className={styles.home} href="/">
            <Image
              alt="Pawcast"
              className={styles.wordmark}
              preload
              src={wordmark}
            />
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            <a href="#how-it-works">How it works</a>
            <a href="#rescues">Rescues</a>
            <Link className={styles.accountLink} href="/account">
              <StitchBadge tone="cream">
                <Stitch fine />
                My sponsorship
              </StitchBadge>
            </Link>
          </nav>
        </header>

        <div id="content">
          <FeltPanel className={styles.hero} tone="moss">
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Rescue sponsorship</p>
              <h1>
                Stand by a <span className="felt-hl">rescue companion</span>{" "}
                until they are home.
              </h1>
              <p className={styles.lede}>
                Pick a companion at a rescue, chip in a few dollars a month, and
                hear how they are doing from the volunteers who see them every
                week.
              </p>
              <FeltLink
                className={styles.heroLink}
                href="#rescues"
                tone="mustard"
              >
                Meet the companions
              </FeltLink>
            </div>
            {/* decorative: the heading and lede already carry the meaning */}
            <Image alt="" className={styles.mascot} preload src={feltPup} />
          </FeltPanel>

          <section
            aria-labelledby="how-title"
            className={styles.how}
            id="how-it-works"
          >
            <h2 id="how-title">How it works</h2>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title}>
                  <FeltPanel
                    className={styles.step}
                    stitched={false}
                    tone="cream"
                  >
                    <StitchBadge className={styles.stepNumber} tone="denim">
                      {index + 1}
                    </StitchBadge>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </FeltPanel>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="rescues-title"
            className={styles.rescues}
            id="rescues"
          >
            <div className={styles.rescueIntro}>
              <h2 id="rescues-title">Start with a rescue.</h2>
              <p>
                Every rescue here has people who turn up for their residents
                every day. Pick one and meet the companions in their care.
              </p>
              <ul className={styles.rescueList}>
                {organizations.length ? (
                  organizations.map((organization) => (
                    <li key={organization.id}>
                      <FeltLink
                        className={styles.rescueLink}
                        href={`/${organization.slug}`}
                        tone="oatmeal"
                      >
                        <span>{organization.name}</span>
                        <small>Meet their companions</small>
                      </FeltLink>
                    </li>
                  ))
                ) : (
                  <li className={styles.rescueEmpty}>
                    The first rescues are settling in. Check back soon.
                  </li>
                )}
              </ul>
            </div>

            {companion && featuredOrganization ? (
              <FeltPanel
                className={styles.featured}
                stitched={false}
                tone="oatmeal"
              >
                <PhotoPatch
                  alt={`${companion.name}, ${companion.breed}`}
                  className={styles.featuredPhoto}
                  preload
                  sizes="(max-width: 700px) calc(100vw - 80px), 300px"
                  src={companion.photoUrls[0]}
                />
                <div className={styles.featuredCopy}>
                  <p className={styles.featuredLabel}>
                    Waiting at {featuredOrganization.name}
                  </p>
                  <h3>{companion.name}</h3>
                  <p>
                    {companion.breed} · {companion.ageText}
                  </p>
                  <FeltLink
                    className={styles.featuredLink}
                    href={`/${featuredOrganization.slug}/companions/${companion.id}`}
                    tone="brick"
                  >
                    Meet {companion.name}
                  </FeltLink>
                </div>
              </FeltPanel>
            ) : null}
          </section>

          <section
            aria-labelledby="questions-title"
            className={styles.questions}
          >
            <h2 id="questions-title">Good to know</h2>
            <FeltPanel className={styles.answers} tone="cream">
              {questions.map(({ question, answer }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </FeltPanel>
          </section>
        </div>

        <footer className={styles.footer}>
          <span>Pawcast</span>
          <Link href="/account">Manage your sponsorship</Link>
        </footer>
      </main>
    </PageViewTransition>
  );
}
