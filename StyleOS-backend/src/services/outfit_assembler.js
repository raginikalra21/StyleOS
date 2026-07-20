/**
 * Outfit assembly — groups selected cart items into named outfit
 * combinations. Per CLAUDE.md Page 24: the output is a wardrobe, not a
 * flat list, and every outfit item must be one of the items actually
 * selected — never invented.
 */

const TOP_TYPES = new Set(['tshirts', 'shirts', 'kurtas', 'sherwanis', 'tops']);
const BOTTOM_TYPES = new Set(['jeans', 'trousers', 'shorts']);
const LAYER_TYPES = new Set(['sweatshirts', 'jackets']);
const ONE_PIECE_TYPES = new Set(['sarees', 'lehenga choli', 'dresses']);

const OUTFIT_NAMES = [
  'Everyday Campus', 'Library To Canteen', 'Hostel Evening', "Freshers' Day Minimal",
  'Casual Weekend', 'Easy Errands', 'Clean Basics', 'Mix & Match Staple',
];

function classify(item) {
  const at = (item.product.articleType || '').toLowerCase();
  if (TOP_TYPES.has(at)) return 'top';
  if (BOTTOM_TYPES.has(at)) return 'bottom';
  if (LAYER_TYPES.has(at)) return 'layer';
  if (ONE_PIECE_TYPES.has(at)) return 'one_piece';
  return 'other';
}

// CLAUDE Part 2 / Page 54 — full-outfit coordination. A neutral pairs with
// anything; two different non-neutral "bold" colors clash. Deliberately a
// simple, explainable heuristic rather than a color-theory model — good
// enough to keep a swap from silently pairing maroon with hot pink.
const NEUTRAL_COLOURS = new Set(['black', 'grey', 'charcoal', 'white', 'off white', 'navy blue', 'dark blue', 'beige', 'brown', 'khaki', 'silver']);

function colorsCoordinate(colourA, colourB) {
  const a = (colourA || '').toLowerCase();
  const b = (colourB || '').toLowerCase();
  if (!a || !b) return true; // unknown color — don't block on missing data
  if (a === b) return true;
  if (NEUTRAL_COLOURS.has(a) || NEUTRAL_COLOURS.has(b)) return true;
  return false; // two different non-neutral colors — a mild clash
}

/**
 * Groups cart items into outfit combinations. Reuses items across outfits
 * (the mix-and-match point per Page 24) rather than partitioning them.
 * Every referenced item is guaranteed to be one of the passed-in cartItems.
 */
function buildOutfitGroups(cartItems) {
  const tops = cartItems.filter(i => classify(i) === 'top');
  const bottoms = cartItems.filter(i => classify(i) === 'bottom');
  const layers = cartItems.filter(i => classify(i) === 'layer');
  const onePieces = cartItems.filter(i => classify(i) === 'one_piece');

  const combinations = [];
  const seen = new Set();
  let nameIdx = 0;

  const addCombo = (members) => {
    if (members.length === 0) return;
    const key = members.map(m => m.id).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    combinations.push({
      name: OUTFIT_NAMES[nameIdx % OUTFIT_NAMES.length],
      itemIds: members.map(m => m.id),
      items: members.map(m => ({
        cartItemId: m.id, title: m.product.title, articleType: m.product.articleType, baseColour: m.product.baseColour,
      })),
    });
    nameIdx++;
  };

  // One-piece ethnic wear (saree/lehenga) stands alone as its own outfit,
  // optionally with a layer.
  for (const op of onePieces) {
    addCombo(layers.length ? [op, layers[0]] : [op]);
  }

  // Top + bottom combinations, cycling so every top and bottom appears in
  // at least one outfit rather than only pairing the first of each. Prefers
  // a coordinating bottom for each top (Page 54) — e.g. a swap that lands a
  // maroon tee doesn't get silently paired with a clashing bottom when a
  // neutral one is sitting right there in the same cart — but never leaves
  // a top unpaired just because nothing coordinates; a clashing pair still
  // beats an empty carousel.
  const pairCount = Math.max(tops.length, bottoms.length);
  const usedBottomIds = new Set();
  for (let i = 0; i < pairCount && (tops.length > 0 && bottoms.length > 0); i++) {
    const top = tops[i % tops.length];
    const coordinating = bottoms.filter(b => colorsCoordinate(top.product.baseColour, b.product.baseColour));
    // Prefer a coordinating bottom not already used in another outfit, so
    // clash-avoidance doesn't come at the cost of every outfit reusing the
    // same one "safe" neutral piece — still falls back to reusing one if
    // that's the only coordinating option, and to the plain cycle if
    // nothing coordinates at all (never leaves a top unpaired).
    const bottom = coordinating.find(b => !usedBottomIds.has(b.id)) || coordinating[0] || bottoms[i % bottoms.length];
    usedBottomIds.add(bottom.id);
    addCombo([top, bottom]);
  }

  // A layered evening variant if a hoodie/jacket exists and wasn't already
  // the sole combo driver.
  if (layers.length > 0 && tops.length > 0 && bottoms.length > 0) {
    addCombo([tops[0], bottoms[bottoms.length - 1], layers[0]]);
  }

  // Nothing paired at all (e.g. only one category present) — still show
  // every item so the results are never an empty carousel.
  if (combinations.length === 0) {
    for (const item of cartItems) addCombo([item]);
  }

  return combinations;
}

/**
 * Deterministic stand-in for the LLM's checkOutfitCompatibility() — used
 * as the MOCK_LLM/failure fallback so /finalize never breaks when the
 * LLM path is unavailable.
 */
function deterministicOutfitCompatibility(cartItems) {
  const combinations = buildOutfitGroups(cartItems).map(c => c.items.map(i => i.title));
  return { compatible: true, issues: [], combinations };
}

/**
 * A short, grounded, outfit-scoped copy update for the Product Sheet swap
 * flow (Page 54's UI implication) — e.g. "Swapped in the grey hoodie —
 * updated to pair with the black jeans in Everyday Campus." Only ever
 * names items actually in that specific outfit, never invented. Returns
 * one string per outfit the swapped item belongs to (usually one).
 */
function describeSwapPairing(swappedCartItemId, outfits) {
  const notes = [];
  for (const outfit of outfits) {
    if (!outfit.itemIds.includes(swappedCartItemId)) continue;
    const others = outfit.items.filter(i => i.cartItemId !== swappedCartItemId);
    if (others.length === 0) continue;
    const partnerNames = others.map(o => `the ${o.baseColour || ''} ${o.title}`.replace(/\s+/g, ' ').trim()).join(' and ');
    notes.push(`Updated to pair with ${partnerNames} in "${outfit.name}".`);
  }
  return notes;
}

module.exports = { buildOutfitGroups, deterministicOutfitCompatibility, classify, colorsCoordinate, describeSwapPairing };
