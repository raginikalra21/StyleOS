/**
 * The custom commerce provider — the direct equivalent of vercel/commerce's
 * lib/shopify/index.ts, implementing the same kind of function surface
 * (getProducts, getProduct, cart operations) as plain fetch calls against
 * the EXISTING, unmodified StyleOS Express API. No GraphQL, no Shopify
 * client — the constraint engine, convergence engine, and every custom
 * route stay exactly as they are on the backend; only this file changes if
 * the data source ever needs to change again.
 */
import { normalizeProduct, StyleOSProduct, StyleOSCart } from './types';

const API_BASE = process.env.STYLEOS_API_URL || 'http://localhost:5000/api';

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    // Server Component fetches default to no-store here — product data
    // changes with every reseed/swap during this migration, and the
    // storefront should never show a stale cached product a user can't
    // actually check out with.
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function getProducts(params: {
  q?: string;
  gender?: string;
  articleType?: string;
  baseColour?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  limit?: number;
} = {}): Promise<StyleOSProduct[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  const data = await apiFetch(`/products${query ? `?${query}` : ''}`);
  return (data.products || []).map(normalizeProduct);
}

export async function getProduct(id: string): Promise<StyleOSProduct | null> {
  try {
    const data = await apiFetch(`/products/${id}`);
    return normalizeProduct(data);
  } catch {
    return null;
  }
}

/**
 * Collections have no StyleOS equivalent — the product is Agent chat
 * (goal-to-cart), not category browsing, so this deliberately doesn't
 * invent a fake "collections" concept the way a literal Shopify port
 * would. articleType/gender filters via getProducts() cover the same
 * practical need (e.g. "Men's Jackets") without pretending there's a
 * merchandised collection behind it.
 */

export async function getCart(cartId: string, token?: string): Promise<StyleOSCart | null> {
  try {
    const data = await apiFetch(`/cart/${cartId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return {
      id: data.ID || data.id,
      name: data.NAME || data.name || 'My Cart',
      totalPrice: data.TOTAL_PRICE || data.totalPrice || 0,
      items: (data.items || []).map((item: Record<string, unknown>) => ({
        id: item.id,
        cartId: item.cartId,
        productId: item.productId,
        size: item.size ?? null,
        quantity: item.quantity ?? 1,
        product: normalizeProduct((item.product || {}) as Record<string, unknown>),
      })),
    };
  } catch {
    return null;
  }
}

export async function createCart(token: string, name?: string): Promise<{ id: string }> {
  return apiFetch('/cart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

export async function addToCart(cartId: string, productId: string, size: string | null, token: string) {
  return apiFetch(`/cart/${cartId}/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productId, size }),
  });
}

export async function removeFromCart(cartId: string, itemId: string, token: string) {
  return apiFetch(`/cart/${cartId}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function approveCart(cartId: string, token: string) {
  return apiFetch(`/cart/${cartId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type { StyleOSProduct, StyleOSCart, StyleOSCartItem } from './types';
