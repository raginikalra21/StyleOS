const router = require('express').Router();
const auth = require('../middleware/auth');
const { Cart, CartItem, Product, CollabSession, Goal } = require('../models');
const { logShipment } = require('../services/venue_memory');
const { ownsCart } = require('../middleware/ownership');

// GET /api/cart
router.get('/', auth, async (req, res) => {
  try {
    const carts = await Cart.findByOwner(req.user.id);
    // Attach items to each cart
    for (const cart of carts) {
      cart.items = await CartItem.findByCart(cart.ID || cart.id);
    }
    res.json(carts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch carts' });
  }
});

// POST /api/cart
router.post('/', auth, async (req, res) => {
  try {
    const { name, goalText } = req.body;
    const cart = await Cart.create({ ownerId: req.user.id, name, goalText });
    res.status(201).json(cart);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create cart' });
  }
});

// GET /api/cart/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const cart = await Cart.findById(req.params.id);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });
    cart.items = await CartItem.findByCart(req.params.id);
    cart.collabSession = await CollabSession.findByCart(req.params.id);
    // Lets the frontend rehydrate a full session (plan, budget context) after
    // a page refresh, instead of only ever being reconstructable mid-flow.
    const goal = await Goal.findByCartId(req.params.id);
    cart.goalPlan = goal?.parsedPlan || null;
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart/:id/items
router.post('/:id/items', auth, async (req, res) => {
  try {
    const { productId, size, quantity, addedByAgent } = req.body;
    const cart = await Cart.findById(req.params.id);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const item = await CartItem.create({
      cartId: req.params.id, productId,
      size: size || 'M', quantity: quantity || 1,
      addedByUserId: addedByAgent ? null : req.user.id,
      addedByAgent: !!addedByAgent,
    });

    await Cart.updateTotal(req.params.id);
    const updated = await Cart.findById(req.params.id);

    if (req.io) {
      req.io.to(`cart_${req.params.id}`).emit('cart:item_added', {
        item, product, total: updated.TOTAL_PRICE || updated.totalPrice
      });
    }

    res.status(201).json({ item, product, cartTotal: updated.TOTAL_PRICE || updated.totalPrice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// POST /api/cart/:id/approve
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const cart = await Cart.findById(req.params.id);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    await Cart.updateStatus(req.params.id, 'approved');
    const updated = await Cart.findById(req.params.id);

    // Repetition-avoidance memory (Part 2 Page 56) — log what shipped to
    // this venue at the one checkpoint that means the purchase actually
    // happened. A logging failure must never fail the approval itself.
    try {
      const goal = await Goal.findByCartId(req.params.id);
      const city = goal?.parsedPlan?.context?.city;
      if (city) {
        const items = await CartItem.findByCart(req.params.id);
        for (const item of items) {
          await logShipment(item.productId, city, 'college');
        }
      }
    } catch (logErr) {
      console.log('venue shipment logging skipped:', logErr.message?.slice(0, 80));
    }

    if (req.io) {
      req.io.to(`cart_${req.params.id}`).emit('cart:approved', { cartId: req.params.id });
    }

    res.json({ success: true, status: updated?.STATUS || 'approved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve cart' });
  }
});

// DELETE /api/cart/:id/items/:itemId
router.delete('/:id/items/:itemId', auth, async (req, res) => {
  try {
    const cart = await Cart.findById(req.params.id);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    await CartItem.remove(req.params.itemId, req.params.id);
    await Cart.updateTotal(req.params.id);
    const updated = await Cart.findById(req.params.id);
    const total = updated?.TOTAL_PRICE || updated?.totalPrice || 0;

    if (req.io) {
      req.io.to(`cart_${req.params.id}`).emit('cart:item_removed', {
        itemId: req.params.itemId, total
      });
    }
    res.json({ success: true, cartTotal: total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

module.exports = router;
