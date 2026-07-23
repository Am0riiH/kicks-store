import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function About() {
  useDocumentTitle('Our Story | Drop Site');
  const stats = [
    { label: 'Founded', value: '1985' },
    { label: 'Silhouettes archived', value: '140+' },
    { label: 'Cities served', value: '62' },
    { label: 'Pairs shipped', value: '2.4M' },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
      <span className="font-mono text-xs uppercase tracking-widest text-volt">Our story</span>
      <h1 className="mt-2 font-display text-5xl uppercase leading-[0.95] text-bone sm:text-7xl">
        More Than
        <br />
        A Shoe
      </h1>

      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-smoke">
        What started as a basketball shoe became a cultural language. We curate, authenticate,
        and ship the archive — from day-one colorways to the latest retro run — to collectors
        and first-time buyers alike. Every pair on this site is sourced, inspected, and released
        with the same standard the original design demanded.
      </p>

      <div className="mt-14 grid grid-cols-2 gap-8 border-y border-white/10 py-10 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="font-display text-4xl text-volt">{s.value}</span>
            <span className="font-mono text-xs uppercase tracking-widest text-smoke">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl uppercase text-bone">Authenticity first</h2>
          <p className="mt-3 text-smoke">
            Every listing is checked against factory records and materials audits before it goes
            live. No exceptions.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl uppercase text-bone">Built for the culture</h2>
          <p className="mt-3 text-smoke">
            We work directly with collectors and archivists to keep rare colorways in
            circulation, not locked in a vault.
          </p>
        </div>
      </div>
    </div>
  );
}
