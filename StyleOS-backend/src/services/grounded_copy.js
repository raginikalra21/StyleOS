/**
 * Grounded stylist copy — generation and validation. Per CLAUDE.md Page 25,
 * Invariant 5: stylist copy may only mention selected items and selected
 * item metadata. Never let the LLM's prose become an unverified second
 * source of truth about what's actually in the cart.
 */

const COLOR_WORDS = [
  'black', 'grey', 'gray', 'charcoal', 'navy', 'blue', 'white', 'off white', 'cream',
  'red', 'maroon', 'burgundy', 'wine', 'mustard', 'green', 'olive', 'khaki', 'pink',
  'purple', 'orange', 'peach', 'brown', 'beige', 'tan', 'gold', 'silver', 'multi', 'yellow',
];

const CATEGORY_WORDS = [
  'tshirt', 't-shirt', 'tee', 'jeans', 'trousers', 'cargo', 'joggers', 'hoodie', 'sweatshirt',
  'jacket', 'shirt', 'kurta', 'sherwani', 'saree', 'lehenga', 'dress', 'shoes', 'sneakers',
  'sandals', 'backpack', 'bag', 'shorts', 'top',
];

function wordsPresentIn(text, dictionary) {
  const lc = text.toLowerCase();
  return dictionary.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(lc));
}

/**
 * Builds the allow-lists copy is permitted to reference, derived only from
 * the actually-selected items — never the whole catalog.
 */
function allowedGroundingWords(cartItems) {
  const colors = new Set();
  const categories = new Set();
  for (const item of cartItems) {
    const p = item.product || {};
    if (p.baseColour) {
      for (const w of wordsPresentIn(p.baseColour, COLOR_WORDS)) colors.add(w);
    }
    if (p.articleType) {
      for (const w of wordsPresentIn(p.articleType, CATEGORY_WORDS)) categories.add(w);
    }
    if (p.title) {
      for (const w of wordsPresentIn(p.title, [...COLOR_WORDS, ...CATEGORY_WORDS])) {
        if (COLOR_WORDS.includes(w)) colors.add(w); else categories.add(w);
      }
    }
  }
  return { colors, categories };
}

/**
 * Scans generated copy for color/category words that aren't backed by any
 * actually-selected item. Returns { valid, violations }.
 */
function validateGroundedCopy(copyText, cartItems) {
  const { colors, categories } = allowedGroundingWords(cartItems);
  const mentionedColors = wordsPresentIn(copyText, COLOR_WORDS);
  const mentionedCategories = wordsPresentIn(copyText, CATEGORY_WORDS);

  const violations = [
    ...mentionedColors.filter(w => !colors.has(w)),
    ...mentionedCategories.filter(w => !categories.has(w)),
  ];

  return { valid: violations.length === 0, violations };
}

/**
 * Deterministic, always-safe copy — used as the MOCK_LLM path and as the
 * final fallback if the LLM's copy fails grounding validation twice.
 */
function deterministicCopy(cartItems, goalText, shortfalls = []) {
  if (!cartItems || cartItems.length === 0) {
    return "I couldn't find strict matches for this one yet — let's adjust the brief and try again.";
  }

  const byType = {};
  for (const item of cartItems) {
    const p = item.product || {};
    const type = (p.articleType || 'item').toLowerCase();
    if (!byType[type]) byType[type] = [];
    byType[type].push(p);
  }

  const named = cartItems.slice(0, 2).map(i => {
    const p = i.product || {};
    return `the ${p.baseColour || ''} ${p.title || p.articleType || 'piece'}`.replace(/\s+/g, ' ').trim();
  });

  const typeList = Object.entries(byType).map(([type, items]) => `${items.length} ${type}`).join(', ');

  let text = `I put together ${cartItems.length} pieces — ${typeList} — grounded in exactly what you asked for. `;
  if (named.length) text += `${named.join(' and ')} anchor most of the mix-and-match outfits. `;

  if (shortfalls.length > 0) {
    text += `One thing to flag: ${shortfalls.map(s => s.message || s).join('; ')}.`;
  } else {
    text += `Everything here fits the budget and the constraints you gave me.`;
  }

  return text.trim();
}

/**
 * Wraps an LLM-produced copy string: validates it against the selected
 * items, and falls back to deterministic copy if it references anything
 * ungrounded. Callers should use this instead of trusting raw LLM copy.
 */
function groundOrFallback(llmCopyText, cartItems, goalText, shortfalls = []) {
  if (!llmCopyText) return { text: deterministicCopy(cartItems, goalText, shortfalls), grounded: true, source: 'deterministic' };
  const result = validateGroundedCopy(llmCopyText, cartItems);
  if (result.valid) return { text: llmCopyText, grounded: true, source: 'llm' };
  return { text: deterministicCopy(cartItems, goalText, shortfalls), grounded: true, source: 'deterministic_after_violation', violations: result.violations };
}

module.exports = { validateGroundedCopy, deterministicCopy, groundOrFallback, allowedGroundingWords };
