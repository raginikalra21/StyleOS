/**
 * Deterministic parser and refinement fallback — keeps the primary demo
 * scripts (and reasonable freeform goals) working even if Ollama is down
 * or MOCK_LLM=true. Mirrors the shapes parseGoal()/refineCart() return
 * from the LLM path so callers never need to branch on which produced it.
 */
const { normalizeColor, COLOUR_NORM } = require('./catalog_filter');
const { mapArticleType } = require('./type_map');
const { classifyObjection } = require('./mission_config');

const CITY_LIST = [
  'Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad',
  'Pune', 'Jaipur', 'Lucknow', 'Chandigarh', 'Ahmedabad', 'Noida', 'Gurgaon', 'Gurugram',
];

// Order matters — this is also the priority order assigned to items when
// several are matched, so it should match Script A's expected 1-2-3-4.
const GARMENT_TYPES = [
  { type: 'oversized tee', re: /(\d+)?\s*(?:oversized\s+)?(?:tees?|t-?shirts?)\b/i },
  { type: 'cargo pants', re: /(\d+)?\s*cargos?\b/i },
  { type: 'jeans', re: /(\d+)?\s*jeans?\b/i },
  { type: 'hoodie', re: /(\d+)?\s*(?:hoodies?|sweatshirts?)\b/i },
  { type: 'joggers', re: /(\d+)?\s*joggers?\b/i },
  { type: 'jacket', re: /(\d+)?\s*jackets?\b/i },
  // Leading \b before the optional formal/casual prefix matters: without it
  // this pattern happily matches the "shirts" tail inside "tshirts" or
  // "sweatshirts" (found live by evals/run.js — clean_gym and
  // adversarial_no_currency_no_keyword both produced a phantom extra
  // "shirt" item from "tshirts" alone).
  { type: 'shirt', re: /(\d+)?\s*\b(?:formal\s+|casual\s+)?shirts?\b/i },
  { type: 'kurta', re: /(\d+)?\s*kurtas?\b/i },
  { type: 'sherwani', re: /(\d+)?\s*sherwanis?\b/i },
  { type: 'saree', re: /(\d+)?\s*sarees?\b/i },
  { type: 'lehenga', re: /(\d+)?\s*lehengas?\b/i },
  { type: 'dress', re: /(\d+)?\s*dress(?:es)?\b/i },
  { type: 'shoes', re: /(\d+)?\s*(?:shoes|sneakers|footwear)\b/i },
];

const BUDGET_WEIGHT = {
  'oversized tee': 1, jeans: 2.2, 'cargo pants': 1.8, hoodie: 1.8, joggers: 1.5,
  jacket: 2.5, shirt: 1.3, kurta: 2, sherwani: 4, saree: 4, lehenga: 5, dress: 2, shoes: 2.2,
};

function extractItems(text) {
  const items = [];
  let priority = 1;
  for (const g of GARMENT_TYPES) {
    const m = text.match(g.re);
    if (!m) continue;
    let qty = m[1] ? parseInt(m[1], 10) : null;
    if (qty === null) {
      // The digit is often separated from the garment noun by a colour or
      // fit adjective ("2 white shirts", "2 BLACK HOODIES") rather than
      // sitting right next to it, so the pattern's own optional digit group
      // never captures it (found live by evals/run.js on exactly these
      // phrasings). Look back up to 3 words from the match for a standalone
      // number before defaulting to 1.
      const before = text.slice(0, m.index).trim().split(/\s+/).slice(-3);
      const numWord = [...before].reverse().find(w => /^\d+$/.test(w));
      qty = numWord ? parseInt(numWord, 10) : 1;
    }
    items.push({ type: g.type, quantity: qty, priority: priority++ });
  }
  return items;
}

function extractBudget(text) {
  let m = text.match(/(?:budget(?:\s+is)?|around|approx(?:imately)?|under|for|within)\s*(?:rs\.?|₹|inr)?\s*([\d,]+)\s*(k\b)?/i);
  if (!m) m = text.match(/(?:rs\.?|₹|inr)\s*([\d,]+)\s*(k\b)?/i);
  if (!m) return null;
  let n = parseInt(m[1].replace(/,/g, ''), 10);
  if (m[2]) n *= 1000;
  return n;
}

function extractColors(text) {
  const found = [];
  for (const w of Object.keys(COLOUR_NORM)) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) found.push(normalizeColor(w));
  }
  return [...new Set(found)];
}

function extractColorMode(text, colors) {
  if (colors.length === 0) return 'preference';
  if (/\bonly\b/i.test(text)) return 'strict';
  if (/\bprefer(red)?\b|\bmostly\b|\bideally\b/i.test(text)) return 'preference';
  return 'strict';
}

function extractAvoidTerms(text) {
  const avoid = [];
  if (/\bno\s+logos?\b|\bwithout\s+logos?\b/i.test(text)) avoid.push('logo');
  if (/\bno\s+slim\s*fit\b/i.test(text)) avoid.push('slim fit');
  if (/\bno\s+prints?\b/i.test(text)) avoid.push('print');
  if (/\bno\s+ripped\b|\bno\s+distress(ed)?\b/i.test(text)) avoid.push('ripped');
  return avoid;
}

function extractCity(text) {
  for (const c of CITY_LIST) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
      if (c === 'Bengaluru') return 'Bangalore';
      if (c === 'Gurugram') return 'Gurgaon';
      return c;
    }
  }
  return null;
}

function extractLifeStage(text) {
  if (/\bcollege\b/i.test(text)) return 'starting college';
  if (/\bwedding\b/i.test(text)) return 'attending a wedding';
  if (/\b(new\s+job|first\s+job|joining\s+work)\b/i.test(text)) return 'starting a new job';
  return null;
}

function extractLiving(text) {
  if (/\bhostel\b/i.test(text)) return 'hostel';
  if (/\bpg\b/i.test(text)) return 'PG';
  return null;
}

function extractDeadline(text) {
  const now = new Date();
  if (/\bnext\s+month\b/i.test(text)) {
    return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10);
  }
  if (/\bnext\s+week\b/i.test(text)) {
    return new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Script B/C and other occasion goals often name zero literal garments
 * ("wedding to attend", "5 outfits under Rs 3,000") — the regex item scan
 * above will correctly find nothing. Rather than return an empty plan,
 * pick a sensible, gender-appropriate, budget-safe starter set. Requires
 * gender already resolved (the caller must clarify before reaching here)
 * so ethnic-wear choices are never guessed.
 */
function defaultItemsForOccasion(text, gender) {
  const isWedding = /\bwedding\b/i.test(text);

  if (isWedding) {
    if (gender === 'Men') return [{ type: 'kurta', quantity: 1, priority: 1 }, { type: 'jeans', quantity: 1, priority: 2 }];
    if (gender === 'Women') return [{ type: 'kurta', quantity: 1, priority: 1 }];
    return [];
  }

  // Impossible-budget / generic "outfits" honesty script, or any other
  // goal with no recognizable garment words — build the strongest small
  // starter set rather than an empty or invented-category plan.
  return [{ type: 'oversized tee', quantity: 2, priority: 1 }, { type: 'jeans', quantity: 1, priority: 2 }];
}

function distributeBudget(items, totalBudget) {
  const weights = items.map(it => (BUDGET_WEIGHT[it.type] || 1.5) * it.quantity);
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  return items.map((it, i) => {
    const slotTotal = Math.round((totalBudget * weights[i]) / sumW);
    const unitBudget = Math.max(300, Math.round(slotTotal / it.quantity));
    return { ...it, unitBudget };
  });
}

function pluralize(word, qty) {
  if (qty <= 1) return word;
  if (/s$/i.test(word)) return word; // already plural-looking ("jeans", "cargo pants")
  return `${word}s`;
}

function buildSummary(items, gender, totalBudget) {
  const typeList = items.map(i => `${i.quantity} ${pluralize(i.type, i.quantity)}`).join(', ');
  const who = gender === 'Men' ? "men's" : gender === 'Women' ? "women's" : '';
  return `Building a ${who} wardrobe with ${typeList} within ₹${totalBudget.toLocaleString('en-IN')}.`.replace('  ', ' ');
}

/**
 * Deterministic stand-in for parseGoal(). `gender` must already be
 * resolved by the caller (constraints.js) — this function never guesses it.
 */
function parseGoalFallback(goalText, gender) {
  const text = goalText || '';
  let items = extractItems(text);
  const totalBudget = extractBudget(text) || 5000;
  const colors = extractColors(text);
  const colorMode = extractColorMode(text, colors);
  const avoid = extractAvoidTerms(text);
  const lifeStage = extractLifeStage(text);

  if (items.length === 0) items = defaultItemsForOccasion(text, gender);

  const weighted = distributeBudget(items, totalBudget);
  const city = extractCity(text);
  const living = extractLiving(text);
  const deadline = extractDeadline(text);
  const occasion = lifeStage === 'attending a wedding' ? 'Wedding' : 'Casual';

  return {
    gender,
    gender_confidence: gender ? 'explicit' : 'unknown',
    items: weighted.map(it => ({
      type: it.type,
      quantity: it.quantity,
      budget: it.unitBudget,
      occasion,
      colors: colors.map(c => c.toLowerCase()),
      fabric_preference: 'cotton',
      avoid,
      priority: it.priority,
      gender,
    })),
    context: {
      life_stage: lifeStage || '',
      city: city || '',
      season: 'Summer',
      occasion_type: lifeStage === 'attending a wedding' ? 'wedding guest' : (lifeStage === 'starting college' ? 'daily college' : 'general'),
      cultural_notes: '',
      storage_constraints: living === 'hostel' ? 'hostel, limited space' : '',
      laundry_notes: living === 'hostel' ? 'weekly laundry, dark colors preferred' : '',
    },
    deadline,
    total_budget: totalBudget,
    outfit_goal: `${Math.max(weighted.reduce((a, i) => a + i.quantity, 0), 3)}+ mix and match outfits`,
    summary: buildSummary(weighted, gender, totalBudget),
    colorMode,
    _source: 'MOCK_LLM',
  };
}

function matchCartItemsByType(cartItems, typeWord) {
  const canonical = mapArticleType(typeWord);
  const singular = typeWord.replace(/s$/, '');
  return cartItems.filter(i => {
    const at = (i.product.articleType || '').toLowerCase();
    if (canonical && at === canonical.toLowerCase()) return true;
    return new RegExp(singular, 'i').test(i.product.title || '');
  });
}

function matchCartItemsByWord(cartItems, wordPhrase) {
  const w = wordPhrase.replace(/\b(one|a|my|the|expensive|priciest)\b/gi, '').trim();
  const byType = matchCartItemsByType(cartItems, w);
  if (byType.length) return byType;
  return cartItems.filter(i => new RegExp(w, 'i').test(i.product.title || ''));
}

/**
 * Deterministic stand-in for refineCart(). Handles the common delta edits
 * called out in CLAUDE.md Page 19/29. Returns [] when nothing recognizable
 * is found — the caller treats that as "no change needed", never a guess.
 */
function parseRefinementFallback(cartItems, message) {
  const text = message || '';

  // "actually budget is 12k" / "budget is now 12000"
  const budgetMatch = text.match(/budget\s*(?:is|to|of)?\s*(?:rs\.?|₹)?\s*([\d,]+)\s*(k)?/i);
  if (budgetMatch) {
    let n = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    if (budgetMatch[2]) n *= 1000;
    return [{ action: 'budget_change', newBudget: n, reason: `Adjusting the wardrobe to fit ₹${n.toLocaleString('en-IN')}.` }];
  }

  // "make the hoodie grey instead" / "make hoodie black"
  if (/\b(make|change|swap)\b/i.test(text)) {
    for (const g of GARMENT_TYPES) {
      if (!g.re.test(text)) continue;
      const colourWord = Object.keys(COLOUR_NORM).find(c => new RegExp(`\\b${c}\\b`, 'i').test(text));
      if (!colourWord) continue;
      const target = matchCartItemsByType(cartItems, g.type)[0];
      if (target) {
        return [{ cartItemId: target.id, action: 'swap', newColour: normalizeColor(colourWord), reason: `switched to ${normalizeColor(colourWord)} as requested` }];
      }
    }
  }

  // "swap one jeans for joggers"
  const swapMatch = text.match(/swap\s+(?:one\s+|a\s+|my\s+)?([a-z\s]+?)\s+for\s+([a-z\s]+)/i);
  if (swapMatch) {
    const target = matchCartItemsByWord(cartItems, swapMatch[1].trim())[0];
    if (target) {
      return [{ cartItemId: target.id, action: 'swap', newKeyword: swapMatch[2].trim(), reason: `swapped for ${swapMatch[2].trim()} as requested` }];
    }
  }

  // "cheaper cargos"
  const cheaperMatch = text.match(/cheaper\s+([a-z\s]+)/i);
  if (cheaperMatch) {
    const target = matchCartItemsByWord(cartItems, cheaperMatch[1].trim())[0];
    if (target) {
      return [{ cartItemId: target.id, action: 'swap', cheaper: true, reason: 'found a more budget-friendly option' }];
    }
  }

  // "no logos" / "without logos"
  if (/\bno\s+logos?\b|\bwithout\s+logos?\b/i.test(text)) {
    const offenders = cartItems.filter(i => /logo|graphic/i.test(i.product.title || ''));
    if (offenders.length) {
      return offenders.map(item => ({ cartItemId: item.id, action: 'swap', avoidKeyword: 'logo', reason: 'removed the logo print per your request' }));
    }
  }

  // "make it darker"
  if (/\bdarker\b/i.test(text)) {
    const LIGHT = ['white', 'off white', 'beige', 'light blue', 'yellow', 'peach', 'pink', 'cream'];
    const offenders = cartItems.filter(i => LIGHT.includes((i.product.baseColour || '').toLowerCase()));
    if (offenders.length) {
      return offenders.map(item => ({ cartItemId: item.id, action: 'swap', newColour: 'Black', reason: 'moved to a darker shade' }));
    }
  }

  // "remove the expensive tee"
  if (/\bremove\b/i.test(text)) {
    const removeMatch = text.match(/remove\s+(?:the\s+)?(?:expensive\s+|priciest\s+)?([a-z\s]+)/i);
    if (removeMatch) {
      const matches = matchCartItemsByWord(cartItems, removeMatch[1].trim());
      if (matches.length) {
        const target = /expensive|priciest/i.test(text)
          ? matches.reduce((a, b) => (b.product.price > a.product.price ? b : a))
          : matches[0];
        return [{ cartItemId: target.id, action: 'remove', reason: 'removed as requested' }];
      }
    }
  }

  return [];
}

/**
 * Deterministic stand-in for reconcileFeedback() — groups reactions by cart
 * item and turns each into an action without an LLM round-trip. Mirrors
 * the same three-way read as the LLM prompt: a plain skip/veto removes,
 * an explicit color complaint swaps color, and a quality/prestige
 * complaint (Page 55 — "not nice enough", no attribute given) upgrades
 * instead of guessing a color change.
 */
function reconcileFeedbackFallback(cartItems, reactions) {
  const byItem = new Map();
  for (const r of reactions) {
    const key = r.cartItemId;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(r);
  }

  const actions = [];
  for (const [cartItemId, itemReactions] of byItem.entries()) {
    const hasSkip = itemReactions.some(r => r.type === 'skip');
    const commentText = itemReactions
      .filter(r => (r.type === 'comment' || r.type === 'voice') && r.content)
      .map(r => r.content)
      .join(' . ');

    if (!commentText) {
      if (hasSkip) actions.push({ cartItemId, action: 'remove', reason: 'family skipped this item' });
      continue;
    }

    const { isQuality } = classifyObjection(commentText);
    const colourWord = Object.keys(COLOUR_NORM).find(c => new RegExp(`\\b${c}\\b`, 'i').test(commentText));

    if (colourWord) {
      actions.push({ cartItemId, action: 'swap_color', reason: `requested ${normalizeColor(colourWord)} instead`, colorPreference: normalizeColor(colourWord) });
    } else if (isQuality) {
      actions.push({ cartItemId, action: 'swap_upgrade', reason: 'moved to a higher-rated option within budget' });
    } else if (hasSkip) {
      actions.push({ cartItemId, action: 'remove', reason: 'family skipped this item' });
    } else {
      actions.push({ cartItemId, action: 'keep', reason: 'no clear change requested' });
    }
  }

  return actions;
}

module.exports = { parseGoalFallback, parseRefinementFallback, reconcileFeedbackFallback, extractItems, extractBudget, extractColors, extractColorMode };
