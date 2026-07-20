/**
 * The custom commerce provider's data shapes — the direct equivalent of
 * vercel/commerce's lib/shopify Product/Cart types, but backed by the
 * existing StyleOS Express/Oracle API instead of a Shopify GraphQL store.
 */

export type StyleOSProduct = {
  id: string;
  title: string;
  brand: string;
  gender: string;
  articleType: string;
  baseColour: string;
  price: number;
  mrp: number;
  discountPercent: number;
  rating: number;
  ratingCount: number;
  deliveryDays: number;
  images: string[];
  description: string;
  sizes: string[];
  inStock: boolean;
};

export type StyleOSCartItem = {
  id: string;
  cartId: string;
  productId: string;
  size: string | null;
  quantity: number;
  product: StyleOSProduct;
};

export type StyleOSCart = {
  id: string;
  name: string;
  totalPrice: number;
  items: StyleOSCartItem[];
};

function safeJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Normalizes a raw product row from the Express API (Oracle uppercase
 * columns) into StyleOSProduct. Mirrors
 * StyleOS-frontend/src/helpers/normalizeProduct.js so the two frontends
 * never drift on what a product "is" — same source data, same shape.
 */
export function normalizeProduct(p: Record<string, unknown>): StyleOSProduct {
  const get = (upper: string, lower: string) => (p[upper] ?? p[lower]) as never;
  const price = Number(get('PRICE', 'price')) || 0;
  const mrp = Number(get('MRP', 'mrp')) || price;
  return {
    id: String(get('ID', 'id')),
    title: String(get('TITLE', 'title') ?? ''),
    brand: String(get('BRAND', 'brand') ?? 'Unknown'),
    gender: String(get('GENDER', 'gender') ?? 'Unisex'),
    articleType: String(get('ARTICLE_TYPE', 'articleType') ?? ''),
    baseColour: String(get('BASE_COLOUR', 'baseColour') ?? 'Multi'),
    price,
    mrp,
    discountPercent: mrp > price ? Math.round((1 - price / mrp) * 100) : 0,
    rating: Number(get('RATING', 'rating')) || 4.0,
    ratingCount: Number(get('RATING_COUNT', 'ratingCount')) || 0,
    deliveryDays: Number(get('DELIVERY_DAYS', 'deliveryDays')) || 5,
    images: safeJsonArray(get('IMAGES', 'images')),
    description: String(get('DESCRIPTION', 'description') ?? ''),
    sizes: safeJsonArray(get('SIZES', 'sizes')),
    inStock: Number(get('IN_STOCK', 'inStock')) !== 0,
  };
}
