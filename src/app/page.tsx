import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageViewTransition } from "@/components/page-view-transition";
import { getPublicOrganizations, getPublicResidents } from "@/lib/public-roster-cache";

import wordmark from "../../public/brand/pawcast-wordmark.png";
import feltPup from "../../public/mascot/felt-pup-2.png";
import styles from "./landing.module.css";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Pawcast | A little care. A real connection.",
  description: "Help a rescue companion with monthly support, and follow their story through updates from the people who care for them.",
};

const steps = [
  { title: "Find a familiar face.", copy: "Meet the companions at a rescue and choose someone you’d like to support." },
  { title: "Give a little, monthly.", copy: "Choose a sponsorship amount that feels right for you. Help with the everyday care that makes a difference." },
  { title: "Be part of their story.", copy: "Get photos and updates from the rescue, and follow your companion’s journey toward a home." },
];

export default async function LandingPage() {
  const organizations = await getPublicOrganizations();
  const featuredOrganization = organizations.find(({ slug }) => slug === "huffy-puff") ?? organizations[0];
  const residents = featuredOrganization ? await getPublicResidents(featuredOrganization.id) : [];
  const photographedResidents = residents.filter((resident) => resident.photoUrls[0]);
  const companion = photographedResidents.find(({ name }) => name === "Bingo") ?? photographedResidents[0];
  const companionHref = companion && featuredOrganization
    ? `/${featuredOrganization.slug}/companions/${companion.id}`
    : "#rescues";

  return (
    <PageViewTransition>
      <div className={styles.page}>
        <a className={styles.skipLink} href="#main">Skip to content</a>
        <header className={styles.header}>
          <Link href="/" aria-label="Pawcast home" className={styles.brand}>
            <Image src={wordmark} alt="Pawcast" sizes="150px" preload />
          </Link>
          <nav aria-label="Main navigation" className={styles.nav}>
            <a href="#how-it-works">How it works</a>
            <a href="#rescues">Meet the rescues</a>
            <Link href="/account" className={styles.accountLink}>My sponsorship <span aria-hidden="true">↗</span></Link>
          </nav>
        </header>

        <main id="main" className={styles.main}>
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span className={styles.dot} /> A small kindness, month by month</p>
              <h1 id="hero-title">A little care.<br />A real <em>connection.</em></h1>
              <p className={styles.lede}>You don’t have to bring them home<br className={styles.desktopBreak} /> to be there for them.</p>
              <p className={styles.intro}>Sponsor a rescue companion, help with their everyday care, and get little glimpses of the life you’re making better.</p>
              <a className={styles.primaryLink} href="#rescues">Find a companion <span aria-hidden="true">↗</span></a>
              <p className={styles.heroNote}>For the full bowls, the warm beds, and the days in between.</p>
            </div>

            <div className={styles.heroVisual}>
              <figure className={styles.portrait}>
                <Link href={companionHref} className={styles.photoLink} aria-label={companion ? `Meet ${companion.name} at ${featuredOrganization.name}` : "Meet the rescues"}>
                  <Image
                    src={companion?.photoUrls[0] ?? feltPup}
                    alt={companion ? `${companion.name}, a rescue companion at ${featuredOrganization.name}` : "A little felt rescue pup"}
                    fill
                    sizes="(max-width: 760px) 85vw, 440px"
                    preload
                    className={companion ? styles.photo : styles.mascot}
                  />
                </Link>
                <figcaption className={styles.caption}>
                  <div><span className={styles.captionLabel}>{companion ? "A face to fall for" : "A friend to be there for"}</span><strong>{companion?.name ?? "Someone is waiting."}</strong></div>
                  {featuredOrganization && <Link href={`/${featuredOrganization.slug}`}>{featuredOrganization.name} <span aria-hidden="true">↗</span></Link>}
                </figcaption>
              </figure>
              <div className={styles.littleNote}><span aria-hidden="true">♡</span> A friend, even from afar.</div>
            </div>
          </section>

          <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>A simple way to be there</p>
              <h2 id="how-title">Their everyday. Your little part in it.</h2>
            </div>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.stepNumber}>0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="rescues" className={styles.rescues} aria-labelledby="rescues-title">
            <div className={styles.rescueIntro}>
              <p className={styles.eyebrow}>Good people. Very good company.</p>
              <h2 id="rescues-title">Start with a rescue.<br />Stay for a friend.</h2>
              <p>Behind every companion is a team showing up for them. Find a rescue below and meet the animals in their care.</p>
            </div>
            <div className={styles.rescueList}>
              {organizations.length ? organizations.map((organization) => (
                <Link key={organization.id} href={`/${organization.slug}`} className={styles.rescueLink} transitionTypes={["nav-forward"]}>
                  <span><strong>{organization.name}</strong><span>Meet their companions</span></span>
                  <span className={styles.rescueArrow} aria-hidden="true">↗</span>
                </Link>
              )) : <p>Our rescue directory is getting ready. Come back soon to meet the companions.</p>}
            </div>
          </section>

          <section className={styles.questions} aria-labelledby="questions-title">
            <div><p className={styles.eyebrow}>A few things to know</p><h2 id="questions-title">Before you say hello.</h2></div>
            <div className={styles.answers}>
              <details><summary>What does my sponsorship help with?</summary><p>Your monthly gift supports a companion’s everyday care, including food, a safe place to sleep, and veterinary care. Each rescue lists its sponsorship options on the companion’s page.</p></details>
              <details><summary>Is sponsoring the same as adopting?</summary><p>Sponsoring is a way to support a companion while they’re in a rescue’s care. You don’t need to be ready to adopt or live nearby. If you’d like to adopt, contact the rescue about its adoption process.</p></details>
              <details><summary>Will I hear how my companion is doing?</summary><p>Yes. The rescue shares photos and updates by email, so you can follow along with your companion’s life and care.</p></details>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <span>Pawcast <span className={styles.footerDivider}>/</span> A little closer to the lives you help.</span>
          <Link href="/account">Manage your sponsorship <span aria-hidden="true">↗</span></Link>
        </footer>
      </div>
    </PageViewTransition>
  );
}
