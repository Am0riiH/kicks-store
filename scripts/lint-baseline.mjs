#!/usr/bin/env node
/**
 * Lint ratchet.
 *
 * `npm run lint` exits 1 today: there are known, deliberately-deferred
 * violations (React Compiler rules about render timing whose fixes need real
 * restructuring — see the lint pass notes). A CI job that simply ran eslint
 * would be red on day one and would stay red, which trains everyone to ignore
 * it.
 *
 * So instead of pass/fail we ratchet: this compares the current counts against
 * a committed baseline and fails only when they go UP. Existing debt does not
 * block, new debt does.
 *
 * When you fix something, run with --update to lower the baseline. It refuses
 * to raise it, so the ratchet only ever turns one way.
 *
 *   node scripts/lint-baseline.mjs            check (CI)
 *   node scripts/lint-baseline.mjs --update   lower the baseline after fixes
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, '.lintbaseline.json');
const UPDATE = process.argv.includes('--update');

function runEslint() {
  // eslint exits non-zero when it finds errors, which execFileSync treats as a
  // throw — the JSON report still arrives on stdout, so read it either way.
  // Resolve eslint's own binary rather than going through npx with shell:true,
  // which Node 22+ deprecation-warns about and would need escaping anyway.
  const bin = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
  try {
    return execFileSync(process.execPath, [bin, '.', '-f', 'json'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

/* eslint's JSON output can start with a byte-order mark on Windows, which
   JSON.parse rejects. Stripped by code point rather than a literal character:
   a literal BOM in source is invisible and trips no-irregular-whitespace. */
const raw = runEslint();
const report = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

const current = report.reduce(
  (acc, file) => ({
    errors: acc.errors + file.errorCount,
    warnings: acc.warnings + file.warningCount,
  }),
  { errors: 0, warnings: 0 },
);

const baseline = fs.existsSync(BASELINE_FILE)
  ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
  : { errors: Infinity, warnings: Infinity };

console.log(`  current : ${current.errors} errors, ${current.warnings} warnings`);
console.log(`  baseline: ${baseline.errors} errors, ${baseline.warnings} warnings`);

if (UPDATE) {
  if (current.errors > baseline.errors || current.warnings > baseline.warnings) {
    console.error('\n✖ Refusing to raise the baseline. Fix the new problems instead.');
    process.exit(1);
  }
  fs.writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify({ ...current, note: 'Lint ratchet. Lower with: node scripts/lint-baseline.mjs --update' }, null, 2)}\n`,
  );
  console.log('\n✔ Baseline lowered.');
  process.exit(0);
}

const worse = [];
if (current.errors > baseline.errors) {
  worse.push(`errors ${baseline.errors} → ${current.errors} (+${current.errors - baseline.errors})`);
}
if (current.warnings > baseline.warnings) {
  worse.push(`warnings ${baseline.warnings} → ${current.warnings} (+${current.warnings - baseline.warnings})`);
}

if (worse.length) {
  console.error(`\n✖ Lint got worse: ${worse.join(', ')}`);
  console.error('  Run `npm run lint` to see them. Fix the new ones — the pre-existing');
  console.error('  count is allowed, growing it is not.');
  process.exit(1);
}

const better = current.errors < baseline.errors || current.warnings < baseline.warnings;
console.log(
  better
    ? '\n✔ Lint improved. Run `node scripts/lint-baseline.mjs --update` to lock it in.'
    : '\n✔ Lint unchanged against baseline.',
);
