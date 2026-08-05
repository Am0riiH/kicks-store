import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/**
 * Shared shell for the policy pages (Privacy, Terms, Shipping and Returns).
 * Matches the About.jsx page layout — same container, eyebrow, display heading
 * and text-smoke body — so the three of them do not triplicate the same JSX.
 *
 * @param {object}   props
 * @param {string}   props.title      document title, e.g. 'Privacy Policy | Drop Site'
 * @param {string}   props.eyebrow    small volt label above the heading
 * @param {string[]} props.heading    heading lines, rendered separated by <br/>
 * @param {string}   props.intro      lead paragraph
 * @param {string}   props.updated    human-readable last-updated date
 * @param {{heading: string, body: string}[]} props.sections
 */
export default function LegalPage({ title, eyebrow, heading, intro, updated, sections }) {
  useDocumentTitle(title);

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
      <span className="font-mono text-xs uppercase tracking-widest text-volt">{eyebrow}</span>
      <h1 className="mt-2 font-display text-5xl uppercase leading-[0.95] text-bone sm:text-7xl">
        {heading.map((line, i) => (
          <span key={line}>
            {line}
            {i < heading.length - 1 && <br />}
          </span>
        ))}
      </h1>

      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-smoke">{intro}</p>

      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-white/40">
        Last updated: {updated}
      </p>

      <div className="mt-14 flex flex-col divide-y divide-white/10 border-y border-white/10">
        {sections.map((s) => (
          <section key={s.heading} className="py-8">
            <h2 className="font-display text-xl uppercase text-bone sm:text-2xl">{s.heading}</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-smoke">{s.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-smoke">
        Questions about this policy?{' '}
        <a href="/contact" className="text-volt hover:underline">
          Contact us
        </a>
        .
      </p>
    </div>
  );
}
