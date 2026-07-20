const router = require('express').Router();
const auth = require('../middleware/auth');
const { Wardrobe, Cart, CartItem } = require('../models');
const { ownsCart } = require('../middleware/ownership');

router.get('/', auth, async (req, res) => {
  try {
    const wardrobes = await Wardrobe.findByUser(req.user.id);
    res.json(wardrobes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wardrobes' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { cartId, name, outfitCombinations } = req.body;
    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const items = await CartItem.findByCart(cartId);
    const w = await Wardrobe.create({
      userId: req.user.id, cartId, name: name || cart.NAME || 'My Wardrobe',
      outfitCombinations: outfitCombinations || [],
      totalItems: items.length,
      totalPrice: cart.TOTAL_PRICE || 0,
    });
    await Cart.updateStatus(cartId, 'approved');
    res.status(201).json(w);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save wardrobe' });
  }
});

module.exports = router;
