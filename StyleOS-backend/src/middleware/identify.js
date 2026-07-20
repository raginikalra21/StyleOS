const jwt = require('jsonwebtoken');
const { User, CollabSession, CollabMember } = require('../models');

/**
 * Resolves whoever is calling a /collab/:token route — a real logged-in
 * user (existing Bearer JWT) OR a guest who joined this specific session
 * with just a name (Section 3.2, "zero-friction join": the payer/owner has
 * an account and starts the mission, but the people whose opinion they
 * need should never hit a login wall to give it).
 *
 * Scoped ONLY to collab routes. A guest token is meaningless outside the
 * session it was issued for — it can't be used to bypass real auth
 * anywhere else in the app, and it grants no access to any other cart,
 * mission, or route.
 */
module.exports = async function identify(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      const user = await User.findById(payload.userId);
      if (user) {
        req.identity = { type: 'user', id: user.ID || user.id, name: user.NAME || user.name };
        req.user = req.identity;
        return next();
      }
    } catch { /* not a valid user token — fall through to guest check */ }
  }

  const guestToken = req.headers['x-guest-token'];
  const token = req.params.token;
  if (guestToken && token) {
    const session = await CollabSession.findByToken(token);
    if (session) {
      const sessionId = session.ID || session.id;
      const member = await CollabMember.findByGuestToken({ sessionId, guestToken });
      if (member) {
        req.identity = { type: 'guest', id: null, name: member.GUEST_NAME || member.guestName };
        return next();
      }
    }
  }

  return res.status(401).json({ error: 'Join this wardrobe first' });
};
