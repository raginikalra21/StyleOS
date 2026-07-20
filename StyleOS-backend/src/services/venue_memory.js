/**
 * Repetition-avoidance memory (CLAUDE Part 2, Page 56) — "three people
 * wore the same top to the fest." Logs what's shipped to a venue at
 * approval time, and down-ranks (never hard-excludes) a product that's
 * shipped there too often recently — same honesty principle as weather
 * and campus trend scoring: a thin catalog slice must never turn into a
 * false shortfall just because the popular option was already logged.
 *
 * venue_key is city-level for this build (no separate college-name field
 * exists yet in the constraint object) — a reasonable, disclosed
 * simplification, not a claim of finer-grained venue tracking.
 */
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');

const REPETITION_WINDOW_DAYS = 14;
const REPETITION_THRESHOLD = 3; // "3+ times in 14 days" per the spec's demo-scale default

function normalizeVenueKey(venueKey) {
  return (venueKey || '').trim().toLowerCase();
}

/**
 * Writes one shipment row — call at cart-approval time (Page 28's approve
 * path). A logging failure must never fail the approval itself.
 */
async function logShipment(productId, venueKey, missionType) {
  const key = normalizeVenueKey(venueKey);
  if (!productId || !key) return;
  try {
    await query(
      `INSERT INTO venue_shipment_log (id, product_id, venue_key, mission_type) VALUES (:id, :pid, :vk, :mt)`,
      { id: uuidv4(), pid: productId, vk: key, mt: missionType || null }
    );
  } catch (err) {
    console.log('logShipment failed (non-fatal):', err.message?.slice(0, 80));
  }
}

/**
 * Returns { productId: count } for how many times each product has shipped
 * to this venue in the recent window. Never throws — an empty object means
 * "skip repetition scoring," not "nothing has ever shipped here."
 */
async function getRepetitionCounts(venueKey, productIds) {
  const key = normalizeVenueKey(venueKey);
  if (!key || !productIds?.length) return {};
  try {
    const binds = { vk: key };
    const placeholders = productIds.map((id, i) => { binds[`p${i}`] = id; return `:p${i}`; });
    const r = await query(
      `SELECT product_id, COUNT(*) AS cnt FROM venue_shipment_log
       WHERE venue_key = :vk AND product_id IN (${placeholders.join(', ')})
       AND shipped_at >= SYSTIMESTAMP - NUMTODSINTERVAL(${REPETITION_WINDOW_DAYS}, 'DAY')
       GROUP BY product_id`,
      binds
    );
    const counts = {};
    for (const row of r.rows || []) counts[row.PRODUCT_ID] = row.CNT;
    return counts;
  } catch (err) {
    console.log('getRepetitionCounts failed (non-fatal):', err.message?.slice(0, 80));
    return {};
  }
}

/**
 * Re-orders candidates so heavily-repeated items sort later — a down-rank,
 * never a removal. Candidates below the repetition threshold are
 * untouched; the ones at/above it lose ranking priority proportionally to
 * how often they've shipped, but stay in the list.
 */
async function venueAdjustCandidates(candidates, venueKey) {
  if (!venueKey || !candidates?.length) return candidates;
  const ids = candidates.map(c => c.ID || c.id).filter(Boolean);
  const counts = await getRepetitionCounts(venueKey, ids);
  if (Object.keys(counts).length === 0) return candidates;

  const penaltyOf = (row) => {
    const count = counts[row.ID || row.id] || 0;
    if (count < REPETITION_THRESHOLD) return 0;
    return Math.min(count - REPETITION_THRESHOLD + 1, 5); // higher = more repeated = ranked later
  };

  return [...candidates]
    .map((row, i) => ({ row, i, penalty: penaltyOf(row) }))
    .sort((a, b) => (a.penalty - b.penalty) || (a.i - b.i)) // stable: original order breaks ties
    .map(x => x.row);
}

module.exports = { logShipment, getRepetitionCounts, venueAdjustCandidates, REPETITION_THRESHOLD, REPETITION_WINDOW_DAYS };
