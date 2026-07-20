const router = require('express').Router();
const auth = require('../middleware/auth');
const { Cart, CartItem, Product, Goal, Wardrobe, CollabSession } = require('../models');
const { parseGoal, generateCartRationale, checkOutfitCompatibility, refineCart } = require('../services/llm');
const { semanticSearch } = require('../services/semantic_search');
const { mapArticleType } = require('../services/type_map');
const { resolvePlanGender, resolveClarifiedGender } = require('../services/constraints');
const { normalizeColors } = require('../services/catalog_filter');
const { groundOrFallback } = require('../services/grounded_copy');
const { buildOutfitGroups, describeSwapPairing } = require('../services/outfit_assembler');
const { budgetRemaining, budgetStatus, optimizeUnderBudget } = require('../services/budget');
// Fest-Safe / "Don't Twin" (reframed per mentor note, not cut — kept low
// priority, positioned as catalog diversification rather than suppression).
const { venueAdjustCandidates } = require('../services/venue_memory');
const { ownsCart } = require('../middleware/ownership');
const { query } = require('../db');

// Categories where a customer typically owns just one at a time —
// safe to dedupe against past wardrobes. Deliberately excludes
// replenishables (tees, jeans, socks) which are bought in multiples.
const SINGLE_PURCHASE_TYPES = new Set([
  'jackets', 'kurtas', 'sarees', 'lehenga choli', 'dresses',
  'formal shoes', 'backpacks', 'handbags',
]);

function buildWardrobeContext(ownedItems) {
  if (!ownedItems || ownedItems.length === 0) return '';
  const byWardrobe = {};
  for (const row of ownedItems) {
    const name = row.WARDROBE_NAME || row.wardrobe_name || 'Previous Wardrobe';
    const desc = `${row.BASE_COLOUR || row.base_colour || ''} ${row.ARTICLE_TYPE || row.article_type || ''}`.trim();
    if (!desc) continue;
    if (!byWardrobe[name]) byWardrobe[name] = new Set();
    byWardrobe[name].add(desc);
  }
  return Object.entries(byWardrobe)
    .map(([name, items]) => `- ${name}: ${[...items].join(', ')}`)
    .join('\n');
}

/**
 * Word-diversity floor — catches whitespace-only and low-signal repetitive
 * text ("need clothes " x400) without blocking legitimately short goals
 * ("need 2 tees" has only 2 unique words but isn't garbage).
 */
function hasMinimalContent(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 3) return false;
  const words = trimmed.toLowerCase().match(/[a-zA-Zऀ-ॿ]+/g) || [];
  if (words.length === 0) return false;
  const uniqueWords = new Set(words);
  if (uniqueWords.size < 3 && words.length > 5) return false;
  return true;
}

// A conservative, catalog-grounded floor — cheapest realistic basics in
// this dataset run from roughly this price up. Used only to detect a
// budget that can't possibly work, never to price anything.
const MIN_REALISTIC_UNIT_PRICE = 400;
const FEASIBILITY_TOLERANCE = 0.6; // budget covering <60% of a bare-minimum plan is "impossible", not just tight

function checkBudgetFeasibility(plan) {
  const totalQty = (plan.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const minRealistic = Math.max(totalQty, 1) * MIN_REALISTIC_UNIT_PRICE;
  if (!plan.total_budget || plan.total_budget < minRealistic * FEASIBILITY_TOLERANCE) {
    return { feasible: false, minRealistic, totalQty };
  }
  return { feasible: true, minRealistic, totalQty };
}

/**
 * "Build best under budget" / "reduce count" — trims item quantities
 * (highest-priority items first) until the plan's own bare-minimum cost
 * fits inside the stated budget, rather than silently building something
 * that was never going to fit.
 */
function trimPlanToFitBudget(plan) {
  if (!plan.items?.length) return;
  plan.items.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  while (checkBudgetFeasibility(plan).feasible === false && plan.items.some(i => i.quantity > 1)) {
    const richest = [...plan.items].reverse().find(i => i.quantity > 1);
    if (!richest) break;
    richest.quantity -= 1;
  }
  // Still infeasible even at 1-each — drop the lowest-priority item entirely
  // rather than pretend a budget can cover more categories than it can.
  while (checkBudgetFeasibility(plan).feasible === false && plan.items.length > 1) {
    plan.items.pop();
  }
}

// POST /api/agent/plan
router.post('/plan', auth, async (req, res) => {
  try {
    const { goalText, clarifiedGender, budgetDecision } = req.body;
    if (!goalText) return res.status(400).json({ error: 'goalText required' });

    // Verified live during the audit: whitespace-only and long repetitive
    // garbage text ("need clothes " x400) both made the LLM confidently
    // hallucinate a full, specific-looking plan out of nothing, rather
    // than admitting it had no real signal. A cheap word-diversity check
    // catches both without blocking legitimately short goals.
    if (!hasMinimalContent(goalText)) {
      if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'clarify', message: '🤔 Tell me a bit more about what you need',
      });
      return res.json({
        needsMoreInfo: true,
        message: "I didn't quite catch what you're shopping for — could you tell me a bit more? What items, for who, and roughly what budget?",
        goalText,
      });
    }

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'parsing', message: '🧠 Understanding your goal...'
    });

    const ownedItems = await Wardrobe.findOwnedItems(req.user.id);
    const wardrobeContext = buildWardrobeContext(ownedItems);
    if (wardrobeContext && req.io) {
      req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'memory', message: '🧵 Checking your past wardrobes for continuity...'
      });
    }

    // Gender is the single most important safety gate — resolve it BEFORE
    // parsing, not after. This matters for goals like a wedding brief with
    // no explicit item list: the parser needs to already know the gender
    // to pick appropriate garment types (sherwani/kurta vs lehenga/saree),
    // not guess generic items and have gender stamped on afterward. The
    // LLM's own gender_confidence claim is never trusted — a small local
    // model will say "explicit" even when nothing in the text says so.
    const genderResolution = clarifiedGender
      ? resolveClarifiedGender(clarifiedGender)
      : resolvePlanGender(goalText);

    if (!genderResolution.gender) {
      // Ask BEFORE spending an LLM call — we can't build a safe plan yet.
      if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'clarify', message: '🤔 Who is this wardrobe for?',
      });
      return res.json({
        needsClarification: true,
        question: 'Quick check before I start shopping — who is this wardrobe for?',
        options: ['Men', 'Women'],
        goalText,
      });
    }

    const plan = await parseGoal(goalText, wardrobeContext, genderResolution.gender);
    plan.gender = genderResolution.gender;
    plan.gender_confidence = genderResolution.gender_confidence;
    if (plan.items) {
      plan.items = plan.items.map(item => ({ ...item, gender: plan.gender }));
    }

    // Script C — honesty under an impossible budget (Page 12). Verified
    // live during the audit: "5 outfits under Rs 500" silently built a
    // full 10-item plan with an inflated budget instead of admitting the
    // number doesn't work. Checked here, after items are known but before
    // a cart exists, so nothing gets built on a budget that can't hold it.
    if (!budgetDecision) {
      const feasibility = checkBudgetFeasibility(plan);
      if (!feasibility.feasible) {
        if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
          step: 'clarify', message: '🤔 That budget is tight for what you asked for',
        });
        return res.json({
          needsBudgetDecision: true,
          message: `₹${plan.total_budget.toLocaleString('en-IN')} is tight for ${feasibility.totalQty} pieces — even the most basic options here run closer to ₹${feasibility.minRealistic.toLocaleString('en-IN')} total. I can build the strongest set within your budget, stretch the budget to a realistic minimum, or cut down the count.`,
          options: [
            { action: 'build_best', label: `Build best under ₹${plan.total_budget.toLocaleString('en-IN')}` },
            { action: 'stretch_budget', label: `Stretch to ₹${feasibility.minRealistic.toLocaleString('en-IN')}` },
            { action: 'reduce_count', label: 'Reduce item count' },
          ],
          goalText,
        });
      }
    } else if (budgetDecision === 'stretch_budget') {
      const feasibility = checkBudgetFeasibility(plan);
      plan.total_budget = feasibility.minRealistic;
    } else if (budgetDecision === 'build_best' || budgetDecision === 'reduce_count') {
      trimPlanToFitBudget(plan);
    }

    let cart, goal;
    try {
      cart = await Cart.create({
        ownerId: req.user.id,
        name: plan.summary || 'My Wardrobe',
        goalText,
      });
    } catch (e) {
      console.error('Cart.create failed:', e.message);
      throw e;
    }

    try {
      goal = await Goal.create({ userId: req.user.id, rawText: goalText, parsedPlan: plan, cartId: cart.id });
    } catch (e) {
      console.error('Goal.create failed:', e.message);
      // Non-fatal — cart was created, just log and continue
    }

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'planned',
      message: `✅ Plan ready — shopping for ${plan.items.length} item types within ₹${plan.total_budget?.toLocaleString()}`,
      plan,
    });

    res.json({ plan, cartId: cart.id });
  } catch (err) {
    console.error('Plan error:', err);
    res.status(500).json({ error: `Failed at planning step: ${err.message}` });
  }
});

// POST /api/agent/shop
router.post('/shop', auth, async (req, res) => {
  try {
    const { cartId, item } = req.body;
    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    // Gender must already be resolved by /plan before we ever get here —
    // this is the last line of defense, not the primary check. Refuse to
    // search ungated rather than silently returning every gender.
    if (!item.gender) {
      if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'warn', message: `⚠️ No gender resolved for ${item.type} — skipped for safety`,
      });
      return res.json({ added: [], message: 'Gender not resolved — refusing to search ungated' });
    }

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'searching', message: `🔍 Finding ${item.quantity}x ${item.type}...`
    });

    const normalizedColors = normalizeColors(item.colors);
    const mapped = mapArticleType(item.type);

    // ── Try semantic search first (gender + category + color all hard) ─────
    let candidates = await semanticSearch(item, {
      gender: item.gender,
      colors: normalizedColors,
      budget: item.budget,
      quantity: item.quantity,
    });

    let colorRelaxed = false;

    // ── Fall back to SQL filtering ─────────────────────────────────────────
    // Gender and category are NEVER relaxed — CLAUDE.md Invariant 1/2. Color
    // is the one constraint allowed to relax, and only after a strict pass
    // finds nothing, and only with the relaxation reported back honestly.
    if (!candidates || candidates.length === 0) {
      const buildSql = (includeColor) => {
        let sql = `SELECT * FROM products WHERE in_stock = 1`;
        const binds = {};
        let bi = 1;
        const b = (val) => { const k = `b${bi++}`; binds[k] = val; return `:${k}`; };

        sql += ` AND gender IN (${b(item.gender)}, ${b('Unisex')})`;
        if (item.budget) sql += ` AND price <= ${b(Math.round(item.budget * 1.2))}`;

        if (mapped) {
          sql += ` AND LOWER(article_type) LIKE LOWER(${b('%' + mapped + '%')})`;
        } else if (item.type) {
          sql += ` AND (LOWER(article_type) LIKE LOWER(${b('%' + item.type + '%')}) OR LOWER(title) LIKE LOWER(${b('%' + item.type + '%')}))`;
        } else {
          return null; // no category signal at all — refuse rather than search blind
        }

        if (includeColor && normalizedColors.length > 0) {
          const placeholders = normalizedColors.map(c => b(c));
          sql += ` AND base_colour IN (${placeholders.join(', ')})`;
        }

        if (item.avoid?.length > 0) {
          for (const a of item.avoid) sql += ` AND LOWER(title) NOT LIKE LOWER(${b('%' + a + '%')})`;
        }

        sql += ` ORDER BY rating DESC FETCH FIRST 20 ROWS ONLY`;
        return { sql, binds };
      };

      const strict = buildSql(true);
      if (strict) {
        const r = await query(strict.sql, strict.binds);
        candidates = r.rows || [];
      }

      // Relax color only — gender and article_type stay exactly as requested.
      if (candidates.length === 0 && normalizedColors.length > 0) {
        const relaxed = buildSql(false);
        if (relaxed) {
          const r2 = await query(relaxed.sql, relaxed.binds);
          candidates = r2.rows || [];
          if (candidates.length > 0) colorRelaxed = true;
        }
      }
    }

    if (candidates.length === 0) {
      if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'warn',
        message: `⚠️ No ${normalizedColors.join('/')} ${item.type} in stock for ${item.gender} — shortfall, not filling with something else`,
      });
      return res.json({ added: [], shortfall: true, message: `No strict match for ${item.type}` });
    }

    if (colorRelaxed && req.io) {
      req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'warn',
        message: `⚠️ No ${normalizedColors.join('/')} ${item.type} in stock — showing the closest ${item.gender} match in a different color instead`,
      });
    }

    // ── Wardrobe-aware dedup: for one-at-a-time categories, skip items ─────
    // identical (type + colour) to something already in an approved wardrobe.
    const mappedLower = (mapped || item.type || '').toLowerCase();
    if (SINGLE_PURCHASE_TYPES.has(mappedLower)) {
      const ownedItems = await Wardrobe.findOwnedItems(req.user.id);
      if (ownedItems.length > 0) {
        const ownedSignatures = new Set(ownedItems.map(row => {
          const at = (row.ARTICLE_TYPE || row.article_type || '').toLowerCase();
          const col = (row.BASE_COLOUR || row.base_colour || '').toLowerCase();
          return `${at}|${col}`;
        }));
        const filtered = candidates.filter(row => {
          const at = (row.ARTICLE_TYPE || row.article_type || '').toLowerCase();
          const col = (row.BASE_COLOUR || row.base_colour || '').toLowerCase();
          return !ownedSignatures.has(`${at}|${col}`);
        });
        if (filtered.length > 0) {
          if (filtered.length < candidates.length && req.io) {
            req.io.to(`user_${req.user.id}`).emit('agent:progress', {
              step: 'dedup',
              message: `👗 Skipped ${candidates.length - filtered.length} option(s) too similar to what you already own`,
            });
          }
          candidates = filtered;
        }
      }
    }

    // Fest-Safe / "Don't Twin" (reframed, not cut — Part 3.3): a scoring
    // nudge only, never a filter. Trend Radar (weather + campus signal)
    // was cut entirely per the mentor review — different problem
    // statement, doesn't stitch with the Collab Cart, and M-Now already
    // owns local/hyperlocal trend signal at Myntra.
    try {
      const goalForContext = await Goal.findByCartId(cartId);
      const city = goalForContext?.parsedPlan?.context?.city;
      if (city) {
        candidates = await venueAdjustCandidates(candidates, city);
      }
    } catch (contextErr) {
      console.log('Fest-Safe ranking skipped:', contextErr.message?.slice(0, 80));
    }

    // APPROVER mode — the Payer Lock (collab_cart_five_modes.md). If the
    // person paying has set a hard per-item ceiling, it overrides candidate
    // selection here — never trust a UI-level warning alone, the same
    // "code decides, not a claim" discipline as gender/budget elsewhere in
    // this route. A cart with no collab session (the common case) or one
    // still in the default 'advisor' mode is completely unaffected.
    try {
      const session = await CollabSession.findByCart(cartId);
      const itemCap = session?.ITEM_PRICE_CAP || session?.itemPriceCap;
      if (itemCap) {
        const withinCap = candidates.filter(row => (row.PRICE || row.price) <= itemCap);
        if (withinCap.length > 0) candidates = withinCap;
        // If NOTHING fits the cap, fall through on the unfiltered candidates
        // rather than manufacture a shortfall the approver didn't ask for —
        // optimizeUnderBudget at /finalize is still the hard backstop.
      }
    } catch (lockErr) {
      console.log('Payer lock check skipped:', lockErr.message?.slice(0, 80));
    }

    // PROXY mode — if a recipient profile was set (collab_cart_five_modes.md
    // "privacy-preserving size"), use THEIR size, not the buyer's own
    // default. Honestly partial: this is whatever the buyer/recipient
    // actually entered on the collab link, not a real cross-account
    // history lookup — StyleOS has no such linkage today.
    let recipientSize = 'M';
    try {
      const session = await CollabSession.findByCart(cartId);
      const profileRaw = session?.RECIPIENT_PROFILE || session?.recipientProfile;
      if (profileRaw) {
        const profile = typeof profileRaw === 'string' ? JSON.parse(profileRaw) : profileRaw;
        if (profile?.size) recipientSize = profile.size;
      }
    } catch (profileErr) {
      console.log('Recipient profile lookup skipped:', profileErr.message?.slice(0, 80));
    }

    const qty = item.quantity || 1;
    const selected = candidates.slice(0, qty);
    const added = [];

    for (const row of selected) {
      const productId = row.ID || row.id;
      const product = {
        id: productId,
        title: row.TITLE || row.title,
        brand: row.BRAND || row.brand,
        price: row.PRICE || row.price,
        images: safeJson(row.IMAGES || row.images),
        articleType: row.ARTICLE_TYPE || row.articleType,
        baseColour: row.BASE_COLOUR || row.baseColour,
        gender: row.GENDER || row.gender,
        colorRelaxed,
      };

      await CartItem.create({ cartId, productId, size: recipientSize, quantity: 1, addedByAgent: true });

      if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
        step: 'item_added',
        message: `🛍️ Added: ${product.title} — ₹${product.price?.toLocaleString()}`,
        product,
      });

      added.push({ product });
    }

    await Cart.updateTotal(cartId);
    const updated = await Cart.findById(cartId);
    const cartTotal = updated?.TOTAL_PRICE || 0;

    const goal = await Goal.findByCartId(cartId);
    const totalBudget = goal?.parsedPlan?.total_budget;
    const budgetInfo = totalBudget
      ? { totalBudget, remaining: totalBudget - cartTotal, status: budgetStatus([{ price: cartTotal, quantity: 1 }], totalBudget) }
      : null;

    res.json({ added, cartTotal, budget: budgetInfo });

  } catch (err) {
    console.error('Shop error:', err);
    res.status(500).json({ error: 'Shopping step failed: ' + err.message });
  }
});

// POST /api/agent/alternatives
// Product Sheet's "Swap this item" list — candidates in the exact same
// slot (gender + article_type always hard, per Invariant 1/2) with a price
// delta vs. the current item so the UI can show "+₹200"/"-₹150"/"Same price".
router.post('/alternatives', auth, async (req, res) => {
  try {
    const { cartItemId } = req.body;
    if (!cartItemId) return res.status(400).json({ error: 'cartItemId required' });

    const r0 = await query(
      `SELECT ci.id AS ci_id, ci.cart_id AS cart_id, p.id AS product_id, p.title, p.brand, p.price,
              p.article_type, p.base_colour, p.gender
       FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = :id`,
      { id: cartItemId }
    );
    const row = r0.rows?.[0];
    if (!row) return res.status(404).json({ error: 'Cart item not found' });

    const ownerCart = await Cart.findById(row.CART_ID);
    if (!ownsCart(ownerCart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const current = {
      id: row.CI_ID,
      cartId: row.CART_ID,
      product: {
        id: row.PRODUCT_ID, title: row.TITLE, brand: row.BRAND, price: row.PRICE,
        articleType: row.ARTICLE_TYPE, baseColour: row.BASE_COLOUR, gender: row.GENDER,
      },
    };

    // Invariant 3 (color safety) has to hold on every surface that can
    // change what's in the cart, not just the initial /shop call — this
    // used to filter only by gender + category, so a swap could silently
    // hand back a colour nothing else in the cart uses. There's no cheap
    // way to re-derive the original strict-colour list here (that lives on
    // the parsed goal, not the cart item), so the next best signal is the
    // cart's OTHER items: if they all agree on a small colour set, a swap
    // should stay inside it.
    const siblingItems = await CartItem.findByCart(row.CART_ID);
    const siblingColours = [...new Set(
      siblingItems.filter(it => it.id !== cartItemId && it.product?.baseColour).map(it => it.product.baseColour)
    )];

    const gdr = current.product.gender || 'Unisex';
    let sql = `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr
       AND id <> :pid AND in_stock = 1`;
    const binds = { at: current.product.articleType, gdr, pid: current.product.id };
    if (siblingColours.length > 0) {
      const placeholders = siblingColours.map((_, i) => `:c${i}`).join(',');
      sql += ` AND base_colour IN (${placeholders})`;
      siblingColours.forEach((c, i) => { binds[`c${i}`] = c; });
    }
    sql += ` ORDER BY rating DESC FETCH FIRST 8 ROWS ONLY`;
    const r = await query(sql, binds);

    const alternatives = (r.rows || []).map(row => ({
      id: row.ID, title: row.TITLE, brand: row.BRAND, price: row.PRICE,
      articleType: row.ARTICLE_TYPE, baseColour: row.BASE_COLOUR, gender: row.GENDER,
      images: safeJson(row.IMAGES), rating: row.RATING,
      priceDelta: row.PRICE - current.product.price,
    }));

    res.json({ current: current.product, alternatives });
  } catch (err) {
    console.error('Alternatives error:', err);
    res.status(500).json({ error: 'Failed to find alternatives: ' + err.message });
  }
});

// POST /api/agent/swap
// The shopper manually picks a specific alternative from the Product Sheet
// (as opposed to /refine's free-text delta edits). Direct, explicit,
// constraint-preserving by construction since it only ever swaps within
// /alternatives' own gender+category-locked candidate list.
router.post('/swap', auth, async (req, res) => {
  try {
    const { cartId, cartItemId, newProductId } = req.body;
    if (!cartId || !cartItemId || !newProductId) return res.status(400).json({ error: 'cartId, cartItemId, newProductId required' });

    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const product = await Product.findById(newProductId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    await CartItem.update(cartItemId, { productId: newProductId });
    await Cart.updateTotal(cartId);
    const updated = await Cart.findById(cartId);
    const cartTotal = updated?.TOTAL_PRICE || 0;

    const items = await CartItem.findByCart(cartId);
    // Coordination-aware rebuild (Page 54) — buildOutfitGroups now prefers
    // non-clashing top/bottom pairings, so a swap that lands a bold color
    // automatically re-pairs within its outfit using the cart's OTHER
    // already-selected items, never a new product and never the whole cart.
    const outfits = buildOutfitGroups(items);
    const outfitNotes = describeSwapPairing(cartItemId, outfits);

    const goal = await Goal.findByCartId(cartId);
    const totalBudget = goal?.parsedPlan?.total_budget;
    const budgetInfo = totalBudget
      ? { totalBudget, remaining: budgetRemaining([{ price: cartTotal, quantity: 1 }], totalBudget), status: budgetStatus([{ price: cartTotal, quantity: 1 }], totalBudget) }
      : null;

    const swappedProduct = {
      id: product.ID || product.id, title: product.TITLE || product.title, brand: product.BRAND || product.brand,
      price: product.PRICE || product.price, articleType: product.ARTICLE_TYPE || product.articleType,
      baseColour: product.BASE_COLOUR || product.baseColour, images: safeJson(product.IMAGES || product.images),
    };

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'item_swapped', cartItemId,
      message: `Swapped in "${(product.TITLE || product.title || '').slice(0, 30)}"`,
      product: swappedProduct,
    });

    // A family member reviewing a Squad Cart is watching THIS cart change
    // live, not the owner's personal feed — without this, a swap the owner
    // makes in response to feedback is invisible on the reviewer's screen
    // until they manually reload.
    if (req.io) {
      try {
        const session = await CollabSession.findByCart(cartId);
        const shareToken = session?.SHARE_TOKEN || session?.shareToken;
        if (shareToken) {
          req.io.to(`collab_${shareToken}`).emit('cart:item_swapped', { cartItemId, product: swappedProduct, cartTotal });
        }
      } catch (collabErr) {
        console.log('Collab swap broadcast skipped:', collabErr.message?.slice(0, 80));
      }
    }

    res.json({ cartTotal, budget: budgetInfo, outfits, items, outfitNotes });
  } catch (err) {
    console.error('Swap error:', err);
    res.status(500).json({ error: 'Swap failed: ' + err.message });
  }
});

// POST /api/agent/reoptimize
// Simulates the agent continuing to work after the cart is built: it
// re-checks the catalog for price drops (cheaper alternative, same
// type+colour) and flags live coupon-style discounts (mrp vs price gap),
// updating the cart autonomously rather than waiting for the user to search again.
router.post('/reoptimize', auth, async (req, res) => {
  try {
    const { cartId } = req.body;
    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const items = await CartItem.findByCart(cartId);

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'reopt_start', message: '🔄 Re-checking prices and coupons on your cart...'
    });

    const changes = [];

    for (const item of items) {
      const p = item.product;
      if (!p || !p.articleType) continue;

      const r = await query(
        `SELECT * FROM products
         WHERE LOWER(article_type) = LOWER(:at)
           AND LOWER(base_colour) = LOWER(:col)
           AND gender = :gdr
           AND id <> :pid
           AND in_stock = 1
           AND price < :curPrice
         ORDER BY price ASC
         FETCH FIRST 1 ROWS ONLY`,
        { at: p.articleType, col: p.baseColour || '', gdr: p.gender || 'Unisex', pid: p.id, curPrice: p.price }
      );
      const better = r.rows?.[0];

      if (better) {
        await CartItem.update(item.id, { productId: better.ID });
        const savings = p.price - better.PRICE;
        changes.push({ type: 'price_drop', cartItemId: item.id, savings });

        if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
          step: 'price_drop',
          message: `💸 Price dropped — swapped "${p.title?.slice(0, 30)}" to save ₹${savings.toLocaleString()}`,
          product: { title: better.TITLE, brand: better.BRAND, price: better.PRICE, images: safeJson(better.IMAGES) },
        });
        continue;
      }

      const discountPct = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
      if (discountPct >= 10) {
        changes.push({ type: 'coupon', cartItemId: item.id, discountPct });
        if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
          step: 'coupon',
          message: `🏷️ Found a ${discountPct}% live discount on "${p.title?.slice(0, 30)}" — already applied`,
        });
      }
    }

    await Cart.updateTotal(cartId);
    const updated = await Cart.findById(cartId);
    const total = updated?.TOTAL_PRICE || 0;

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'reopt_done',
      message: changes.length > 0
        ? `✅ Re-optimized ${changes.length} item(s) — new total ₹${total.toLocaleString()}`
        : '✅ Checked everything — your cart is already the best deal available',
    });

    res.json({ changes, cartTotal: total });
  } catch (err) {
    console.error('Reoptimize error:', err);
    res.status(500).json({ error: 'Re-optimization failed: ' + err.message });
  }
});

// POST /api/agent/refine
// Continuous refinement chat: the shopper describes a change ("darker",
// "no logos", "more oversized") and the cart evolves in place — no restart.
router.post('/refine', auth, async (req, res) => {
  try {
    const { cartId, message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const items = await CartItem.findByCart(cartId);

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'refine_start', message, chat: true, from: 'user',
    });
    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'refine_thinking', message: 'Let me see what works better...', chat: true, from: 'stylist',
    });

    const actions = await refineCart(items, cart.GOAL_TEXT || cart.goalText || '', message);
    const applied = [];

    for (const action of actions) {
      // "actually budget is 12k" — not a single-item action. Greedily bring
      // the cart under the new budget by swapping (never removing outright
      // unless no cheaper alternative exists) the priciest item repeatedly,
      // per CLAUDE.md Page 22's budget-overrun algorithm.
      if (action.action === 'budget_change') {
        let working = [...items];
        let iterations = 0;
        while (iterations < working.length) {
          const total = working.reduce((s, i) => s + (i.product.price || 0), 0);
          if (total <= action.newBudget) break;
          const priciest = working.reduce((a, b) => (b.product.price > a.product.price ? b : a));
          const gdr = priciest.product.gender || 'Unisex';
          const r = await query(
            `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr
             AND id <> :pid AND in_stock = 1 AND price < :curPrice
             ORDER BY price ASC FETCH FIRST 1 ROWS ONLY`,
            { at: priciest.product.articleType, gdr, pid: priciest.productId, curPrice: priciest.product.price }
          );
          const cheaper = r.rows?.[0];
          if (cheaper) {
            await CartItem.update(priciest.id, { productId: cheaper.ID });
            applied.push({ type: 'swapped', cartItemId: priciest.id, newProductId: cheaper.ID });
            priciest.product = { ...priciest.product, price: cheaper.PRICE, title: cheaper.TITLE };
            if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
              step: 'item_swapped', cartItemId: priciest.id,
              message: `Swapped in a cheaper "${cheaper.TITLE.slice(0, 30)}" to fit the new budget`,
              product: { id: cheaper.ID, title: cheaper.TITLE, brand: cheaper.BRAND, price: cheaper.PRICE, articleType: cheaper.ARTICLE_TYPE, baseColour: cheaper.BASE_COLOUR, images: safeJson(cheaper.IMAGES) },
            });
          } else {
            // No cheaper alternative exists in this slot — honest shortfall,
            // remove rather than silently leaving the cart over budget.
            await CartItem.remove(priciest.id, cartId);
            applied.push({ type: 'removed', cartItemId: priciest.id });
            working = working.filter(i => i.id !== priciest.id);
            if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
              step: 'item_removed', cartItemId: priciest.id,
              message: `No cheaper alternative for "${priciest.product.title.slice(0, 30)}" — removed it to fit ₹${action.newBudget.toLocaleString()}`,
            });
          }
          iterations++;
        }
        continue;
      }

      // Influencer Mirror: cut entirely per the pivot freeze (Part 1.2) —
      // adjacent to "Reels to cart," an idea Myntra's own team already
      // owns internally. `style_match` actions (if a stale client ever
      // sends one) are simply ignored below rather than acted on.
      if (action.action === 'style_match') {
        continue;
      }

      const item = items.find(i => i.id === action.cartItemId);
      if (!item) continue;

      if (action.action === 'remove') {
        await CartItem.remove(action.cartItemId, cartId);
        applied.push({ type: 'removed', cartItemId: action.cartItemId });
        if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
          step: 'item_removed', cartItemId: action.cartItemId,
          message: `Removed "${item.product.title.slice(0, 30)}" — ${action.reason || ''}`,
        });
        continue;
      }

      if (action.action === 'swap') {
        const gdr = item.product.gender || 'Unisex';
        let sql = `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr AND id <> :pid AND in_stock = 1`;
        const binds = { at: item.product.articleType, gdr, pid: item.productId };
        if (action.newColour) { sql += ` AND LOWER(base_colour) LIKE LOWER(:col)`; binds.col = `%${action.newColour}%`; }
        if (action.newKeyword) { sql += ` AND LOWER(title) LIKE LOWER(:kw)`; binds.kw = `%${action.newKeyword}%`; }
        if (action.avoidKeyword) { sql += ` AND LOWER(title) NOT LIKE LOWER(:avoidKw)`; binds.avoidKw = `%${action.avoidKeyword}%`; }
        if (action.cheaper) { sql += ` AND price < :curPrice`; binds.curPrice = item.product.price; }
        sql += action.cheaper ? ` ORDER BY price ASC FETCH FIRST 5 ROWS ONLY` : ` ORDER BY rating DESC FETCH FIRST 5 ROWS ONLY`;
        const r = await query(sql, binds);
        let replacement = r.rows?.[0];

        // Relax to just article_type + gender if the styled search found nothing
        if (!replacement) {
          const r2 = await query(
            `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr AND id <> :pid AND in_stock = 1
             ORDER BY rating DESC FETCH FIRST 5 ROWS ONLY`,
            { at: item.product.articleType, gdr, pid: item.productId }
          );
          replacement = r2.rows?.[0];
        }

        if (replacement) {
          await CartItem.update(action.cartItemId, { productId: replacement.ID });
          applied.push({ type: 'swapped', cartItemId: action.cartItemId, newProductId: replacement.ID });
          if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
            step: 'item_swapped', cartItemId: action.cartItemId,
            message: `Swapped in "${replacement.TITLE.slice(0, 30)}" — ${action.reason || ''}`,
            product: {
              id: replacement.ID, title: replacement.TITLE, brand: replacement.BRAND,
              price: replacement.PRICE, articleType: replacement.ARTICLE_TYPE,
              baseColour: replacement.BASE_COLOUR, images: safeJson(replacement.IMAGES),
            },
          });
        }
      }
    }

    await Cart.updateTotal(cartId);
    const updated = await Cart.findById(cartId);
    const total = updated?.TOTAL_PRICE || 0;

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'refine_done', chat: true, from: 'stylist',
      message: applied.length > 0
        ? `Updated ${applied.length} item${applied.length > 1 ? 's' : ''} — new total ₹${total.toLocaleString()}.`
        : `Kept everything as is — nothing needed to change for that.`,
    });

    res.json({ actions: applied, cartTotal: total });
  } catch (err) {
    console.error('Refine error:', err);
    res.status(500).json({ error: 'Refine failed: ' + err.message });
  }
});

// POST /api/agent/finalize
router.post('/finalize', auth, async (req, res) => {
  try {
    const { cartId } = req.body;
    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    let items = await CartItem.findByCart(cartId);

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:progress', {
      step: 'finalizing', message: '✨ Building your wardrobe summary...'
    });

    // Budget enforcement (Invariant 4 / Page 22): /shop only caps each
    // item's own price, nothing previously checked the SUM against the
    // stated total — a cart could silently land well over budget. Fit it
    // down now, before generating copy, so the rationale describes the
    // cart the user actually sees.
    const goalRecordEarly = await Goal.findByCartId(cartId);
    const statedBudget = goalRecordEarly?.parsedPlan?.total_budget;
    let budgetFitChanges = [];
    if (statedBudget) {
      const fitResult = await optimizeUnderBudget({ cartId, totalBudget: statedBudget, io: req.io, userId: req.user.id });
      budgetFitChanges = fitResult.changes;
      items = fitResult.items;
    }

    const goalText = cart.GOAL_TEXT || cart.goalText || '';
    const [rawRationale, compatibility] = await Promise.all([
      generateCartRationale(items, goalText),
      checkOutfitCompatibility(items),
    ]);

    // Copy grounding (Invariant 5): never trust generated copy at face
    // value — validate it only mentions colors/categories actually in the
    // selected items, and swap to a safe deterministic version otherwise.
    const grounded = groundOrFallback(rawRationale, items, goalText);

    // Real, code-built outfit groups — every item referenced is guaranteed
    // to be one of the actually-selected cart items (Page 24).
    const outfits = buildOutfitGroups(items);

    const updatedCart = await Cart.findById(cartId);
    const cartTotal = updatedCart?.TOTAL_PRICE || 0;
    const budgetInfo = statedBudget
      ? { totalBudget: statedBudget, remaining: budgetRemaining([{ price: cartTotal, quantity: 1 }], statedBudget), status: budgetStatus([{ price: cartTotal, quantity: 1 }], statedBudget) }
      : null;

    // Modesty/coverage check: cut from the live demo per the pivot freeze
    // (Part 1.3) — real and cheap, but not the USP and it eats rehearsal
    // time. Stays as a roadmap line, not a code path in the active flow.

    const summary = {
      cartId,
      total: cartTotal,
      itemCount: items.length,
      rationale: grounded.text,
      grounded: grounded.grounded,
      combinations: compatibility.combinations || [],
      outfits,
      budget: budgetInfo,
      budgetFitChanges,
    };

    if (req.io) req.io.to(`user_${req.user.id}`).emit('agent:done', summary);

    res.json({ ...summary, compatibility });
  } catch (err) {
    console.error('Finalize error:', err);
    res.status(500).json({ error: 'Finalization failed' });
  }
});

function safeJson(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

module.exports = router;
