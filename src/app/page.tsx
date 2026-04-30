import Link from "next/link";
import styles from "./page.module.css";

const stats = [
  { value: "30-50%", label: "Mobile 911 calls can be accidental" },
  { value: "$90-$150", label: "Estimated cost per unnecessary dispatch" },
  { value: "Up to 60%", label: "Peak-time calls reported as misuse in studies" },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandDot} />
          <span>Rescue Remix</span>
        </div>
        <nav className={styles.nav}>
          <Link href="/login" className={styles.navLink}>
            Sign in
          </Link>
          <Link href="/register" className={styles.navButton}>
            Get started
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.kicker}>AI-Assisted Emergency Command Center</p>
          <h1 className={styles.title}>
            Triage the noise.
            <br />
            Prioritize real emergencies.
          </h1>
          <p className={styles.subtitle}>
            A modern operations workspace that helps organizations filter accidental
            and non-emergency calls so dispatchers can focus on critical incidents.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/dashboard" className={styles.primaryCta}>
              Open Dashboard
            </Link>
            <Link href="/login" className={styles.secondaryCta}>
              Dispatcher Login
            </Link>
          </div>
        </section>

        <section className={styles.stats}>
          {stats.map((stat) => (
            <article key={stat.label} className={styles.statCard}>
              <p className={styles.statValue}>{stat.value}</p>
              <p className={styles.statLabel}>{stat.label}</p>
            </article>
          ))}
        </section>

        <section className={styles.flow}>
          <h2>How it works</h2>
          <div className={styles.flowGrid}>
            <article className={styles.flowCard}>
              <span>01</span>
              <h3>AI intake</h3>
              <p>
                Voice AI greets callers, captures context, and classifies urgency
                before escalation.
              </p>
            </article>
            <article className={styles.flowCard}>
              <span>02</span>
              <h3>Live operator workspace</h3>
              <p>
                Dispatchers get active conversations, transcripts, and call history
                in one place.
              </p>
            </article>
            <article className={styles.flowCard}>
              <span>03</span>
              <h3>Supervisor visibility</h3>
              <p>
                Monitor live sessions and analytics to improve response quality and
                staffing decisions.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
