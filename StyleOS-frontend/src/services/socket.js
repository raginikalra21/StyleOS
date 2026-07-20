import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function connectSocket(userId) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    s.emit('join:user', { userId });
  }
  return s;
}

export function joinCollab(shareToken, name) {
  const s = getSocket();
  s.emit('join:collab', { shareToken, name });
}

export function leaveCollab(shareToken) {
  const s = getSocket();
  s.emit('leave:collab', { shareToken });
}

export function joinMission(missionId) {
  const s = getSocket();
  s.emit('join:mission', { missionId });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ── Co-presence ladder (Tiers 1-4, 6) ──────────────────────────────────────
// Thin emit wrappers so CollabCartPage.js doesn't spell out raw event names
// inline. All of these are live-only — nothing here is durable (see
// StyleOS-backend/src/sockets/index.js's header comment).

// Tier 1 — presence & awareness
export function emitViewingItem(shareToken, itemId) {
  getSocket().emit('viewing:item', { shareToken, itemId });
}
export function emitCursorMove(shareToken, itemId, xPct, yPct) {
  getSocket().emit('cursor:move', { shareToken, itemId, xPct, yPct });
}
export function emitReadItem(shareToken, itemId) {
  getSocket().emit('read:item', { shareToken, itemId });
}

// Tier 2 — ambient expression
export function emitReactionBurst(shareToken, itemId, emoji) {
  getSocket().emit('reaction:burst', { shareToken, itemId, emoji });
}
export function emitChatMessage(shareToken, text) {
  getSocket().emit('chat:message', { shareToken, text });
}

// Tier 3 — shared viewing
export function emitPresenterStart(shareToken) {
  getSocket().emit('follow:presenter:start', { shareToken });
}
export function emitPresenterStop(shareToken) {
  getSocket().emit('follow:presenter:stop', { shareToken });
}
export function emitSpotlightSet(shareToken, itemId) {
  getSocket().emit('spotlight:set', { shareToken, itemId });
}
export function emitSpotlightClear(shareToken) {
  getSocket().emit('spotlight:clear', { shareToken });
}

// Tier 4 — shared control
export function emitControlRequest(shareToken) {
  getSocket().emit('control:request', { shareToken });
}
export function emitControlGrant(shareToken, socketId) {
  getSocket().emit('control:grant', { shareToken, socketId });
}
export function emitControlRevoke(shareToken) {
  getSocket().emit('control:revoke', { shareToken });
}

// Screen-share requests (reverse direction of "Show my screen") + ending
// the live session — Collab Cart Complete Session UX Spec §3c/§3d/§4b.
export function emitScreenRequest(shareToken) {
  getSocket().emit('screen:request', { shareToken });
}
export function emitScreenGrant(shareToken, socketId) {
  getSocket().emit('screen:grant', { shareToken, socketId });
}
export function emitSessionEnd(shareToken) {
  getSocket().emit('session:end', { shareToken });
}
