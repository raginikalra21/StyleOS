/**
 * Single source of truth mapping an LLM-generated item description
 * (free-text, inconsistent phrasing) to a real product.article_type value.
 * Used by both the SQL fallback in agent.js and the semantic search
 * pre-filter, so neither can silently drift out of category constraints.
 */
const TYPE_MAP = {
  'tee': 'Tshirts', 't-shirt': 'Tshirts', 'tshirt': 'Tshirts', 'oversized tee': 'Tshirts',
  'oversized t-shirt': 'Tshirts', 'oversized tshirt': 'Tshirts', 'graphic tee': 'Tshirts',
  'printed tee': 'Tshirts', 'polo': 'Tshirts', 'round neck': 'Tshirts',
  'jeans': 'Jeans', 'denim': 'Jeans', 'jean': 'Jeans',
  'cargo': 'Trousers', 'cargos': 'Trousers', 'trousers': 'Trousers', 'trouser': 'Trousers',
  'joggers': 'Trousers', 'track pants': 'Trousers', 'pants': 'Trousers', 'chinos': 'Trousers',
  'hoodie': 'Sweatshirts', 'sweatshirt': 'Sweatshirts',
  'jacket': 'Jackets', 'denim jacket': 'Jackets', 'bomber jacket': 'Jackets',
  'shirt': 'Shirts', 'formal shirt': 'Shirts', 'casual shirt': 'Shirts',
  'kurta': 'Kurtas', 'kurti': 'Kurtas',
  'saree': 'Sarees', 'sari': 'Sarees',
  'lehenga': 'Lehenga Choli',
  'sherwani': 'Sherwanis',
  'sneakers': 'Sports Shoes', 'sports shoes': 'Sports Shoes',
  'shoes': 'Casual Shoes', 'casual shoes': 'Casual Shoes',
  'formal shoes': 'Formal Shoes',
  'sandals': 'Sandals', 'flip flops': 'Flip Flops',
  'backpack': 'Backpacks',
  'bag': 'Handbags', 'handbag': 'Handbags',
  'shorts': 'Shorts',
  'dress': 'Dresses',
  'top': 'Tops',
};

/**
 * Resolves free-text item type to a catalog article_type.
 * Tries an exact match first, then falls back to the longest
 * matching keyword contained anywhere in the string (so "oversized
 * t-shirt in black" still resolves to Tshirts even though it's not
 * a literal dictionary key).
 */
function mapArticleType(typeStr) {
  if (!typeStr) return null;
  const lc = typeStr.toLowerCase().trim();
  if (TYPE_MAP[lc]) return TYPE_MAP[lc];

  let best = null;
  for (const key of Object.keys(TYPE_MAP)) {
    if (lc.includes(key) && (!best || key.length > best.length)) {
      best = key;
    }
  }
  return best ? TYPE_MAP[best] : null;
}

module.exports = { mapArticleType, TYPE_MAP };
