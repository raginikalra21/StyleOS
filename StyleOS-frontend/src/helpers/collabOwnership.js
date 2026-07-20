// The real cart/mission owner, not just "any logged-in StyleOS user" —
// whoever built the wardrobe might open the invite link while already
// signed into their OWN separate account, and without this check they'd
// see the owner's controls instead of the joiner's. Split into its own
// file (not inlined in CollabCartPage.js) to keep that file's own
// line count under the babel-eslint rules-of-hooks size threshold — see
// useCollabPresence.js's header comment for the full story.
export function getIsActualOwner(mode, cart, missionInfo, effectiveUser) {
  if (!effectiveUser) return false;
  const ownerId = mode === 'mission'
    ? (missionInfo?.mission?.USER_ID || missionInfo?.mission?.userId)
    : (cart?.OWNER_ID || cart?.ownerId);
  return effectiveUser.id === ownerId;
}
