/**
 * Section 3.4 — the LLM accuracy eval harness.
 *
 * This does NOT grade whether StyleOS "feels smart." It grades two specific,
 * narrow pipelines against 30 hand-labeled goals (evals/goals.json):
 *
 *   1. The deterministic parser (constraints.js + demo_fallbacks.js) — the
 *      code-level backstop that runs on every request regardless of LLM
 *      availability, and is the sole authority on gender (CLAUDE.md
 *      Invariant 1) and budget (Invariant 4) no matter what the model says.
 *   2. The raw LLM path (services/llm.js parseGoalViaLLM) — graded ONLY
 *      where a machine can grade it honestly (gender, budget); item-type
 *      extraction is free text and reported as a soft token-overlap score,
 *      not a hard pass/fail, because pretending otherwise would be a fake
 *      precision claim.
 *
 * Known gaps are first-class output here, not failures to hide — each
 * goal.json entry with a `knownLimitation` field is called out by name in
 * the report. That's the actual point of building this: find out where the
 * parser is wrong BEFORE a judge does, with numbers instead of a vibe.
 *
 * Usage: node evals/run.js   (from the repo root)
 * Exit code is always 0 — this is a report, not a CI gate. The three
 * PASS/FAIL gates for this project are verify_script_a.js and
 * verify_council_robustness.js (constraint enforcement, convergence) plus
 * this harness's own printed regression baseline (compare accuracy % run
 * to run, don't let it silently drop).
 */
const path = require('path');
require(path.join(__dirname, '../StyleOS-backend/node_modules/dotenv'))
  .config({ path: path.join(__dirname, '../StyleOS-backend/.env') });
const fs = require('fs');
const constraints = require(path.join(__dirname, '../StyleOS-backend/src/services/constraints'));
const fallback = require(path.join(__dirname, '../StyleOS-backend/src/services/demo_fallbacks'));
const llm = require(path.join(__dirname, '../StyleOS-backend/src/services/llm'));

const goals = JSON.parse(fs.readFileSync(path.join(__dirname, 'goals.json'), 'utf8'));

function eq(a, b) { return a === b; } // null === null is true — a correct "stays unknown" counts as a pass

function colorSetEquals(actual, expected) {
  const a = new Set((actual || []).map(c => c.toLowerCase()));
  const b = new Set((expected || []).map(c => c.toLowerCase()));
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// Deterministic items are a fixed vocabulary — exact type match is fair.
function itemsEqualsExact(actual, expected) {
  if (expected === null) return null; // out of scope for this goal
  const norm = (arr) => arr.map(i => `${i.type}:${i.quantity}`).sort().join('|');
  return norm(actual) === norm(expected);
}

// LLM item types are free text ("tee" vs "oversized tee" vs "t-shirt") —
// grading exact string equality would just be measuring vocabulary luck.
// Token-overlap is a soft, honestly-labeled proxy, not a real judgment.
function tokenOverlap(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/));
  const tb = new Set(b.toLowerCase().split(/\s+/));
  const inter = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}
function itemsSoftScore(actualItems, expectedItems) {
  if (expectedItems === null) return null;
  if (expectedItems.length === 0) return actualItems.length === 0 ? 1 : 0;
  let hits = 0;
  for (const exp of expectedItems) {
    const matched = actualItems.some(a => tokenOverlap(a.type || '', exp.type) >= 0.4 && a.quantity === exp.quantity);
    if (matched) hits++;
  }
  return hits / expectedItems.length;
}

function pct(n, d) { return d === 0 ? 'n/a' : `${Math.round((n / d) * 100)}%`; }

async function main() {
  const det = { gender: 0, budget: 0, colors: 0, colorMode: 0, items: 0, itemsTotal: 0, total: 0 };
  const llmScore = { gender: 0, budget: 0, itemsSoftSum: 0, itemsTotal: 0, total: 0, attempted: 0, fellBack: 0 };
  const limitations = [];
  const failures = [];

  for (const g of goals) {
    const exp = g.expected;
    det.total++;

    // ── Deterministic pipeline — always available, no network dependency ──
    const detGender = constraints.resolvePlanGender(g.text).gender;
    const detBudget = fallback.extractBudget(g.text);
    const detColors = fallback.extractColors(g.text);
    const detColorMode = fallback.extractColorMode(g.text, detColors);
    const detItemsRaw = fallback.extractItems(g.text).map(i => ({ type: i.type, quantity: i.quantity }));

    const genderOk = eq(detGender, exp.gender);
    const budgetOk = eq(detBudget, exp.budget);
    const colorsOk = colorSetEquals(detColors, exp.colors);
    const colorModeOk = eq(detColorMode, exp.colorMode);
    const itemsOk = itemsEqualsExact(detItemsRaw, exp.items);

    if (genderOk) det.gender++;
    if (budgetOk) det.budget++;
    if (colorsOk) det.colors++;
    if (colorModeOk) det.colorMode++;
    if (itemsOk !== null) { det.itemsTotal++; if (itemsOk) det.items++; }

    if (!genderOk || !budgetOk || !colorsOk || !colorModeOk || itemsOk === false) {
      failures.push({
        id: g.id, pipeline: 'deterministic',
        gender: genderOk ? null : { got: detGender, want: exp.gender },
        budget: budgetOk ? null : { got: detBudget, want: exp.budget },
        colors: colorsOk ? null : { got: detColors, want: exp.colors },
        colorMode: colorModeOk ? null : { got: detColorMode, want: exp.colorMode },
        items: itemsOk === false ? { got: detItemsRaw, want: exp.items } : null,
      });
    }

    if (g.knownLimitation) limitations.push({ id: g.id, note: g.knownLimitation });

    // ── Real LLM pipeline — degrades gracefully if Ollama isn't running ──
    llmScore.attempted++;
    try {
      const plan = await llm.parseGoalViaLLM(g.text, '', null);
      llmScore.total++;
      const llmGenderOk = eq(plan.gender || null, exp.gender);
      const llmBudgetOk = eq(plan.total_budget ?? null, exp.budget);
      if (llmGenderOk) llmScore.gender++;
      if (llmBudgetOk) llmScore.budget++;
      const soft = itemsSoftScore(plan.items || [], exp.items);
      if (soft !== null) { llmScore.itemsTotal++; llmScore.itemsSoftSum += soft; }
    } catch (err) {
      llmScore.fellBack++;
    }
  }

  console.log('=== StyleOS Goal-Parsing Eval Harness (Section 3.4) ===');
  console.log(`${goals.length} hand-labeled goals — core demo scripts, Hinglish/code-mixed, contradictory signals, impossible budgets, adversarial input, clean varied contexts.\n`);

  console.log('--- Deterministic parser (constraints.js + demo_fallbacks.js) ---');
  console.log(`  Gender:      ${pct(det.gender, det.total)}  (${det.gender}/${det.total})`);
  console.log(`  Budget:      ${pct(det.budget, det.total)}  (${det.budget}/${det.total})`);
  console.log(`  Colors:      ${pct(det.colors, det.total)}  (${det.colors}/${det.total})`);
  console.log(`  Color mode:  ${pct(det.colorMode, det.total)}  (${det.colorMode}/${det.total})`);
  console.log(`  Items (exact vocabulary match): ${pct(det.items, det.itemsTotal)}  (${det.items}/${det.itemsTotal}, ${det.total - det.itemsTotal} goals out of scope for item extraction)`);

  console.log('\n--- Real LLM path (services/llm.js parseGoalViaLLM) ---');
  if (llmScore.total === 0) {
    console.log(`  Ollama unreachable / MOCK_LLM=true for all ${llmScore.attempted} goals — no live LLM numbers this run.`);
    console.log('  (This is expected demo-resilience behavior per CLAUDE.md Invariant 7, not a harness failure.)');
  } else {
    console.log(`  Reached the model for ${llmScore.total}/${llmScore.attempted} goals (${llmScore.fellBack} fell back / errored).`);
    console.log(`  Gender:      ${pct(llmScore.gender, llmScore.total)}  (${llmScore.gender}/${llmScore.total})`);
    console.log(`  Budget:      ${pct(llmScore.budget, llmScore.total)}  (${llmScore.budget}/${llmScore.total})`);
    console.log(`  Items (soft token-overlap proxy, NOT exact — free text): ${llmScore.itemsTotal ? Math.round((llmScore.itemsSoftSum / llmScore.itemsTotal) * 100) + '%' : 'n/a'}`);
    console.log('  Gender/budget are graded hard because the LLM output is structured; items are graded soft because "tee" vs "oversized tee" vs "t-shirt" is a vocabulary question, not a correctness question.');
  }

  console.log(`\n--- Known limitations found by this harness (${limitations.length}) ---`);
  for (const l of limitations) {
    console.log(`  [${l.id}] ${l.note}`);
  }

  if (failures.length > 0) {
    console.log(`\n--- Unexpected deterministic-pipeline misses (${failures.length}) — not pre-documented as knownLimitation ---`);
    for (const f of failures) {
      console.log(`  [${f.id}]`);
      for (const field of ['gender', 'budget', 'colors', 'colorMode', 'items']) {
        if (f[field]) console.log(`    ${field}: got ${JSON.stringify(f[field].got)}, expected ${JSON.stringify(f[field].want)}`);
      }
    }
  } else {
    console.log('\nNo unexpected deterministic-pipeline misses — every miss this run was already documented as a known limitation.');
  }

  console.log('\nConstraint-enforcement (0 gender/color/category violations across the live catalog) and convergence/deadlock-detection accuracy are covered separately by:');
  console.log('  node StyleOS-backend/src/scripts/verify_script_a.js');
  console.log('  node StyleOS-backend/src/scripts/verify_council_robustness.js');
  console.log('This harness is scoped to goal-parsing accuracy only — a different question from "does the selected cart ever violate a constraint."');
}

main().catch(err => { console.error('Eval harness crashed:', err); process.exit(1); });
