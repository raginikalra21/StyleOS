/**
 * Cultural constraint layer for the Wedding Wardrobe Matrix — an honest MVP
 * mapping across a few communities, not deep cultural research. Say so if
 * asked in a demo Q&A rather than overselling its depth.
 */
const COMMUNITY_EVENT_GARMENTS = {
  Punjabi: {
    Mehendi:   { Women: ['Kurtas'],                      Men: ['Kurtas'] },
    Haldi:     { Women: ['Kurtas'],                       Men: ['Kurtas'] },
    Sangeet:   { Women: ['Lehenga Choli', 'Kurtas'],       Men: ['Kurtas'] },
    Wedding:   { Women: ['Lehenga Choli'],                 Men: ['Sherwanis', 'Kurtas'] },
    Reception: { Women: ['Sarees', 'Lehenga Choli'],       Men: ['Sherwanis', 'Kurtas'] },
  },
  Bengali: {
    Mehendi:   { Women: ['Kurtas'],                       Men: ['Kurtas'] },
    Haldi:     { Women: ['Sarees', 'Kurtas'],              Men: ['Kurtas'] },
    Sangeet:   { Women: ['Lehenga Choli', 'Sarees'],       Men: ['Kurtas'] },
    Wedding:   { Women: ['Sarees'],                        Men: ['Sherwanis', 'Kurtas'] },
    Reception: { Women: ['Sarees'],                        Men: ['Sherwanis', 'Kurtas'] },
  },
  Nikah: {
    Mehendi:   { Women: ['Kurtas'],                       Men: ['Kurtas'] },
    Wedding:   { Women: ['Lehenga Choli', 'Kurtas'],       Men: ['Sherwanis', 'Kurtas'] },
    Reception: { Women: ['Sarees', 'Lehenga Choli'],       Men: ['Sherwanis', 'Kurtas'] },
  },
  Tamil: {
    Mehendi:   { Women: ['Kurtas'],                       Men: ['Kurtas'] },
    Wedding:   { Women: ['Sarees'],                        Men: ['Sherwanis', 'Kurtas'] },
    Reception: { Women: ['Sarees'],                        Men: ['Sherwanis', 'Kurtas'] },
  },
};

const DEFAULT_EVENT_GARMENTS = {
  Women: ['Kurtas', 'Lehenga Choli', 'Sarees'],
  Men: ['Kurtas', 'Sherwanis'],
};

// Rough, fixed shares — Wedding/Reception weighted higher than the smaller
// pre-functions. Normalised against whichever events a mission actually has.
const EVENT_SHARE = {
  Mehendi: 0.10, Haldi: 0.10, Sangeet: 0.20, Wedding: 0.38, Reception: 0.22,
};
const DEFAULT_EVENT_SHARE = 0.2;

const EVENT_PALETTES = {
  Mehendi: ['Yellow', 'Green', 'Mustard'],
  Haldi: ['Yellow', 'Mustard', 'Orange'],
  Sangeet: ['Pink', 'Purple', 'Maroon', 'Gold'],
  Wedding: ['Red', 'Maroon', 'Gold'],
  Reception: ['Navy Blue', 'Silver', 'Black', 'Gold'],
};
const DEFAULT_PALETTE = ['Red', 'Gold', 'Maroon'];

function genderBucket(gender) {
  if (gender === 'Women' || gender === 'Girls') return 'Women';
  return 'Men';
}

function allowedArticleTypes(community, eventName, gender) {
  const bucket = genderBucket(gender);
  const byEvent = COMMUNITY_EVENT_GARMENTS[community]?.[eventName];
  return byEvent?.[bucket] || DEFAULT_EVENT_GARMENTS[bucket];
}

function eventShares(eventNames) {
  const raw = eventNames.map(name => EVENT_SHARE[name] ?? DEFAULT_EVENT_SHARE);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const shares = {};
  eventNames.forEach((name, i) => { shares[name] = raw[i] / sum; });
  return shares;
}

function defaultPalette(eventName) {
  return EVENT_PALETTES[eventName] || DEFAULT_PALETTE;
}

const BRIGHT_COLOURS = ['Pink', 'Yellow', 'Gold', 'Orange', 'Peach', 'Mustard', 'White', 'Light Blue'];
const DARK_COLOURS = ['Maroon', 'Navy Blue', 'Black', 'Purple', 'Grey', 'Dark Blue', 'Olive', 'Brown'];
const KNOWN_COLOURS = ['red', 'maroon', 'navy blue', 'black', 'purple', 'grey', 'gold', 'pink',
  'yellow', 'green', 'blue', 'orange', 'white', 'beige', 'olive', 'brown', 'silver', 'mustard'];

/**
 * Turns a rejection reason ("this pink is too bright, something darker")
 * into a concrete replacement palette — deterministic and fast, no LLM
 * round-trip, because this runs mid-veto in the single most important
 * live demo beat and cannot afford to be slow or unpredictable.
 */
function adjustPaletteForReason(reason, originalPalette, rejectedColour) {
  const base = (originalPalette || []).filter(c => c !== rejectedColour);
  if (!reason) return base.length ? base : (originalPalette || []);

  const r = reason.toLowerCase();
  const rejectedLc = (rejectedColour || '').toLowerCase();

  // Only trust an explicit colour mention if it isn't just the color being
  // complained about ("this PINK is too bright" must not re-select pink).
  const explicit = KNOWN_COLOURS.find(c => r.includes(c) && c !== rejectedLc);
  if (explicit) {
    return [explicit.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')];
  }

  if (/bright|loud|flashy|too light|pastel/.test(r)) {
    const darker = base.filter(c => DARK_COLOURS.includes(c));
    return darker.length ? darker : DARK_COLOURS;
  }
  if (/\bdark\b|dull|boring|drab|too heavy/.test(r)) {
    const lighter = base.filter(c => BRIGHT_COLOURS.includes(c));
    return lighter.length ? lighter : BRIGHT_COLOURS;
  }
  return base.length ? base : (originalPalette || []);
}

// CLAUDE Part 2 / Page 55 — the Council has to absorb real family friction,
// not just clean attribute complaints. "This isn't nice enough" carries no
// color or budget word at all, but it's a completely valid, common
// objection (English and Hindi-English code-mixed) that the parser must
// not silently drop or misread as a color complaint.
const QUALITY_SIGNALS = [
  /not\s+(nice|good|special|classy|elegant|premium|fancy)\s+enough/i,
  /isn'?t\s+(nice|good|special|classy|elegant|premium|fancy)\s+enough/i,
  /too\s+(plain|simple|basic|ordinary)/i,
  /looks?\s+cheap/i,
  /cheaper\s+than/i,
  /not\s+worth\s+(it|the\s+money|the\s+price)/i,
  /log\s+kya\s+kahenge/i,
  /accha\s+nahi/i,
  /theek\s+nahi/i,
  /not\s+special/i,
  /disappointing/i,
  /underwhelming/i,
  /doesn'?t\s+feel\s+special/i,
  /should(n'?t)?\s+look\s+(cheaper|worse|less)/i,
];

/**
 * Classifies a rejection reason as a quality/prestige objection — one with
 * no explicit color/attribute complaint, just "this isn't good enough for
 * the occasion." Independent of adjustPaletteForReason: a reason can be
 * both a color complaint AND a quality complaint at once.
 */
function classifyObjection(reason) {
  const r = (reason || '').toLowerCase();
  return { isQuality: QUALITY_SIGNALS.some(re => re.test(r)) };
}

module.exports = {
  COMMUNITY_EVENT_GARMENTS, DEFAULT_EVENT_GARMENTS, allowedArticleTypes, eventShares,
  defaultPalette, genderBucket, adjustPaletteForReason, classifyObjection,
};
