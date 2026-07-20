/**
 * Page 55 / Page 61 testing requirement — proves the Council's feedback
 * interpreter handles blunt, attribute-less objections ("this isn't nice
 * enough") as reliably as clean ones ("too bright, something darker").
 * Runs the actual classifier and, if a backend is reachable, the real
 * wedding reject-slot pipeline end-to-end. Exits nonzero on any violation.
 *
 * Usage: node src/scripts/verify_council_robustness.js
 */
require('dotenv').config();
const { classifyObjection } = require('../services/mission_config');
const { query, closePool } = require('../db');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:5000/api';

const BLUNT_FIXTURES = [
  "this isn't nice enough",
  "yeh accha nahi lag raha",
  "too plain for what we're spending on her",
  "log kya kahenge in this",
  "bride shouldn't look cheaper than the sister-in-law",
];

const CLEAN_FIXTURES = [
  "too bright, something darker",
  "make it navy blue instead",
];

const violations = [];
const passed = [];
function check(label, condition, detail) {
  if (condition) passed.push(label);
  else violations.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log('=== Council Robustness Verification (Page 55) ===\n');

  // 1. Unit-level: classifyObjection must recognize every blunt fixture as
  // a quality objection, and must NOT misfire on clean color complaints.
  for (const fixture of BLUNT_FIXTURES) {
    const { isQuality } = classifyObjection(fixture);
    check(`Blunt objection classified as quality: "${fixture}"`, isQuality === true);
  }
  for (const fixture of CLEAN_FIXTURES) {
    const { isQuality } = classifyObjection(fixture);
    check(`Clean color objection NOT misclassified as quality: "${fixture}"`, isQuality === false);
  }

  // 2. End-to-end: create a small wedding mission, orchestrate it, then
  // reject a slot with a blunt reason and confirm a valid, non-crashing
  // re-solve happens (never "AI recommends an alternate" language either).
  let token;
  try {
    let r = await api('/auth/register', { name: 'Council Verifier', email: 'verify_council@styleos.test', password: 'VerifyC1234!' });
    if (!r.json.token) r = await api('/auth/login', { email: 'verify_council@styleos.test', password: 'VerifyC1234!' });
    token = r.json.token;
  } catch (e) {
    console.error('Could not reach backend — skipping end-to-end checks:', e.message);
    report();
    return;
  }

  const create = await api('/mission/wedding/create', {
    community: 'Punjabi', city: 'Delhi', totalBudget: 60000,
    events: [{ name: 'Wedding' }],
    members: [{ name: 'Bride', gender: 'Women', roleWeight: 3, ageBracket: 'adult' }],
  }, token);
  const missionId = create.json?.mission?.id;
  check('Wedding mission created', !!missionId, JSON.stringify(create.json));
  if (!missionId) { report(); return; }

  const eventId = create.json.events[0].id;
  const memberId = create.json.members[0].id;

  const orch = await api(`/mission/wedding/${missionId}/orchestrate`, {}, token);
  check('Orchestration started', orch.status === 200, JSON.stringify(orch.json));

  // Give the fire-and-forget orchestration loop time to fill the one slot.
  await new Promise(res => setTimeout(res, 3000));

  for (const fixture of BLUNT_FIXTURES.slice(0, 3)) {
    const reject = await api(`/mission/wedding/${missionId}/reject-slot`, { eventId, memberId, reason: fixture }, token);
    check(`Reject-slot with blunt reason succeeds: "${fixture}"`, reject.status === 200, JSON.stringify(reject.json));
    check(`Reject-slot returns a numeric changed count: "${fixture}"`, typeof reject.json?.changed === 'number', JSON.stringify(reject.json));
  }

  // 3. Confirm the resulting note language never uses "recommend"/"alternate"
  // framing (Page 30A), even for the new objection class.
  const slotsRes = await query(
    `SELECT relaxation_note FROM mission_slots WHERE mission_id = :mid`,
    { mid: missionId }
  );
  const badLanguage = (slotsRes.rows || [])
    .map(r => r.RELAXATION_NOTE)
    .filter(note => note && /\brecommend|alternate\b/i.test(note));
  check('No "recommend"/"alternate" language in relaxation notes', badLanguage.length === 0, badLanguage.join('; '));

  report();
}

function report() {
  console.log(`Passed: ${passed.length}`);
  for (const p of passed) console.log(`  ✓ ${p}`);
  console.log(`\nViolations: ${violations.length}`);
  for (const v of violations) console.log(`  ✗ ${v}`);
  console.log(violations.length > 0 ? '\n=== COUNCIL ROBUSTNESS: FAIL ===' : '\n=== COUNCIL ROBUSTNESS: PASS ===');
  process.exitCode = violations.length > 0 ? 1 : 0;
}

main()
  .catch(err => { console.error('Verification script crashed:', err); process.exitCode = 1; })
  .finally(() => closePool());
