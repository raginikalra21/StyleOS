/**
 * Deterministic constraint validation — the code-level backstop the LLM
 * cannot override. Per the project's architecture: the LLM parses messy
 * language into a plan, but code decides whether that plan is actually
 * safe to act on. Gender is the sharpest example — a small local model
 * will confidently claim "explicit" even when nothing in the text says
 * so, so it cannot be the sole authority on its own confidence.
 */

const MALE_SIGNALS = [
  /\bmen'?s\b/i, /\bman'?s\b/i, /\bfor him\b/i, /\bfor my (brother|dad|father|husband|son|boyfriend)\b/i,
  /\bgroom\b/i, /\bhis\b/i, /\bboy'?s\b/i, /\bmale\b/i, /\bguys?\b/i, /\bmr\.?\b/i,
];
const FEMALE_SIGNALS = [
  /\bwomen'?s\b/i, /\bwoman'?s\b/i, /\bfor her\b/i, /\bfor my (sister|mom|mother|wife|daughter|girlfriend)\b/i,
  /\bbride\b/i, /\bhers\b/i, /\bgirl'?s\b/i, /\bfemale\b/i, /\bsaree\b/i, /\blehenga\b/i, /\bms\.?\b/i,
];

/**
 * Scans the RAW goal text (not the LLM's interpretation of it) for
 * explicit gender signals. Returns { gender, confidence } — confidence
 * is only ever "explicit" or "unknown", never "inferred", because a
 * regex either found a real word or it didn't; anything softer than
 * that is exactly the guessing this function exists to prevent.
 */
function detectExplicitGender(goalText) {
  const text = goalText || '';
  const hasMale = MALE_SIGNALS.some(re => re.test(text));
  const hasFemale = FEMALE_SIGNALS.some(re => re.test(text));

  if (hasMale && !hasFemale) return { gender: 'Men', confidence: 'explicit' };
  if (hasFemale && !hasMale) return { gender: 'Women', confidence: 'explicit' };
  // Both or neither present — genuinely ambiguous, must ask.
  return { gender: null, confidence: 'unknown' };
}

/**
 * The authoritative gender resolution for a raw goal text. Never trusts the
 * LLM's own gender_confidence claim — always re-derives it from the raw
 * text. If the LLM and the deterministic scan disagree on which gender,
 * the deterministic scan wins, because it's grounded in an actual word
 * in the user's text rather than a model's guess.
 */
function resolvePlanGender(goalText) {
  const detected = detectExplicitGender(goalText);
  if (detected.confidence === 'explicit') {
    return { gender: detected.gender, gender_confidence: 'explicit' };
  }
  // Deterministic scan found nothing — refuse to trust the LLM's own
  // "explicit"/"inferred" claim no matter what it says.
  return { gender: null, gender_confidence: 'unknown' };
}

/**
 * Resolves a direct behavioral answer to StyleOS's own clarifying question
 * ("Men" / "Women" chip tap or free-typed reply). A direct answer to our
 * own question is definitionally explicit — no regex scan needed, but we
 * still validate it actually says Men or Women rather than trusting an
 * arbitrary free-text reply blindly.
 */
function resolveClarifiedGender(answerText) {
  const text = (answerText || '').trim();
  if (/^men'?s?$/i.test(text) || /\bmen\b/i.test(text)) return { gender: 'Men', gender_confidence: 'explicit' };
  if (/^wom(a|e)n'?s?$/i.test(text) || /\bwomen\b/i.test(text)) return { gender: 'Women', gender_confidence: 'explicit' };
  // Free-text answer didn't clearly say Men or Women — fall back to the
  // same deterministic scan used on the original goal text.
  return resolvePlanGender(text);
}

module.exports = { detectExplicitGender, resolvePlanGender, resolveClarifiedGender };
