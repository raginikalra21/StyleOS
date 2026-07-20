/**
 * LLM Service — uses Ollama locally (100% free)
 * Ollama exposes an OpenAI-compatible API at localhost:11434
 * Model: qwen2.5:7b — multilingual, understands Hindi/English/Punjabi/code-mixed
 */

const { parseGoalFallback, parseRefinementFallback, reconcileFeedbackFallback, extractBudget } = require('./demo_fallbacks');
const { deterministicCopy } = require('./grounded_copy');
const { deterministicOutfitCompatibility } = require('./outfit_assembler');

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
// Demo resilience (CLAUDE.md Invariant 7): the primary demo must run even
// if the remote LLM or network is unavailable. MOCK_LLM=true skips Ollama
// entirely; a hung/slow Ollama also falls back automatically via the
// timeout below rather than stalling the whole demo.
const MOCK_LLM = process.env.MOCK_LLM === 'true';
const CHAT_TIMEOUT_MS = 20000;

async function chat(messages, options = {}) {
  if (MOCK_LLM) throw new Error('MOCK_LLM=true — skipping live LLM call');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    return data.message.content;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse a natural language shopping goal into a structured plan.
 * Understands Hindi, English, Punjabi, code-mixed input.
 *
 * `genderHint` — when the caller (routes/agent.js) has already resolved
 * gender deterministically (from explicit text or the user's direct answer
 * to our clarifying question), it's passed in here so item generation
 * picks gender-appropriate garments (e.g. sherwani/kurta not lehenga for
 * Men) instead of guessing generic items before gender was known.
 */
async function parseGoal(goalText, wardrobeContext = '', genderHint = null) {
  try {
    return await parseGoalViaLLM(goalText, wardrobeContext, genderHint);
  } catch (err) {
    console.log('parseGoal: LLM path failed, using deterministic fallback:', err.message.slice(0, 80));
    return parseGoalFallback(goalText, genderHint);
  }
}

async function parseGoalViaLLM(goalText, wardrobeContext, genderHint) {
  const systemPrompt = `You are a fashion shopping planner for an Indian e-commerce platform.
The user will describe a shopping goal in English, Hindi, Punjabi, or mixed language.
Extract a structured shopping plan as JSON.

GENDER IS THE MOST IMPORTANT FIELD — get this right or the whole cart is wrong.
Gender is decided ONCE at the top level for the whole mission, never per item.${genderHint ? `
The user has ALREADY CONFIRMED this wardrobe is for: ${genderHint}. Use "gender": "${genderHint}",
"gender_confidence": "explicit", and choose item types appropriate for that gender
(e.g. sherwani/kurta for Men at a wedding, not lehenga/saree).` : `
- Explicit signals ("men's", "for my brother", "groom", "his") -> gender_confidence "explicit".
- Strong contextual signals ("saree", "lehenga" without a stated wearer, "bride") -> gender_confidence "inferred".
- If the goal names garments that are gender-neutral in phrasing (tees, jeans, hoodie,
  "college wardrobe", "wedding outfit") with NO signal of who is wearing them —
  do not guess. Set "gender": null and "gender_confidence": "unknown". This is
  the correct, safe answer far more often than a guess. Never default to Men.`}

IMPORTANT RULES:
- Infer context intelligently: "hostel Delhi" means easy-wash, dark colors, wrinkle-resistant
- "Bangalore August" means avoid linen, prefer wrinkle-free due to humidity
- Wedding types matter: Punjabi = lehenga/salwar, Tamil = silk saree/dhoti, Nikah = sharara/kurta
- "I hate ironing" = wrinkle-free fabrics only
- Budget should be distributed realistically across items
- Always return valid JSON, nothing else${wardrobeContext ? `

The user already has these approved wardrobes from previous missions:
${wardrobeContext}
Use this for continuity — e.g. "winter version of X" should keep a similar palette/style adjusted for the new context. Avoid recommending items identical to ones they already own (same type + colour) unless they're explicitly restocking basics like tees, jeans, socks, or innerwear.` : ''}`;

  const userPrompt = `Shopping goal: "${goalText}"

The "items" array below has 2 entries only as a FORMAT example — it is not a
cap. If the goal mentions 4 distinct kinds of garment (e.g. tees, cargos,
jeans, hoodie), the "items" array in your answer must have 4 entries, one
per garment kind, each with its own quantity. Never collapse multiple
requested garment types into a single item. Items do NOT carry their own
gender — "gender" lives once at the top level of the response.

Return ONLY this JSON structure:
{
  "gender": "Men",
  "gender_confidence": "explicit",
  "items": [
    {
      "type": "oversized tee",
      "quantity": 3,
      "budget": 1200,
      "occasion": "Casual",
      "colors": ["black", "grey"],
      "fabric_preference": "cotton",
      "avoid": ["slim fit", "logos"],
      "priority": 1
    },
    {
      "type": "cargo pants",
      "quantity": 2,
      "budget": 2400,
      "occasion": "Casual",
      "colors": ["black", "grey"],
      "fabric_preference": "cotton",
      "avoid": [],
      "priority": 2
    }
  ],
  "context": {
    "life_stage": "joining college",
    "city": "Delhi",
    "season": "Summer",
    "occasion_type": "daily college",
    "cultural_notes": "",
    "storage_constraints": "hostel, limited space",
    "laundry_notes": "weekly laundry, dark colors preferred"
  },
  "deadline": "2025-08-15",
  "total_budget": 15000,
  "outfit_goal": "15+ mix and match outfits",
  "summary": "one sentence summary of the shopping mission"
}

Remember: "gender": "Men" above is a FORMAT example only. Decide the real
value from the actual goal text — and if it's genuinely ambiguous, the
correct output is "gender": null, "gender_confidence": "unknown".`;

  const response = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.2 });

  // Extract JSON from response (model might wrap it in markdown)
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM did not return valid JSON');
  const plan = JSON.parse(jsonMatch[0]);

  // Every item inherits the plan-level gender — this is the one place gender
  // is decided, so a single resolved value can never be lost or overridden
  // per item further down the pipeline.
  if (plan.items) {
    plan.items = plan.items.map(item => ({ ...item, gender: plan.gender || item.gender }));
  }

  // Budget cross-check — the same "never trust the model's own claim"
  // discipline already applied to gender. Verified live during the audit
  // pass: a 7B local model asked for "5 outfits under Rs 500" confidently
  // returned total_budget: 6000, and separately mis-extracted a
  // romanized-Hindi "budget 10000" as 3600 — both silently wrong, neither
  // an error. A deterministic regex scan of the RAW text is authoritative
  // whenever it finds a clear stated number; the LLM's own estimate is
  // only trusted when the user genuinely didn't state one.
  const statedBudget = extractBudget(goalText);
  if (statedBudget && plan.total_budget !== statedBudget) {
    plan.total_budget = statedBudget;
  }

  return plan;
}

/**
 * Generate a seller copilot explanation for cart items.
 * (Used in the agent's recommendation step)
 */
async function generateCartRationale(cartItems, goal) {
  try {
    const itemSummary = cartItems.map(item =>
      `- ${item.product.title} by ${item.product.brand} | ₹${item.product.price} | ${item.product.baseColour} | ${item.product.fabric}`
    ).join('\n');

    const response = await chat([
      {
        role: 'system',
        content: 'You are Kiya, a warm, sharp, practical fashion stylist. Describe ONLY the items in the provided list — never mention a color, category, or item not present in it. Be concise and specific. Max 3 sentences.',
      },
      {
        role: 'user',
        content: `Goal: "${goal}"\n\nSelected items:\n${itemSummary}\n\nWhy does this work?`,
      },
    ], { temperature: 0.5, maxTokens: 256 });

    return response.trim();
  } catch (err) {
    console.log('generateCartRationale: LLM path failed, using deterministic copy:', err.message.slice(0, 80));
    return deterministicCopy(cartItems, goal);
  }
}

/**
 * Reconcile Squad Cart feedback and determine what to change.
 * Understands Hindi/Punjabi voice note transcriptions.
 */
async function reconcileFeedback(cartItems, reactions) {
  try {
    return await reconcileFeedbackViaLLM(cartItems, reactions);
  } catch (err) {
    console.log('reconcileFeedback: LLM path failed, using deterministic fallback:', err.message.slice(0, 80));
    return reconcileFeedbackFallback(cartItems, reactions);
  }
}

async function reconcileFeedbackViaLLM(cartItems, reactions) {
  const reactionSummary = reactions.map(r =>
    `- Product: "${r.cartItem?.product?.title}" | User: ${r.user?.name} | Type: ${r.type} | Note: "${r.content || ''}"`
  ).join('\n');

  const itemSummary = cartItems.map(i =>
    `ID:${i.id} — ${i.product.title} (${i.product.brand}, ₹${i.product.price})`
  ).join('\n');

  const response = await chat([
    {
      role: 'system',
      content: `You are Kiya, re-planning a shared cart after family feedback — not offering a new recommendation, but re-solving the affected slots while preserving everything the family already approved.
Feedback may be in Hindi, English, Punjabi, or mixed, and it may be blunt or emotionally loaded, not just clean and structured — treat "this isn't nice enough", "too plain for what we're spending", "log kya kahenge", or "yeh accha nahi lag raha" with the same reliability as a clean complaint like "too bright, something darker". A blunt tone changes nothing about how you handle it.
Return a JSON array of actions to take on the cart.
Valid actions:
  "remove" — item should come out of the cart entirely.
  "swap_color" — same item, different color (only when a color/brightness complaint was actually made).
  "swap_upgrade" — a quality/prestige objection with NO explicit color or attribute given (e.g. "not nice enough", "too plain", "looks cheap", "not worth it") — re-solve toward a higher-rated, higher-priced-within-budget option instead of guessing a color change.
  "keep" — no change needed.
Never fabricate a reason. If you pick "swap_upgrade", say so honestly: "moved to a higher-rated option within budget", not an invented claim about fabric or craftsmanship you can't verify.
In the "reason" field, never say "I recommend" or "here's an alternate" — describe it as re-planning the affected item while the rest of the approved cart stays untouched.`,
    },
    {
      role: 'user',
      content: `Current cart items:\n${itemSummary}\n\nFamily feedback:\n${reactionSummary}\n\nReturn ONLY JSON array:\n[{"cartItemId": "uuid", "action": "remove|swap_color|swap_upgrade|keep", "reason": "brief reason", "colorPreference": "blue (if swap_color)"}]`,
    },
  ], { temperature: 0.2 });

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

/**
 * Check outfit compatibility across cart items.
 */
async function checkOutfitCompatibility(cartItems) {
  try {
    const items = cartItems.map(i =>
      `${i.product.articleType} | ${i.product.baseColour} | ${i.product.occasion}`
    ).join('\n');

    const response = await chat([
      {
        role: 'system',
        content: 'You are Kiya, a fashion stylist. Check if these items work together as a wardrobe. Return JSON only.',
      },
      {
        role: 'user',
        content: `Items:\n${items}\n\nReturn: {"compatible": true/false, "issues": ["issue1"], "combinations": [["item1", "item2", "item3"]]}`,
      },
    ], { temperature: 0.3, maxTokens: 512 });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { compatible: true, issues: [], combinations: [] };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.log('checkOutfitCompatibility: LLM path failed, using deterministic pairing:', err.message.slice(0, 80));
    return deterministicOutfitCompatibility(cartItems);
  }
}

/**
 * Refine a cart based on a live follow-up message from the shopper
 * ("darker", "no logos", "more oversized", "not this one"). Used by the
 * continuous refinement chat — the cart evolves instead of restarting.
 */
async function refineCart(cartItems, goalContext, message) {
  try {
    return await refineCartViaLLM(cartItems, goalContext, message);
  } catch (err) {
    console.log('refineCart: LLM path failed, using deterministic fallback:', err.message.slice(0, 80));
    return parseRefinementFallback(cartItems, message);
  }
}

async function refineCartViaLLM(cartItems, goalContext, message) {
  const itemSummary = cartItems.map(i =>
    `ID:${i.id} — ${i.product.title} (${i.product.brand}, ₹${i.product.price}, ${i.product.baseColour}, ${i.product.articleType})`
  ).join('\n');

  const response = await chat([
    {
      role: 'system',
      content: `You are Kiya, refining a customer's cart based on live feedback, the way an experienced in-store salesperson would.
Understand fashion language: "darker" = a darker shade of the same item type, "no logos" = remove or replace anything with visible branding, "more oversized" = looser fit, "vintage" = classic/retro style cues, "too bright" = a muted/neutral tone instead.
Only change items the message is actually about — everything else stays untouched. Do not restart the whole cart for one comment.
In the "reason" field, write in Kiya's warm, brief, specific voice — never "I recommend" or "here's an alternate", just state what changed and why.
Return ONLY a JSON array, nothing else.`,
    },
    {
      role: 'user',
      content: `Goal: "${goalContext}"

Current cart:
${itemSummary}

Customer says: "${message}"

Return ONLY JSON:
[{"cartItemId": "id", "action": "swap|remove", "reason": "short reason said in a friendly stylist voice", "newColour": "optional colour keyword to search for", "newKeyword": "optional style keyword to search the title for"}]`,
    },
  ], { temperature: 0.3 });

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

/**
 * Plan-stage-only mission (Diwali, Trip, etc.) — proves "missions are
 * configs on one engine" without building a second execution pipeline.
 * One LLM call, a structured household plan, no shopping, no cart.
 */
async function planMission(type, details) {
  const systemPrompt = `You are a household shopping planner for an Indian family occasion.
Given the occasion type and free-text details, produce a structured plan:
who in the household needs what, a per-person budget slice, a palette/style
note for the occasion, and a one-sentence summary. This is a plan to show
the shopper, not an executed cart — do not invent specific products.

CRITICAL — the example below has one household member and one generic
palette purely to show the JSON shape. Do NOT copy its content:
- If details mention a household size ("family of 4") or names roles,
  include one entry per person actually implied — infer reasonable roles
  (Dad, Mom, Son/Daughter, etc.) if only a count is given. Never return
  just one person when more are implied.
- The palette and garment notes MUST reflect the ACTUAL occasion's real
  regional character, not a default. Examples: Onam is Kerala — cream and
  gold Kasavu sarees/mundu, not generic "red and gold". Durga Puja is
  Bengali — red and white, Tant/Garad sarees. Bihu is Assamese — red and
  white Mekhela Chador. Pongal is Tamil — traditional cotton, yellow/
  mustard tones. Baisakhi is Punjabi — bright yellows and greens. Eid —
  pastel or rich kurtas/sharara, often green or white. Christmas — reds,
  greens, festive western-ethnic fusion. If unsure, reason about the
  occasion's actual region and tradition rather than defaulting to red/gold.
Always return valid JSON, nothing else.`;

  const userPrompt = `Occasion type: "${type}"
Details: "${details}"

Return ONLY this JSON structure (shape example only — see the rules above about not copying its content):
{
  "occasion": "${type}",
  "household": [
    { "member": "Mom", "notes": "region/occasion-appropriate garment and color notes", "budgetShare": 3500 },
    { "member": "Dad", "notes": "region/occasion-appropriate garment and color notes", "budgetShare": 3000 }
  ],
  "palette": ["<occasion-appropriate color>", "<occasion-appropriate color>"],
  "totalBudget": 15000,
  "timeline": "before <occasion>, <a plausible near-future date>",
  "summary": "one sentence describing the plan, naming the specific regional style"
}`;

  const response = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.5 });

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse plan response');
  return JSON.parse(jsonMatch[0]);
}

module.exports = { chat, parseGoal, parseGoalViaLLM, generateCartRationale, reconcileFeedback, checkOutfitCompatibility, refineCart, planMission };
