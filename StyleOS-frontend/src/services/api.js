/**
 * API service — all calls to StyleOS backend
 */

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('styleos_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const isGuest = options.headers && (options.headers['x-guest-token'] || options.headers['X-Guest-Token']);
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && !isGuest ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error(err.error || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  register: (name, email, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),

  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => request('/auth/me'),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const products = {
  search: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/products?${qs}`);
  },
  get: (id) => request(`/products/${id}`),
};

// ── Cart ──────────────────────────────────────────────────────────────────────
export const cart = {
  list: () => request('/cart'),
  create: (name, goalText) =>
    request('/cart', { method: 'POST', body: JSON.stringify({ name, goalText }) }),
  get: (id) => request(`/cart/${id}`),
  addItem: (cartId, productId, size, quantity) =>
    request(`/cart/${cartId}/items`, { method: 'POST', body: JSON.stringify({ productId, size, quantity }) }),
  removeItem: (cartId, itemId) =>
    request(`/cart/${cartId}/items/${itemId}`, { method: 'DELETE' }),
  approve: (cartId) =>
    request(`/cart/${cartId}/approve`, { method: 'POST' }),
};

// ── Agent ─────────────────────────────────────────────────────────────────────
export const agent = {
  plan: (goalText, clarifiedGender, budgetDecision) =>
    request('/agent/plan', { method: 'POST', body: JSON.stringify({ goalText, clarifiedGender, budgetDecision }) }),

  shop: (cartId, item) =>
    request('/agent/shop', { method: 'POST', body: JSON.stringify({ cartId, item }) }),

  finalize: (cartId) =>
    request('/agent/finalize', { method: 'POST', body: JSON.stringify({ cartId }) }),

  reoptimize: (cartId) =>
    request('/agent/reoptimize', { method: 'POST', body: JSON.stringify({ cartId }) }),

  refine: (cartId, message) =>
    request('/agent/refine', { method: 'POST', body: JSON.stringify({ cartId, message }) }),

  alternatives: (cartItemId) =>
    request('/agent/alternatives', { method: 'POST', body: JSON.stringify({ cartItemId }) }),

  swap: (cartId, cartItemId, newProductId) =>
    request('/agent/swap', { method: 'POST', body: JSON.stringify({ cartId, cartItemId, newProductId }) }),
};

// ── Collab ────────────────────────────────────────────────────────────────────
// `guest` is an optional { guestToken, guestName } pair — present only when
// the caller joined a Squad Cart / Council with just a name (Section 3.2,
// zero-friction join). When absent, the normal Authorization header (if any
// real StyleOS session exists) is used instead — both identities are
// resolved server-side by the same /collab/:token/... routes.
function guestHeaders(guest) {
  if (!guest?.guestToken) return {};
  return { 'x-guest-token': guest.guestToken };
}

export const collab = {
  create: (cartId, askMode, recipientName, recipientRelation, durationHours) =>
    request(`/collab/create/${cartId}`, { method: 'POST', body: JSON.stringify({ askMode, recipientName, recipientRelation, durationHours }) }),

  createForMission: (missionId) => request(`/collab/mission/create/${missionId}`, { method: 'POST' }),

  preview: (token) => request(`/collab/${token}/preview`),

  guestJoin: (token, name) =>
    request(`/collab/${token}/guest-join`, { method: 'POST', body: JSON.stringify({ name }) }),

  join: (token) => request(`/collab/${token}/join`, { method: 'POST' }),

  get: (token, guest) =>
    request(`/collab/${token}`, { headers: guestHeaders(guest) }),

  react: (token, cartItemId, type, content, missionSlotId, guest) =>
    request(`/collab/${token}/react`, {
      method: 'POST',
      headers: guestHeaders(guest),
      body: JSON.stringify({ cartItemId, missionSlotId, type, content }),
    }),

  voice: async (token, cartItemId, audioBlob, missionSlotId, guest) => {
    const form = new FormData();
    form.append('audio', audioBlob, 'voice.webm');
    if (cartItemId) form.append('cartItemId', cartItemId);
    if (missionSlotId) form.append('missionSlotId', missionSlotId);
    const token_ = getToken();
    const headers = guest?.guestToken
      ? { 'x-guest-token': guest.guestToken }
      : (token_ ? { Authorization: `Bearer ${token_}` } : {});
    const res = await fetch(`${BASE}/collab/${token}/voice`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) throw new Error('Voice upload failed');
    return res.json();
  },

  reconcile: (token, guest) =>
    request(`/collab/${token}/reconcile`, { method: 'POST', headers: guestHeaders(guest) }),

  myInvites: () => request('/collab/my/invites'),

  // Tier 4 — co-editing. Only meaningful once a guest holds floor control
  // (granted live via sockets, see control:grant in services/socket.js).
  controlSwap: (token, cartItemId, newProductId, guest) =>
    request(`/collab/${token}/control-swap`, {
      method: 'POST', headers: guestHeaders(guest), body: JSON.stringify({ cartItemId, newProductId }),
    }),

  // Tier 6 — session replay, built only from what's actually persisted.
  timeline: (token, guest) =>
    request(`/collab/${token}/timeline`, { headers: guestHeaders(guest) }),

  // APPROVER — the Payer Lock (Five Modes)
  setPayerLock: (token, budgetLock, itemPriceCap, detailLevel, guest) =>
    request(`/collab/${token}/payer-lock`, {
      method: 'POST', headers: guestHeaders(guest),
      body: JSON.stringify({ budgetLock, itemPriceCap, detailLevel }),
    }),

  // PROXY — recipient profile (Five Modes)
  setRecipientProfile: (token, profile, guest) =>
    request(`/collab/${token}/recipient-profile`, {
      method: 'POST', headers: guestHeaders(guest), body: JSON.stringify(profile),
    }),

  // PEER — shuttle diplomacy (Five Modes)
  resolvePeerDeadlock: (token, cartItemId, resolution, guest) =>
    request(`/collab/${token}/resolve-peer-deadlock`, {
      method: 'POST', headers: guestHeaders(guest), body: JSON.stringify({ cartItemId, resolution }),
    }),

  // ADVISOR — live vote (Five Modes)
  voteOptions: (token, cartItemId, guest) =>
    request(`/collab/${token}/vote-options/${cartItemId}`, { headers: guestHeaders(guest) }),
  vote: (token, cartItemId, productId, guest) =>
    request(`/collab/${token}/vote`, {
      method: 'POST', headers: guestHeaders(guest), body: JSON.stringify({ cartItemId, productId }),
    }),
};

// ── Parties (CO-ATTENDEE mode — the Clash Engine, Five Modes) ─────────────────
export const party = {
  create: (name) => request('/parties/create', { method: 'POST', body: JSON.stringify({ name }) }),
  join: (token, name, cartId) =>
    request(`/parties/${token}/join`, { method: 'POST', body: JSON.stringify({ name, cartId }) }),
  updateCart: (token, guestToken, cartId) =>
    request(`/parties/${token}/cart`, { method: 'PATCH', body: JSON.stringify({ guestToken, cartId }) }),
  get: (token) => request(`/parties/${token}`),
};

// ── Wardrobe ──────────────────────────────────────────────────────────────────
export const wardrobe = {
  list: () => request('/wardrobe'),
  save: (cartId, name, outfitCombinations) =>
    request('/wardrobe', { method: 'POST', body: JSON.stringify({ cartId, name, outfitCombinations }) }),
};

// ── Mission (Wedding Wardrobe Matrix) ────────────────────────────────────────
export const mission = {
  createWedding: (payload) =>
    request('/mission/wedding/create', { method: 'POST', body: JSON.stringify(payload) }),

  get: (missionId) => request(`/mission/wedding/${missionId}`),

  orchestrate: (missionId) =>
    request(`/mission/wedding/${missionId}/orchestrate`, { method: 'POST' }),

  rejectSlot: (missionId, eventId, memberId, reason, rejectedByName) =>
    request(`/mission/wedding/${missionId}/reject-slot`, {
      method: 'POST', body: JSON.stringify({ eventId, memberId, reason, rejectedByName }),
    }),

  resolveDeadlock: (missionId, eventId, memberId, resolution) =>
    request(`/mission/wedding/${missionId}/resolve-deadlock`, {
      method: 'POST', body: JSON.stringify({ eventId, memberId, resolution }),
    }),

  resolveEscalation: (missionId, eventId, memberId, action, value) =>
    request(`/mission/wedding/${missionId}/resolve-escalation`, {
      method: 'POST', body: JSON.stringify({ eventId, memberId, action, value }),
    }),

  planOnly: (type, details) =>
    request('/mission/plan-only', { method: 'POST', body: JSON.stringify({ type, details }) }),
};

// ── Demo Seeding ─────────────────────────────────────────────────────────────
export const demo = {
  seed: (type) => request('/demo/seed', { method: 'POST', body: JSON.stringify({ type }) }),
  seedAll: () => request('/demo/seed-all', { method: 'POST' }),
};

