/**
 * Budget math — single source of truth per CLAUDE.md Page 23 / Invariant 4.
 * The DB (Cart.updateTotal) is the ground truth for the persisted cart
 * total; these helpers exist so every response surface (plan/shop/refine/
 * finalize) derives remaining/pct/status from the same formulas instead of
 * each route re-inventing the math inline.
 */

function sumItems(items) {
  return (items || []).reduce((sum, i) => {
    const price = i.product?.price ?? i.price ?? 0;
    const qty = i.quantity ?? 1;
    return sum + price * qty;
  }, 0);
}

function budgetRemaining(items, budgetTotal) {
  return (budgetTotal || 0) - sumItems(items);
}

function budgetPct(items, budgetTotal) {
  if (!budgetTotal) return 0;
  return Math.round((sumItems(items) / budgetTotal) * 100);
}

/**
 * 'under' — comfortably within budget
 * 'near'  — within 10% of the limit
 * 'over'  — exceeds the stated budget
 */
function budgetStatus(items, budgetTotal) {
  if (!budgetTotal) return 'under';
  const pct = budgetPct(items, budgetTotal);
  if (pct > 100) return 'over';
  if (pct >= 90) return 'near';
  return 'under';
}

/**
 * Post-shop budget enforcement (Page 22): if the assembled cart exceeds the
 * stated total budget, repeatedly swap the priciest item for a cheaper
 * same-slot alternative (gender + article_type held fixed), and only
 * remove outright if no cheaper alternative exists. This is the step that
 * was missing before — /shop enforces a per-unit price ceiling per item,
 * but nothing previously checked the SUM against the user's actual budget,
 * so a cart could silently land well over what was asked for.
 */
async function optimizeUnderBudget({ cartId, totalBudget, io, userId }) {
  if (!totalBudget) return { changes: [], items: await require('../models').CartItem.findByCart(cartId) };

  const { query } = require('../db');
  const { CartItem, Cart } = require('../models');

  let items = await CartItem.findByCart(cartId);
  const changes = [];
  let iterations = 0;
  const maxIterations = items.length + 2;

  while (iterations < maxIterations) {
    if (sumItems(items) <= totalBudget) break;
    if (items.length === 0) break;

    const priciest = items.reduce((a, b) => (b.product.price > a.product.price ? b : a));
    const gdr = priciest.product.gender || 'Unisex';

    // Gender, category, AND color are all hard constraints (Invariants 1-3)
    // — a budget fix must never quietly break color just because it's not
    // the one being negotiated. Try the same color first; only relax color
    // as an honest, flagged last resort, exactly like /shop's own ladder.
    let cheaper = null;
    let colorRelaxed = false;
    if (priciest.product.baseColour) {
      const r1 = await query(
        `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr
         AND base_colour = :col AND id <> :pid AND in_stock = 1 AND price < :curPrice
         ORDER BY price ASC FETCH FIRST 1 ROWS ONLY`,
        { at: priciest.product.articleType, gdr, col: priciest.product.baseColour, pid: priciest.productId, curPrice: priciest.product.price }
      );
      cheaper = r1.rows?.[0] || null;
    }
    if (!cheaper) {
      const r2 = await query(
        `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr
         AND id <> :pid AND in_stock = 1 AND price < :curPrice
         ORDER BY price ASC FETCH FIRST 1 ROWS ONLY`,
        { at: priciest.product.articleType, gdr, pid: priciest.productId, curPrice: priciest.product.price }
      );
      cheaper = r2.rows?.[0] || null;
      if (cheaper) colorRelaxed = true;
    }

    if (cheaper) {
      await CartItem.update(priciest.id, { productId: cheaper.ID });
      changes.push({ type: 'swapped', cartItemId: priciest.id, from: priciest.product.title, to: cheaper.TITLE, colorRelaxed });
      priciest.product = { ...priciest.product, price: cheaper.PRICE, title: cheaper.TITLE, baseColour: cheaper.BASE_COLOUR };
      if (io && userId) io.to(`user_${userId}`).emit('agent:progress', {
        step: 'budget_fit',
        message: colorRelaxed
          ? `💸 No cheaper ${priciest.product.baseColour} match, so I swapped "${(priciest.product.title || '').slice(0, 28)}" for a different-color option to stay within your ₹${totalBudget.toLocaleString()} budget`
          : `💸 Swapped "${(priciest.product.title || '').slice(0, 28)}" for a cheaper option to stay within your ₹${totalBudget.toLocaleString()} budget`,
      });
    } else {
      await CartItem.remove(priciest.id, cartId);
      changes.push({ type: 'removed', cartItemId: priciest.id, from: priciest.product.title });
      items = items.filter(i => i.id !== priciest.id);
      if (io && userId) io.to(`user_${userId}`).emit('agent:progress', {
        step: 'budget_fit', message: `⚠️ No cheaper alternative for "${(priciest.product.title || '').slice(0, 28)}" — removed it to fit your ₹${totalBudget.toLocaleString()} budget`,
      });
    }
    iterations++;
  }

  await Cart.updateTotal(cartId);
  return { changes, items };
}

module.exports = { sumItems, budgetRemaining, budgetPct, budgetStatus, optimizeUnderBudget };
