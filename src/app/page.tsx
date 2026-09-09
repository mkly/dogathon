import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { FeltLink, FeltPanel, Stitch, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";

import wordmark from "../../public/brand/pawcast-wordmark.png";
import feltPup from "../../public/mascot/felt-pup-2.png";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Pawcast | Monthly sponsorship for animal rescues",
  description:
    "Manage monthly animal sponsorships, sync your adoption roster, and send sponsor updates from one place with Pawcast.",
};

const steps = [
  {
    title: "Set up your sponsorship page",
    copy: "Create your rescue’s page, connect your adoption roster, and set your monthly sponsorship amounts.",
  },
  {
    title: "Accept monthly sponsorships",
    copy: "Share your page with your community. Supporters choose a companion to follow and contribute monthly toward your rescue’s work.",
  },
  {
    title: "Send updates to sponsors",
    copy: "Collect photos and notes from volunteers. Pawcast prepares update drafts for your staff to review, edit, and send.",
  },
];

const questions = [
  {
    question: "Can we set our own sponsorship amounts?",
    answer:
      "Yes. Your team chooses the monthly sponsorship amounts shown on your rescue’s page. Supporters choose from those amounts when they sign up.",
  },
  {
    question: "How are payments processed?",
    answer:
      "Payments are processed through Stripe Connect and passed through to your rescue’s connected Stripe account. We’re also working on a Fundraise Up integration.",
  },
  {
    question: "How do we keep our roster up to date?",
    answer:
      "Add your adoption-page URL in staff settings. Pawcast syncs companion details from that source, and your team can review sync results and mark companions as adopted in the staff room.",
  },
  {
    question: "What happens when a companion is adopted?",
    answer:
      "Sponsors hear the good news and can choose another companion to follow. Their monthly sponsorship continues supporting your rescue. They can switch companions or cancel at any time.",
  },
  {
    question: "How are updates created?",
    answer:
      "Volunteers choose the animal they spent time with, add photos, and answer a few questions about their visit. Pawcast uses those details to prepare a sponsor update draft. Your staff can review and edit it before sending, so volunteers can contribute without having to write a finished update.",
  },
  {
    question: "Does our team approve sponsor updates?",
    answer:
      "Yes. Your team can review and edit update drafts before sending them. Volunteers contribute the photos and stories; your rescue controls what sponsors receive.",
  },
];

export default function LandingPage() {
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
            <a href="#questions">Questions</a>
            <Link className={styles.accountLink} href="/staff/sign-in">
              Staff sign in <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </header>

        <div id="content">
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={styles.heroCopy}>
              <StitchBadge className={styles.eyebrow} tone="moss">
                <Stitch fine />
                For animal rescues
              </StitchBadge>
              <h1 id="hero-title">Monthly sponsorships for your rescue.</h1>
              <p className={styles.lede}>
                Give supporters a way to sponsor the animals in your care.
                Manage monthly sponsorships, keep your adoption roster up to
                date, and send updates using photos and notes from volunteers.
              </p>
              <FeltLink
                className={styles.heroLink}
                href="/staff/sign-in"
                tone="mustard"
              >
                Get started with Pawcast
              </FeltLink>
            </div>
            {/* decorative: the heading and lede already carry the meaning */}
            <div className={styles.mascotScene} aria-hidden="true">
              <FeltPanel className={styles.mascotPanel} tone="moss" />
              <Image alt="" className={styles.mascot} preload src={feltPup} />
            </div>
          </section>

          <section
            aria-labelledby="how-title"
            className={styles.how}
            id="how-it-works"
          >
            <h2 id="how-title">How it works</h2>
            <div className={styles.stepsLayout}>
              <svg
                className={styles.stepThread}
                viewBox="0 0 1000 80"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M0 30 C35 30 55 39 90 36 C125 34 142 19 128 20 C114 21 125 40 160 35 C270 25 420 28 500 30 C565 23 610 28 655 32 C694 35 719 44 723 35 C728 24 700 25 706 33 C719 43 750 40 768 32 C784 23 755 19 753 31 C751 42 784 39 807 34 C870 28 955 28 1000 30"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <ol className={styles.steps}>
                {steps.map((step, index) => (
                  <li className={styles.step} key={step.title}>
                    <StitchBadge
                      className={styles.stepNumber}
                      tone={(["moss", "mustard", "denim"] as const)[index]}
                    >
                      <Stitch fine />
                      {index + 1}
                    </StitchBadge>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section
            aria-labelledby="questions-title"
            className={styles.questions}
            id="questions"
          >
            <h2 id="questions-title">Common questions</h2>
            <div className={styles.answers}>
              {questions.map(({ question, answer }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <span>Pawcast</span>
          <Link href="/staff/sign-in">Staff sign in</Link>
        </footer>
      </main>
    </PageViewTransition>
  );
}
