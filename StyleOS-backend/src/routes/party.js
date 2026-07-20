/**
 * CO-ATTENDEE mode — the Clash Engine (collab_cart_five_modes.md). A party
 * groups several attendees' INDIVIDUAL carts (not one shared cart — that's
 * what collab_sessions already models for the other four modes) so their
 * items can be compared live: if two attendees have the same product, or
 * the same article_type + colour, everyone sees it before the event, not
 * at it. No external trend data — the clash signal is just the carts
 * already in the room.
 */
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { Party, PartyMember, Cart, CartItem } = require('../models');

// POST /api/parties/create — { name }. Creator's own cart is linked once
// they join (same zero-friction join pattern as collab guest-join).
router.post('/create', auth, async (req, res) => {
  try {
    const { name } = req.body || {};
    const shareToken = uuidv4();
    const party = await Party.create({ name, ownerId: req.user.id, shareToken });
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/party/${shareToken}`;
    res.json({
      partyId: party.id, shareToken, shareUrl,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Check what I'm wearing so we don't clash 👀\n${shareUrl}`)}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create party' });
  }
});

// POST /api/parties/:token/join — { name, cartId }. No account needed
// (same guest pattern as Squad Cart) — cartId is optional at join time and
// can be attached later once the attendee has actually built a cart.
router.post('/:token/join', async (req, res) => {
  try {
    const { name, cartId } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'A name is needed to join' });

    const party = await Party.findByToken(req.params.token);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const guestToken = uuidv4();
    const member = await PartyMember.create({
      partyId: party.ID || party.id, guestName: name.trim().slice(0, 60), guestToken, cartId,
    });

    if (req.io) req.io.to(`party_${req.params.token}`).emit('party:member_joined', { name: name.trim() });

    res.json({ guestToken, memberId: member.id, name: name.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join party' });
  }
});

// PATCH /api/parties/:token/cart — { guestToken, cartId }. Attach/update
// which cart this attendee is wearing, without re-joining.
router.patch('/:token/cart', async (req, res) => {
  try {
    const { guestToken, cartId } = req.body || {};
    const party = await Party.findByToken(req.params.token);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const partyId = party.ID || party.id;
    const member = await PartyMember.findByGuestToken({ partyId, guestToken });
    if (!member) return res.status(403).json({ error: 'Not a member of this party' });

    const { query } = require('../db');
    await query(`UPDATE party_members SET cart_id = :cid WHERE id = :id`, { cid: cartId, id: member.ID || member.id });

    const clashes = await computeClashes(partyId);
    if (req.io && clashes.length > 0) {
      req.io.to(`party_${req.params.token}`).emit('party:clash', { clashes });
    }

    res.json({ updated: true, clashes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

/**
 * Two attendees "clash" if they share a product_id outright (exact same
 * item) or the same (article_type, base_colour) pair (same look, different
 * SKU) — both are the actual "we're wearing the same thing" moment, not
 * just an exact-SKU coincidence. Takes pre-fetched {member, items} pairs —
 * split out from computeClashes() so the GET route (which needs the raw
 * item data anyway, to render each attendee's actual cart) doesn't pay for
 * a second round of per-member CartItem queries just to also get clashes.
 */
function computeClashesFromItems(withItems) {
  const clashes = [];
  for (let i = 0; i < withItems.length; i++) {
    for (let j = i + 1; j < withItems.length; j++) {
      const a = withItems[i];
      const b = withItems[j];
      for (const itemA of a.items) {
        for (const itemB of b.items) {
          const sameProduct = itemA.productId === itemB.productId;
          const sameLook = itemA.product?.articleType === itemB.product?.articleType &&
            itemA.product?.baseColour === itemB.product?.baseColour &&
            itemA.product?.articleType && itemA.product?.baseColour;
          if (sameProduct || sameLook) {
            clashes.push({
              memberA: a.member.name, memberB: b.member.name,
              productIdA: itemA.productId, productIdB: itemB.productId,
              articleType: itemA.product?.articleType, baseColour: itemA.product?.baseColour,
              exact: sameProduct,
            });
          }
        }
      }
    }
  }
  return clashes;
}

async function computeClashes(partyId) {
  const members = await PartyMember.findByParty(partyId);
  const withItems = [];
  for (const m of members) {
    if (!m.cartId) continue;
    const items = await CartItem.findByCart(m.cartId);
    withItems.push({ member: m, items });
  }
  return computeClashesFromItems(withItems);
}

// GET /api/parties/:token — full roster + live clash computation. Each
// member's actual cart items (with product images) are included, and any
// item involved in a clash is flagged with isClash — so the frontend can
// show real product photography side by side instead of a text-only
// summary, and visually call out the exact item(s) that match.
router.get('/:token', async (req, res) => {
  try {
    const party = await Party.findByToken(req.params.token);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const partyId = party.ID || party.id;
    const members = await PartyMember.findByParty(partyId);
    const withItems = await Promise.all(members.map(async m => ({
      member: m,
      items: m.cartId ? await CartItem.findByCart(m.cartId) : [],
    })));
    const clashes = computeClashesFromItems(withItems);
    const clashProductIds = new Set(clashes.flatMap(c => [c.productIdA, c.productIdB]));

    const membersWithItems = withItems.map(({ member, items }) => ({
      ...member,
      items: items.map(it => ({ ...it, isClash: clashProductIds.has(it.productId) })),
    }));

    res.json({ party, members: membersWithItems, clashes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch party' });
  }
});

module.exports = router;
