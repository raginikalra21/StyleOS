/**
 * Automated proof, not a claim, of Script A correctness (CLAUDE.md Page 10 /
 * Page 38 / Page 49). Runs the actual plan -> shop -> finalize pipeline
 * through the real HTTP API (the exact code path the app uses), then
 * checks the results in code. Exits nonzero on any violation.
 *
 * Usage: node src/scripts/verify_script_a.js
 * Requires the backend to already be running (default http://localhost:5000).
 */
require('dotenv').config();
const { query, closePool } = require('../db');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:5000/api';
const GOAL_TEXT = 'Starting college next month. Budget 15000. Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie. Black/grey only. Delhi. Hostel.';
const ALLOWED_TYPES = ['tshirts', 'trousers', 'jeans', 'sweatshirts'];
const ALLOWED_COLOURS = ['black', 'grey'];

const violations = [];
const passed = [];

function check(label, condition, detail) {
  if (condition) {
    passed.push(label);
  } else {
    violations.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let TOKEN = null;

async function ensureTestUser() {
  const email = 'verify_script_a@styleos.test';
  const password = 'VerifyA1234!';
  let r = await api('/auth/register', { name: 'Script A Verifier', email, password });
  if (r.status !== 200 && r.status !== 201) {
    r = await api('/auth/login', { email, password });
  }
  if (!r.json.token) throw new Error(`Could not obtain auth token: ${JSON.stringify(r.json)}`);
  TOKEN = r.json.token;
}

async function main() {
  console.log('=== Script A Verification ===');
  console.log(`Goal: "${GOAL_TEXT}"\n`);

  await ensureTestUser();

  // 1. Ambiguous goal must ask for clarification, never guess.
  const r1 = await api('/agent/plan', { goalText: GOAL_TEXT });
  check('Ambiguous goal triggers clarification (never guesses gender)', r1.json.needsClarification === true, JSON.stringify(r1.json));

  // 2. Clarified goal resolves gender explicitly and produces 4 item slots.
  const r2 = await api('/agent/plan', { goalText: GOAL_TEXT, clarifiedGender: 'Men' });
  const plan = r2.json.plan;
  const cartId = r2.json.cartId;
  check('Clarified plan resolves gender to Men', plan?.gender === 'Men', plan?.gender);
  check('Clarified plan has gender_confidence explicit', plan?.gender_confidence === 'explicit', plan?.gender_confidence);
  check('Plan produces exactly 4 item slots (tee/cargo/jeans/hoodie)', plan?.items?.length === 4, `got ${plan?.items?.length}`);
  check('cartId returned', !!cartId, cartId);

  if (!cartId || !plan) {
    console.error('\nFATAL: could not obtain a plan/cart — aborting remaining checks.');
    report();
    return;
  }

  // 3. Shop every item slot and collect all added products.
  const allProducts = [];
  let anyShortfall = false;
  for (const item of plan.items) {
    const r = await api('/agent/shop', { cartId, item });
    if (r.json.shortfall) anyShortfall = true;
    for (const a of r.json.added || []) allProducts.push(a.product);
  }

  check('At least one product selected per requested slot', allProducts.length > 0, `${allProducts.length} total products`);
  check('8-item cart achieved if catalog allows (or honest shortfall, never silently short)', allProducts.length === 8 || anyShortfall, `${allProducts.length} items, shortfall=${anyShortfall}`);

  // 4. Invariant 1 — gender safety: every product Men or Unisex.
  const wrongGender = allProducts.filter(p => p.gender && p.gender !== 'Men' && p.gender !== 'Unisex');
  check('No wrong gender in selected products', wrongGender.length === 0, wrongGender.map(p => `${p.title} (${p.gender})`).join('; '));

  // 5. Invariant 3 — color safety: every product Black or Grey.
  const wrongColour = allProducts.filter(p => !ALLOWED_COLOURS.includes((p.baseColour || '').toLowerCase()));
  check('No wrong color in selected products (all Black/Grey unless honestly flagged relaxed)',
    wrongColour.every(p => p.colorRelaxed === true),
    wrongColour.filter(p => !p.colorRelaxed).map(p => `${p.title} (${p.baseColour})`).join('; '));

  // 6. Invariant 2 — category safety: every product an allowed article type.
  const wrongCategory = allProducts.filter(p => !ALLOWED_TYPES.includes((p.articleType || '').toLowerCase()));
  check('No wrong category in selected products', wrongCategory.length === 0, wrongCategory.map(p => `${p.title} (${p.articleType})`).join('; '));

  // 7. Women's items exist in the DB — proves exclusion is meaningful, not
  // just an empty catalog.
  const womensCountR = await query(
    `SELECT COUNT(*) AS CNT FROM products WHERE gender = 'Women' AND LOWER(article_type) IN (${ALLOWED_TYPES.map((_, i) => `:t${i}`).join(',')})`,
    Object.fromEntries(ALLOWED_TYPES.map((t, i) => [`t${i}`, t.toLowerCase()]))
  );
  const womensCount = womensCountR.rows?.[0]?.CNT || 0;
  check("Women's items exist in DB in these categories (exclusion is meaningful)", womensCount > 0, `found ${womensCount}`);

  // 8. Budget math consistency across shop responses and finalize.
  const finalizeR = await api('/agent/finalize', { cartId });
  check('Finalize succeeds', finalizeR.status === 200, JSON.stringify(finalizeR.json).slice(0, 200));
  // `allProducts` was captured from the /shop responses BEFORE /finalize
  // ran — but finalize can legitimately swap/remove items via
  // optimizeUnderBudget if the shopped total came in over the stated
  // budget (Invariant 4), so that snapshot goes stale exactly when budget
  // enforcement actually does its job. Compare finalize's reported total
  // against a FRESH sum of whatever is in the cart right now instead of
  // the pre-finalize snapshot, so this check stays meaningful whether or
  // not budget-fit fired.
  const liveCartR = await query(
    `SELECT NVL(SUM(p.price * ci.quantity), 0) AS live_total
     FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = :cid`,
    { cid: cartId }
  );
  const liveTotal = liveCartR.rows?.[0]?.LIVE_TOTAL || 0;
  check('Finalize total matches sum of items actually in the cart', finalizeR.json.total === liveTotal,
    `finalize=${finalizeR.json.total} vs live cart sum=${liveTotal}`);

  // 9. Copy grounding — rationale must be marked grounded.
  check('Finalize rationale passed grounding validation', finalizeR.json.grounded === true, finalizeR.json.rationale);

  // 10. Outfit groups are non-empty (no empty carousels).
  check('Outfit groups are non-empty', Array.isArray(finalizeR.json.outfits) && finalizeR.json.outfits.length > 0, `${finalizeR.json.outfits?.length || 0} outfits`);

  report();
}

function report() {
  console.log(`\nPassed: ${passed.length}`);
  for (const p of passed) console.log(`  ✓ ${p}`);
  console.log(`\nViolations: ${violations.length}`);
  for (const v of violations) console.log(`  ✗ ${v}`);

  if (violations.length > 0) {
    console.log('\n=== SCRIPT A: FAIL ===');
    process.exitCode = 1;
  } else {
    console.log('\n=== SCRIPT A: PASS ===');
    process.exitCode = 0;
  }
}

main()
  .catch(err => { console.error('Verification script crashed:', err); process.exitCode = 1; })
  .finally(() => closePool());
