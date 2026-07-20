/**
 * Deterministic catalog hard-filtering — color/category normalization and
 * the exact-match rules that keep the LLM from ever silently choosing a
 * product outside what the user actually asked for. Mirrors the
 * normalization already applied when the catalog was seeded, so a
 * user's "grey" and the DB's "Grey" are guaranteed to line up.
 */

const COLOUR_NORM = {
  'grey': 'Grey', 'gray': 'Grey', 'charcoal': 'Grey',
  'black': 'Black',
  'navy blue': 'Navy Blue', 'navy': 'Navy Blue',
  'dark blue': 'Dark Blue',
  'blue': 'Blue', 'light blue': 'Light Blue', 'sky blue': 'Light Blue',
  'off white': 'Off White', 'cream': 'Off White',
  'white': 'White',
  'red': 'Red',
  'maroon': 'Maroon', 'burgundy': 'Maroon', 'wine': 'Maroon',
  'mustard': 'Mustard',
  'green': 'Green', 'olive': 'Olive', 'khaki': 'Olive',
  'pink': 'Pink', 'purple': 'Purple',
  'orange': 'Orange', 'peach': 'Peach',
  'brown': 'Brown', 'beige': 'Beige', 'tan': 'Beige',
  'gold': 'Gold', 'silver': 'Silver',
  'multi': 'Multi', 'multicolour': 'Multi', 'multicolor': 'Multi',
  'yellow': 'Yellow',
};

/** Normalizes one free-text color word to the catalog's canonical value. */
function normalizeColor(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (COLOUR_NORM[key]) return COLOUR_NORM[key];
  // Unknown word — title-case it rather than dropping it, so an unusual
  // but valid color ("Teal") still participates in filtering.
  return String(raw).trim().replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeColors(rawColors) {
  return [...new Set((rawColors || []).map(normalizeColor).filter(Boolean))];
}

module.exports = { normalizeColor, normalizeColors, COLOUR_NORM };
