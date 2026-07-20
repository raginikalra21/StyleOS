/**
 * Normalises a raw product row from the backend (Oracle uppercase columns,
 * or already-lowercase JSON) into the shape the forked-Myntra UI expects.
 * Single source of truth — used by both the list fetch and the detail fetch
 * so they can never drift out of sync with each other.
 */
export function normalizeProduct(p) {
  if (!p) return null;
  return {
    id: p.ID || p.id,
    brandName: p.BRAND || p.brand || 'Unknown',
    productName: p.TITLE || p.title,
    originalPrice: p.MRP || p.mrp || (p.PRICE || p.price),
    discountPercent: p.MRP && p.PRICE
      ? Math.round((1 - p.PRICE / p.MRP) * 100)
      : p.mrp && p.price
      ? Math.round((1 - p.price / p.mrp) * 100)
      : 0,
    images: (() => {
      const raw = p.IMAGES || p.images;
      if (Array.isArray(raw)) return raw;
      try {
        const imgs = JSON.parse(raw || '[]');
        return Array.isArray(imgs) ? imgs : [];
      } catch { return []; }
    })(),
    rating: p.RATING || p.rating || 4.0,
    numberOfReviews: p.RATING_COUNT || p.ratingCount || 0,
    colour: [p.BASE_COLOUR || p.baseColour || 'Multi'],
    gender: p.GENDER || p.gender || 'Unisex',
    articleType: p.ARTICLE_TYPE || p.articleType || 'Tshirts',
    occasion: p.OCCASION || p.occasion || 'Casual',
    price: p.PRICE || p.price,
    sizes: (() => {
      const raw = p.SIZES || p.sizes;
      if (Array.isArray(raw)) return raw;
      try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['S', 'M', 'L', 'XL'];
      } catch { return ['S', 'M', 'L', 'XL']; }
    })(),
  };
}
