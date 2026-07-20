/**
 * The convergence engine (CLAUDE Part 3, Section 3.1) — answers the
 * mentor's sharpest question: "How do you handle the infinite loop for
 * the rejections and re-addition?"
 *
 * Three guarantees, in order:
 *   1. A rejected product NEVER reappears for that slot (tabu list).
 *   2. Every rejection provably SHRINKS the search space for that slot
 *      (learned constraints) — a shrinking search space cannot loop
 *      forever, it converges or empties.
 *   3. If two people's learned constraints for the same slot become
 *      mutually unsatisfiable, that's detected BEFORE searching and
 *      handed back to humans as an explicit choice — never silently
 *      retried forever.
 *
 * All state is derived by replaying `slot_rejections`, never mutated
 * in place — so there is nothing to go stale or desync across concurrent
 * requests. The table is the single source of truth.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');

const MAX_REJECTIONS_PER_SLOT = 5;
const MAX_REJECTIONS_PER_CART = 20;
const MAX_RESOLVE_CALLS_PER_MINUTE = 10;

// ── Reason classification — deterministic, no LLM round-trip needed for ──
// the common taps (Section 5.4.1: reason chips map directly, no model call
// on that path at all). Free-text ("say why") still needs interpretation,
// but that's handled by the caller before recordRejection — this function
// classifies whatever text it's given, tap-label or free-text alike.
const PRICE_SIGNALS = /too\s+expensive|too\s+pricey|can'?t\s+afford|over\s*budget|costly/i;
const COLOUR_SIGNALS = /wrong\s+colou?r|colou?r/i;
const QUALITY_SIGNALS = /not\s+(nice|good|special|classy|elegant|premium|fancy)\s+enough|isn'?t\s+(nice|good|special)\s+enough|too\s+(plain|simple|basic|ordinary)|looks?\s+cheap|not\s+worth|not\s+special|log\s+kya\s+kahenge|accha\s+nahi|theek\s+nahi/i;
const STYLE_SIGNALS = /not\s+her\s+style|not\s+his\s+style|wrong\s+style|doesn'?t\s+suit|not\s+my\s+style/i;
const FIT_SIGNALS = /doesn'?t\s+fit|too\s+(tight|loose|big|small)|wrong\s+size/i;

function classifyRejectionReason(reasonText) {
  const r = (reasonText || '').toLowerCase().trim();
  if (!r) return 'unspecified';
  if (PRICE_SIGNALS.test(r)) return 'price';
  if (QUALITY_SIGNALS.test(r)) return 'quality';
  if (FIT_SIGNALS.test(r)) return 'fit';
  if (STYLE_SIGNALS.test(r)) return 'style';
  if (COLOUR_SIGNALS.test(r)) return 'color';
  return 'unspecified';
}

/**
 * Records a rejection — this is the crash-safe write that must happen
 * BEFORE any re-solve search runs (Section 3.1.5), so a mid-request crash
 * never loses the tabu entry.
 */
async function recordRejection({ slotKey, cartId, missionId, productId, productPrice, productColour, rejectedBy, rejectedByName, reasonText }) {
  const reasonClass = classifyRejectionReason(reasonText);
  const id = uuidv4();
  await query(
    `INSERT INTO slot_rejections
       (id, cart_id, mission_id, slot_key, product_id, product_price, product_colour, rejected_by, rejected_by_name, reason_text, reason_class)
     VALUES (:id, :cid, :mid, :sk, :pid, :price, :colour, :rejBy, :rejByName, :reason, :rclass)`,
    {
      id, cid: cartId || null, mid: missionId || null, sk: slotKey,
      pid: productId, price: productPrice || null, colour: productColour || null,
      rejBy: rejectedBy || null, rejByName: rejectedByName || null,
      reason: (reasonText || '').slice(0, 500), rclass: reasonClass,
    }
  );
  return { id, reasonClass };
}

async function getRejectionsForSlot(slotKey) {
  const r = await query(
    `SELECT * FROM slot_rejections WHERE slot_key = :sk ORDER BY rejected_at ASC`,
    { sk: slotKey }
  );
  return r.rows || [];
}

async function getTabuProductIds(slotKey) {
  const rows = await getRejectionsForSlot(slotKey);
  return [...new Set(rows.map(r => r.PRODUCT_ID))];
}

async function countRejectionsForCartOrMission(cartId, missionId) {
  const col = missionId ? 'mission_id' : 'cart_id';
  const val = missionId || cartId;
  const r = await query(`SELECT COUNT(*) AS cnt FROM slot_rejections WHERE ${col} = :val`, { val });
  return r.rows?.[0]?.CNT || 0;
}

/**
 * Replays every rejection for a slot into a single accumulated learned-
 * constraint object (Section 3.1.2). Deterministic, derived fresh each
 * time — never stored, so there's nothing to desync. Tracks WHO set each
 * bound, so a deadlock message can name names (Section 3.1.4).
 */
function learnFromRejections(rejections) {
  const constraints = {
    tabuProductIds: [],
    maxPrice: null, maxPriceSetBy: null, maxPriceSetByName: null,
    minPrice: null, minPriceSetBy: null, minPriceSetByName: null,
    preferPremium: false,
    avoidColours: [],
    avoidStyleTags: [],
  };

  for (const rej of rejections) {
    constraints.tabuProductIds.push(rej.PRODUCT_ID);
    const price = rej.PRODUCT_PRICE;
    switch (rej.REASON_CLASS) {
      case 'price':
        // "too expensive" — cap this slot below what was just rejected.
        if (price) {
          const cap = Math.round(price * 0.9);
          if (constraints.maxPrice === null || cap < constraints.maxPrice) {
            constraints.maxPrice = cap;
            constraints.maxPriceSetBy = rej.REJECTED_BY;
            constraints.maxPriceSetByName = rej.REJECTED_BY_NAME;
          }
        }
        break;
      case 'quality':
        // "not nice enough" — raise the floor, never lower it.
        if (price) {
          const floor = Math.round(price * 1.1);
          if (constraints.minPrice === null || floor > constraints.minPrice) {
            constraints.minPrice = floor;
            constraints.minPriceSetBy = rej.REJECTED_BY;
            constraints.minPriceSetByName = rej.REJECTED_BY_NAME;
          }
        }
        constraints.preferPremium = true;
        break;
      case 'color':
        if (rej.PRODUCT_COLOUR) constraints.avoidColours.push(rej.PRODUCT_COLOUR);
        break;
      case 'style':
        // Style tags aren't tracked per-product in this catalog; the tabu
        // exclusion of the specific rejected item still applies.
        break;
      case 'fit':
        // Fit is size-level, not product-level — tabu the item, no slot-wide tightening.
        break;
      case 'unspecified':
        // No signal — tabu only, never guess a tightening (Section 3.1.2).
        break;
    }
  }

  constraints.tabuProductIds = [...new Set(constraints.tabuProductIds)];
  constraints.avoidColours = [...new Set(constraints.avoidColours)];
  return constraints;
}

async function getLearnedConstraintsForSlot(slotKey) {
  const rejections = await getRejectionsForSlot(slotKey);
  return { rejections, constraints: learnFromRejections(rejections) };
}

/**
 * Deadlock detection (Section 3.1.4) — a slot's own accumulated learned
 * constraints becoming mutually unsatisfiable (e.g. Mom's "too expensive"
 * capped it below Sister's "not nice enough" floor). Checked BEFORE
 * searching, not discovered by a failed search.
 */
function detectConflict(constraints) {
  if (constraints.minPrice != null && constraints.maxPrice != null && constraints.minPrice > constraints.maxPrice) {
    return {
      type: 'price_deadlock',
      minPrice: constraints.minPrice, minPriceSetBy: constraints.minPriceSetBy, minPriceSetByName: constraints.minPriceSetByName,
      maxPrice: constraints.maxPrice, maxPriceSetBy: constraints.maxPriceSetBy, maxPriceSetByName: constraints.maxPriceSetByName,
    };
  }
  return null;
}

/**
 * The escalation ladder (Section 3.1.3). Attempt 1-2 use the learned
 * constraints as hard bounds; attempt 3 widens soft constraints (palette);
 * attempt 4 stretches budget; attempt 5+ stops and reports rather than
 * searching again — a shrinking-then-exhausted search space terminates,
 * it does not loop.
 */
function getEscalationLevel(rejectionCount) {
  if (rejectionCount <= 1) return 1;
  if (rejectionCount === 2) return 2;
  if (rejectionCount === 3) return 3;
  if (rejectionCount === 4) return 4;
  return 5; // stop — escalate to human
}

/**
 * Global loop guards (Section 3.1.5) — checked before any re-solve.
 */
async function checkLoopGuards({ cartId, missionId, slotKey }) {
  const slotRejections = await getRejectionsForSlot(slotKey);
  if (slotRejections.length >= MAX_REJECTIONS_PER_SLOT) {
    return { blocked: true, reason: 'slot_exhausted', rejectionCount: slotRejections.length };
  }
  const cartOrMissionCount = await countRejectionsForCartOrMission(cartId, missionId);
  if (cartOrMissionCount >= MAX_REJECTIONS_PER_CART) {
    return { blocked: true, reason: 'cart_exhausted', rejectionCount: cartOrMissionCount };
  }
  return { blocked: false };
}

// In-memory rate guard — resets naturally as the window slides. Per
// hackathon-demo scale this is sufficient; a real deployment would move
// this to a shared store, but the guard's PURPOSE (stop a runaway loop
// from hammering the DB/catalog) doesn't need distributed state to prove.
const resolveCallLog = new Map(); // key -> [timestamps]
function checkRateGuard(key) {
  const now = Date.now();
  const windowStart = now - 60000;
  const calls = (resolveCallLog.get(key) || []).filter(t => t > windowStart);
  calls.push(now);
  resolveCallLog.set(key, calls);
  return calls.length <= MAX_RESOLVE_CALLS_PER_MINUTE;
}

module.exports = {
  classifyRejectionReason,
  recordRejection,
  getRejectionsForSlot,
  getTabuProductIds,
  countRejectionsForCartOrMission,
  learnFromRejections,
  getLearnedConstraintsForSlot,
  detectConflict,
  getEscalationLevel,
  checkLoopGuards,
  checkRateGuard,
  MAX_REJECTIONS_PER_SLOT,
  MAX_REJECTIONS_PER_CART,
};
