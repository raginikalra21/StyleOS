/**
 * Ownership verification — closes the IDOR gap found in the fresh-eyes
 * audit. `auth` only proves a request carries a valid token for SOME user;
 * it says nothing about whether that user owns the specific cart/mission
 * being read or written. Every route that scopes a resource by :id must
 * also check the resource's actual owner against req.user.id — being hard
 * to guess is not the same thing as being authorized.
 */

function cartOwnerId(cart) {
  return cart?.OWNER_ID || cart?.ownerId || cart?.owner_id;
}

function missionOwnerId(mission) {
  return mission?.USER_ID || mission?.userId || mission?.user_id;
}

/** Returns true if the cart exists and belongs to this user. */
function ownsCart(cart, userId) {
  return !!cart && cartOwnerId(cart) === userId;
}

/** Returns true if the mission exists and belongs to this user. */
function ownsMission(mission, userId) {
  return !!mission && missionOwnerId(mission) === userId;
}

module.exports = { ownsCart, ownsMission, cartOwnerId, missionOwnerId };
