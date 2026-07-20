const router = require('express').Router();
const { Product } = require('../models');

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const products = await Product.search(req.query);
    res.json({ products, total: products.length });
  } catch (err) {
    console.error('Products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
