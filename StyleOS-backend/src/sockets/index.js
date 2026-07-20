/**
 * Socket.io event handlers
 * Rooms:
 *   user_{userId}         — personal room for agent progress events
 *   cart_{cartId}         — room for cart updates
 *   collab_{shareToken}   — room for Squad Cart real-time collaboration
 *   mission_{missionId}   — room for Wedding Matrix updates
 *   party_{shareToken}    — room for Clash Engine clash alerts
 *
 * Collab co-presence (Tiers 1-4, 6 of the ladder) lives entirely in-memory,
 * keyed by shareToken. It is intentionally NOT persisted — presence,
 * cursors, "who's viewing what", and floor-control are live-only concepts
 * that reset when the server restarts or everyone leaves. Anything that
 * genuinely needs to survive a refresh (reactions, votes, payer locks,
 * cart contents) already lives in Oracle via the existing collab.js routes.
 */

// shareToken -> { members: Map<socketId, {name, viewingItemId, isTyping}>,
//                 presenterSocketId, spotlightItemId, controllerSocketId,
//                 chatHistory: [{socketId, name, text, ts}] }
const rooms = new Map();

function getRoom(token) {
  let room = rooms.get(token);
  if (!room) {
    room = { members: new Map(), presenterSocketId: null, spotlightItemId: null, controllerSocketId: null, chatHistory: [] };
    rooms.set(token, room);
  }
  return room;
}

function rosterOf(room) {
  return [...room.members.entries()].map(([socketId, m]) => ({
    socketId, name: m.name, viewingItemId: m.viewingItemId || null,
  }));
}

module.exports = function registerSockets(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join personal room (called right after login on frontend)
    socket.on('join:user', ({ userId }) => {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined personal room`);
    });

    // Join cart room
    socket.on('join:cart', ({ cartId }) => {
      socket.join(`cart_${cartId}`);
    });

    // Join collab session room. `name` is who's looking — the shopper's own
    // view of a Squad Cart / Council listens for this to show "Mom is
    // looking..." live, instead of only finding out once a reaction lands.
    // Also seeds this socket into the in-memory presence roster (Tier 1) so
    // everyone already in the room can see who else just showed up, and the
    // new joiner gets the full current picture (roster + presenter +
    // spotlight + controller + recent chat) in one shot.
    socket.on('join:collab', ({ shareToken, name }) => {
      socket.join(`collab_${shareToken}`);
      socket.data.collabName = name || 'Someone';
      socket.data.collabToken = shareToken;

      const room = getRoom(shareToken);
      room.members.set(socket.id, { name: socket.data.collabName, viewingItemId: null, isTyping: false });

      socket.emit('presence:roster', {
        members: rosterOf(room),
        presenterSocketId: room.presenterSocketId,
        spotlightItemId: room.spotlightItemId,
        controllerSocketId: room.controllerSocketId,
        chatHistory: room.chatHistory.slice(-30),
      });

      socket.to(`collab_${shareToken}`).emit('member:connected', { socketId: socket.id });
      socket.to(`collab_${shareToken}`).emit('presence:join', { socketId: socket.id, name: socket.data.collabName });
    });

    // Join a wedding mission room — everyone watching the matrix fill live
    socket.on('join:mission', ({ missionId }) => {
      socket.join(`mission_${missionId}`);
    });

    // CO-ATTENDEE mode — everyone in the party room sees clash alerts live
    // as carts are attached/updated (routes/party.js).
    socket.on('join:party', ({ shareToken }) => {
      socket.join(`party_${shareToken}`);
    });

    // Leave collab session
    socket.on('leave:collab', ({ shareToken }) => {
      socket.leave(`collab_${shareToken}`);
      cleanupPresence(shareToken, socket);
    });

    // Typing indicator in collab (for comments)
    socket.on('collab:typing', ({ shareToken, userName }) => {
      socket.to(`collab_${shareToken}`).emit('collab:typing', { userName });
    });

    // ── Tier 1 — presence & awareness ──────────────────────────────────
    // "Viewing this item" — broadcast which product this socket currently
    // has open, so everyone else can see it live (and so a presenter's
    // followers know what to sync to, Tier 3).
    socket.on('viewing:item', ({ shareToken, itemId }) => {
      const room = getRoom(shareToken);
      const member = room.members.get(socket.id);
      if (member) member.viewingItemId = itemId || null;
      socket.to(`collab_${shareToken}`).emit('presence:viewing', { socketId: socket.id, itemId: itemId || null });
    });

    // Live cursor position, normalized 0-1 within whatever container the
    // client is tracking. Purely visual, throttled client-side — never
    // persisted, never used for anything but "someone else is right here."
    socket.on('cursor:move', ({ shareToken, itemId, xPct, yPct }) => {
      socket.to(`collab_${shareToken}`).emit('presence:cursor', { socketId: socket.id, itemId, xPct, yPct });
    });

    // Read receipts — "seen by" on a given item.
    socket.on('read:item', ({ shareToken, itemId }) => {
      const name = socket.data.collabName || 'Someone';
      socket.to(`collab_${shareToken}`).emit('presence:read', { socketId: socket.id, name, itemId });
    });

    // ── Tier 2 — ambient expression ─────────────────────────────────────
    // Floating emoji burst — ephemeral and separate from the durable
    // love/skip/comment Reaction rows in Oracle (collab.js's /react). This
    // is pure ambient noise: "I'm here and I'm feeling something," not a
    // vote that feeds the convergence engine.
    socket.on('reaction:burst', ({ shareToken, itemId, emoji }) => {
      const name = socket.data.collabName || 'Someone';
      io.to(`collab_${shareToken}`).emit('presence:burst', { socketId: socket.id, name, itemId, emoji });
    });

    // Lightweight scoped chat — session-wide, ephemeral (kept only in this
    // room's in-memory ring buffer so a mid-session joiner sees recent
    // context, not a durable per-item comment).
    socket.on('chat:message', ({ shareToken, text }) => {
      if (!text || !text.trim()) return;
      const room = getRoom(shareToken);
      const name = socket.data.collabName || 'Someone';
      const msg = { socketId: socket.id, name, text: text.trim().slice(0, 300), ts: Date.now() };
      room.chatHistory.push(msg);
      if (room.chatHistory.length > 50) room.chatHistory.shift();
      socket.to(`collab_${shareToken}`).emit('chat:message', msg);
    });

    // ── Tier 3 — shared viewing ──────────────────────────────────────────
    // Presenter handoff — whoever holds it drives "follow me" navigation
    // for anyone who's opted to follow along (frontend-side choice).
    socket.on('follow:presenter:start', ({ shareToken }) => {
      const room = getRoom(shareToken);
      room.presenterSocketId = socket.id;
      const name = socket.data.collabName || 'Someone';
      io.to(`collab_${shareToken}`).emit('presence:presenter', { socketId: socket.id, name });
    });

    socket.on('follow:presenter:stop', ({ shareToken }) => {
      const room = getRoom(shareToken);
      if (room.presenterSocketId === socket.id) {
        room.presenterSocketId = null;
        io.to(`collab_${shareToken}`).emit('presence:presenter', { socketId: null, name: null });
      }
    });

    // Spotlight — pin one item into everyone's attention as a one-shot
    // moment, distinct from continuous follow-me.
    socket.on('spotlight:set', ({ shareToken, itemId }) => {
      const room = getRoom(shareToken);
      room.spotlightItemId = itemId;
      const name = socket.data.collabName || 'Someone';
      io.to(`collab_${shareToken}`).emit('presence:spotlight', { itemId, byName: name });
    });

    socket.on('spotlight:clear', ({ shareToken }) => {
      const room = getRoom(shareToken);
      room.spotlightItemId = null;
      io.to(`collab_${shareToken}`).emit('presence:spotlight', { itemId: null, byName: null });
    });

    // ── Tier 4 — shared control (request/grant, co-editing) ─────────────
    // A guest asks to help pick; the room broadcasts the request so the
    // owner (or whoever's watching) can grant or ignore it.
    socket.on('control:request', ({ shareToken }) => {
      const name = socket.data.collabName || 'Someone';
      socket.to(`collab_${shareToken}`).emit('control:requested', { socketId: socket.id, name });
    });

    socket.on('control:grant', ({ shareToken, socketId }) => {
      const room = getRoom(shareToken);
      room.controllerSocketId = socketId;
      const member = room.members.get(socketId);
      io.to(`collab_${shareToken}`).emit('control:granted', { socketId, name: member?.name || 'Someone' });
    });

    socket.on('control:revoke', ({ shareToken }) => {
      const room = getRoom(shareToken);
      const previous = room.controllerSocketId;
      room.controllerSocketId = null;
      io.to(`collab_${shareToken}`).emit('control:revoked', { socketId: previous });
    });

    // ── Screen-share requests — the reverse direction of "Show my screen."
    // A joiner asks to see the owner's screen; whoever grants it becomes
    // presenter (if not already) and the room is told this specific person
    // is now following, same mechanism as Tier 3's follow-me.
    socket.on('screen:request', ({ shareToken }) => {
      const name = socket.data.collabName || 'Someone';
      socket.to(`collab_${shareToken}`).emit('screen:requested', { socketId: socket.id, name });
    });

    socket.on('screen:grant', ({ shareToken, socketId }) => {
      io.to(`collab_${shareToken}`).emit('screen:granted', { socketId });
    });

    // ── End session — the room has a lifespan; the owner can close it early.
    socket.on('session:end', ({ shareToken }) => {
      const name = socket.data.collabName || 'Someone';
      io.to(`collab_${shareToken}`).emit('session:ended', { byName: name });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      if (socket.data.collabToken) {
        cleanupPresence(socket.data.collabToken, socket);
      }
    });
  });

  function cleanupPresence(shareToken, socket) {
    const room = rooms.get(shareToken);
    socket.to(`collab_${shareToken}`).emit('presence:leave', { socketId: socket.id, name: socket.data.collabName });
    if (!room) return;
    room.members.delete(socket.id);
    if (room.presenterSocketId === socket.id) {
      room.presenterSocketId = null;
      socket.to(`collab_${shareToken}`).emit('presence:presenter', { socketId: null, name: null });
    }
    if (room.controllerSocketId === socket.id) {
      room.controllerSocketId = null;
      socket.to(`collab_${shareToken}`).emit('control:revoked', { socketId: socket.id });
    }
    if (room.members.size === 0) rooms.delete(shareToken);
  }
};
