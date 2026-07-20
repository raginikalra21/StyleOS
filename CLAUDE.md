# StyleOS / Goal-Based AI Stylist: Master Context For Claude Code

This file is intentionally long. Read the whole file before writing code.

The purpose of this document is to stop Claude Code from drifting into a generic chatbot, a flat product grid, a pure pitch deck, or a random e-commerce clone. The project is a specific hackathon product with a specific emotional promise, technical architecture, demo path, and correctness bar.

If another prompt conflicts with this file, follow this file unless the user explicitly says otherwise in a newer message.

---

## Page 01 - The One-Sentence Truth

StyleOS is a goal-based AI stylist for Myntra-style shopping: the user describes a life goal in natural language, the AI converts that goal into strict shopping constraints, shops the catalog, builds a complete cart or wardrobe, invites family feedback inside the product, reconciles that feedback, and lets the user approve the final cart.

The user should not feel like they searched products. The user should feel like they described who they are trying to become for a moment in life, and the system quietly did the shopping work.

Primary demo promise:

```text
User: Starting college next month. Budget Rs 15,000.
Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie.
Black/grey only. Delhi. Hostel.

StyleOS: asks at most one useful clarifier, then builds an 8-item,
men's, black/grey, budget-correct wardrobe grouped as outfits,
with tappable cards, swaps, family review, and final approval.
```

The non-negotiable product law:

```text
The AI must never show or describe a product that violates the user's stated constraints.
```

If the user says men's, do not show women's items.

If the user says black/grey only, do not show blue, red, beige, olive, or multi-color items unless they are explicitly labeled as alternatives after an honest shortfall.

If the user gives a budget, every total must be computed from selected items in code.

If the catalog cannot satisfy the request, say so clearly and propose labeled alternatives.

---

## Page 02 - Product Name, Identity, And Positioning

Use `StyleOS` as the product name in code, copy, routes, docs, and UI unless the user asks for another brand.

Older docs may mention `FitLoop`. Treat that as an old or accidental artifact. The current product is StyleOS.

The stylist persona inside the user-facing chat should be named `Kiya` unless the user changes it. Kiya should feel warm, sharp, practical, and culturally aware. Do not make her a generic assistant. Do not overdo the personality. She should sound like a confident stylist who can do math.

The benchmark to beat is Myntra's Maya assistant. StyleOS should feel more grounded, more cart-native, and more useful than Maya:

- Maya-like: conversational fashion help.
- StyleOS advantage: strict constraint grounding, outfit intelligence, budget optimization, family collaboration, and final cart approval.

Judges should understand the difference in one line:

```text
Maya chats about fashion. StyleOS executes the shopping mission.
```

---

## Page 03 - Core User Insight

The product is built around a very Indian shopping behavior:

People do not always decide on Myntra. They browse on Myntra, add items to cart, take screenshots, send them to family or friends on WhatsApp, wait for opinions, return to Myntra, remove items, add alternatives, and repeat.

StyleOS keeps that entire loop inside the shopping experience.

This matters because fashion is not just personal taste. In India, especially for Gen Z and young adults, fashion decisions are often negotiated with parents, siblings, partners, friends, and context. "Will this work for college?" "Will Mom approve?" "Is this too loud for the wedding?" "Does this look too cheap?" "Can I wear this in hostel life?" These are not search filters. They are social and identity questions.

StyleOS should therefore solve three jobs:

1. Convert life goals into shopping plans.
2. Select products with strict grounding and budget math.
3. Let trusted people review and improve the cart without leaving the app.

Do not build this as a simple product recommendation page. Do not build this as a generic AI chat overlay. It is a shopping mission engine.

---

## Page 04 - Current Repository Reality

The workspace root is:

```text
D:\idea myantra
```

Important top-level folders:

```text
StyleOS-frontend/
StyleOS-backend/
data-pipeline/
FitLoop_Project_Document.md
SETUP.md
CLAUDE.md
```

The root itself is not currently a git repository. `StyleOS-frontend` has its own `.git` directory and already has many modified/untracked files. Do not revert or overwrite those existing user changes.

Current frontend stack:

```text
StyleOS-frontend
React 17
Create React App
React Router v6
Redux
plain CSS files
socket.io-client
```

Current backend stack:

```text
StyleOS-backend
Node.js
Express
Socket.io
Oracle DB through oracledb thin mode
Ollama local LLM
OpenAI package present for whisper/possible API use
```

Current data stack:

```text
data-pipeline
Python scripts for merging Myntra/fashion datasets
Oracle seeding
optional embeddings
raw CSV and image datasets
```

Important correction:

The pasted build prompt mentions Vite, React 18, Tailwind, and a client-only mock catalog. That was a useful phase prompt, but this repo has moved into a full-stack CRA plus Express plus Oracle implementation. Do not randomly migrate the stack to Vite or Tailwind. Preserve the current project unless the user explicitly asks for a migration.

---

## Page 05 - Existing Docs And How To Interpret Them

There are three important instruction sources:

1. `FitLoop_Project_Document.md`
   - A pitch and architecture document.
   - It describes the broad StyleOS vision: autonomous shopping, Squad Cart, Identity Preview, data pipeline, full-stack app, live demo.
   - Treat it as strategic context, not exact implementation truth.

2. The pasted Claude Code build prompt attached in the conversation.
   - A stricter build prompt for a mobile-first goal-based AI stylist.
   - It emphasizes hard filtering, mock LLM fallback, outfit groups, carousels, budget math, product sheets, swaps, and demo scripts.
   - Treat it as the behavioral correctness and UX bar.

3. This `CLAUDE.md`
   - The merged source of truth.
   - It resolves conflicts between the pitch doc, pasted prompt, and current codebase.
   - Follow this first.

Conflict resolution:

- If a doc says "client-only mock catalog" but the repo has a real backend and Oracle, keep the real backend.
- If a doc says "PostgreSQL" but the repo uses Oracle, keep Oracle unless asked to migrate.
- If a doc says "Tailwind" but the repo uses plain CSS, keep plain CSS and improve existing CSS.
- If current code allows constraint violations, fix the code. Existing code is not automatically correct.
- If current UI is less ambitious than the vision, upgrade the UI toward the vision without breaking the full-stack routes.

---

## Page 06 - What The Product Must Feel Like

The first screen should not feel like a form. It should feel like a stylist asking, "What are you trying to do with your life next?"

The user can type:

```text
Starting college next month. Budget Rs 15,000.
Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie.
Black/grey only. Delhi. Hostel.
```

StyleOS should respond by understanding the goal, asking only missing questions, and visibly assembling the wardrobe.

The emotional beats:

1. "It understood me."
2. "It did not show wrong items."
3. "It knows how outfits work together."
4. "The budget is real."
5. "I can change things without starting over."
6. "My family can react without screenshots."
7. "I can approve the cart."

Every screen and API should support those beats.

---

## Page 07 - Non-Negotiable Correctness Invariants

These invariants outrank animation, visual polish, model cleverness, and demo theatrics.

Invariant 1: Gender safety.

```text
If constraints.gender is Men:
  product.gender must be Men or Unisex.

If constraints.gender is Women:
  product.gender must be Women or Unisex.

If constraints.gender is not known:
  ask a clarifying question.
```

Do not infer gender from stereotypes if ambiguous. "Wedding outfit" is ambiguous. "College wardrobe" is ambiguous unless the user profile or text clarifies.

Invariant 2: Category safety.

```text
Requested categories define the allowed product.article_type values.
```

If the user asks for tees, cargos, jeans, and hoodie, do not include sarees, kurtas, dresses, sandals, or backpacks unless the user later asks to add them.

Invariant 3: Color safety.

```text
If color mode is strict:
  base_colour must be one of the requested colors after normalization.
```

"Black/grey only" is strict. "Mostly neutrals" is softer. "Prefer black" is preference, not strict.

Invariant 4: Budget safety.

```text
Cart total = sum(selected item price * quantity)
Budget remaining = budget - cart total
All UI totals read from the same source of truth.
```

Never let the LLM write totals.

Invariant 5: Copy grounding.

```text
Stylist copy may only mention selected items and selected item metadata.
```

If the selected items are black and grey, copy must not mention blue.

If the selected items include no sneakers, copy must not mention sneakers.

Invariant 6: Shortfall honesty.

```text
If strict filters cannot fill quantity, do not silently relax.
Return shortfall and offer labeled alternatives.
```

Invariant 7: Demo resilience.

```text
The primary demo must run even if remote LLM or network is unavailable.
```

The repo currently uses Ollama locally. Maintain a deterministic fallback path for the three demo scripts.

---

## Page 08 - Current System Strengths

Do not throw these away:

- The app already has a full-stack shape.
- Auth, cart, products, collaboration, wardrobe, and mission routes exist.
- Socket.io is already wired for live updates.
- The Agent page exists and calls `/api/agent/plan`, `/shop`, `/finalize`, `/reoptimize`, and `/refine`.
- Squad Cart exists at `/collab/:token`.
- Wedding Wardrobe Matrix exists and is a strong differentiator.
- Data pipeline already merges fashion product data and seeds Oracle.
- There is a type mapping service to convert LLM item text into product article types.
- The app has already started supporting continuity through saved wardrobes.

Build on this. Do not replace it with a tiny mock app unless the user explicitly asks for a separate prototype.

---

## Page 09 - Current System Gaps That Must Be Fixed

The current implementation is promising but not yet faithful to the vision.

Known gaps:

1. The Agent UI is still closer to a progress log plus grid than a mobile-first conversational stylist flow.
2. `parseGoal` depends heavily on LLM output and does not enforce a strict schema enough.
3. There is no obvious deterministic `MOCK_LLM` or "demo safe" fallback for core scripts.
4. `semanticSearch` prefilters by article type, gender, and budget, but does not hard-filter colors before returning candidates.
5. `/api/agent/shop` may relax constraints too silently.
6. There is no central constraint object that survives parse, clarify, shop, refine, copy, and validation.
7. Budget allocation and total math are not centralized enough.
8. Product selection is not yet a real outfit assembly engine.
9. Current results are not grouped as outfit carousels.
10. Product card bottom sheet with swap/remove is not implemented in the Agent flow.
11. Grounded copy validation is not strong enough.
12. Some comments say collab links need no auth, but the backend route currently uses auth for reading/joining.
13. Existing schema scripts are inconsistent: old `create_tables.sql` and newer `fix_tables.js` differ on `cart_items.size` vs `item_size`, and reactions use different column names in different generations.
14. The frontend uses localStorage for auth; this is fine for the current full-stack app, but do not rely on localStorage for fragile demo-only share snapshots.
15. Unicode text in some existing files appears mojibaked. Avoid adding more broken encoding.

The biggest immediate bug risk is constraint leakage. If a men's black/grey college query returns a women's saree, the demo fails no matter how good the UI looks.

---

## Page 10 - Primary Demo Script A

This is the redemption-arc demo. Build and test this first.

User goal:

```text
Starting college next month. Budget Rs 15,000.
Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie.
Black/grey only. Delhi. Hostel.
```

Expected behavior:

1. App shows Kiya as the stylist.
2. User submits goal.
3. Parser produces:

```json
{
  "gender": "Men",
  "budgetTotal": 15000,
  "items": [
    { "category": "tshirt", "articleType": "Tshirts", "subcategory": "oversized", "qty": 3 },
    { "category": "cargo", "articleType": "Trousers", "subcategory": "cargo", "qty": 2 },
    { "category": "jeans", "articleType": "Jeans", "qty": 2 },
    { "category": "hoodie", "articleType": "Sweatshirts", "subcategory": "hoodie", "qty": 1 }
  ],
  "colors": ["Black", "Grey"],
  "colorMode": "strict",
  "context": {
    "lifeStage": "starting college",
    "city": "Delhi",
    "living": "hostel",
    "laundry": "easy wash",
    "styleNotes": ["dark colors", "minimal", "mix and match"]
  },
  "missing": ["size"]
}
```

4. Kiya asks at most one clarifier:

```text
What size do you usually wear?
[S] [M] [L] [XL] [XXL]
```

5. Results include exactly 8 selected items if catalog allows:

```text
3 men's/unisex black/grey oversized-ish Tshirts
2 men's/unisex black/grey cargo-like Trousers
2 men's/unisex black/grey Jeans
1 men's/unisex black/grey Sweatshirt/Hoodie
```

6. Women's products exist in the DB and are proven excluded.
7. Every total agrees.
8. Results are grouped as outfit combinations, not a flat 8-card dump.
9. User can tap an item, see details, swap to an alternative, and see budget update.
10. User can share with family, see mock/live feedback, and approve cart.

Acceptance for Script A:

```text
No wrong gender.
No wrong color.
No wrong category.
No invented copy.
No fake totals.
No dead cards.
No empty carousels.
```

---

## Page 11 - Secondary Demo Script B

Script B proves clarifier intelligence.

User goal:

```text
Wedding to attend next month, want to look good, around 5k
```

Expected behavior:

1. Do not guess gender.
2. Ask:

```text
Who's this outfit for?
[Men] [Women] [Show both]
```

3. Ask role if needed:

```text
What's your role at the wedding?
[Guest] [Close family] [Bride/Groom side]
```

4. Build one outfit plus maybe an accessory under Rs 5,000.
5. If the user chooses women, ethnic/wedding products may be shown.
6. If the user chooses men, men's ethnic/semi-formal products may be shown.
7. Copy must explicitly mention real selected products.

This script must not reuse the college wardrobe assumptions. Wedding does not mean black/grey only. College does not mean ethnic. Keep contexts separate.

---

## Page 12 - Secondary Demo Script C

Script C proves honesty under impossible budgets.

User goal:

```text
5 outfits under Rs 3,000
```

Expected behavior:

1. Do not pretend 5 full outfits are possible if catalog prices do not support it.
2. Kiya responds honestly:

```text
Rs 3,000 is tight for five complete outfits. I can build the strongest 2-3 piece starter set within budget, or we can stretch the budget for full outfits.
```

3. Show the best possible small haul, not random low-quality unrelated products.
4. Offer chips:

```text
[Build best under Rs 3,000]
[Stretch budget]
[Reduce outfit count]
```

5. If user chooses best under budget, build a constrained haul with exact math.

Do not hide the shortfall. Honesty is a feature.

---

## Page 13 - Architecture North Star

The architecture should be a deterministic shopping pipeline with LLMs only where they are useful.

Target pipeline:

```text
User goal text
  -> parse into structured constraints
  -> ask clarifying questions only for missing fields
  -> hard-filter catalog with code
  -> assemble selected items with scoring and budget optimizer
  -> group selected items into outfits
  -> generate grounded stylist copy
  -> validate copy in code
  -> render interactive cart/wardrobe
  -> allow swaps/removes/refinements
  -> share to Squad Cart
  -> reconcile feedback
  -> approve cart
```

LLM responsibilities:

- Parse messy natural language into a structured plan.
- Generate short stylist copy from already selected items.
- Interpret family feedback text or voice into structured actions.
- Interpret broad occasion planning where deterministic rules are thin.

Code responsibilities:

- Product filtering.
- Constraint enforcement.
- Budget math.
- Cart totals.
- Product selection.
- Outfit grouping.
- Copy validation.
- Shortfall detection.
- Swap eligibility.
- UI state transitions.

Never let the LLM directly choose from the entire catalog without hard code filters.

---

## Page 14 - Current Frontend Routes

Important current routes from `StyleOS-frontend/src/App.js`:

```text
/                         HomePage
/product/:productID        ProductPage
/login                     LoginPage
/register                  RegisterPage
/agent                     AgentPage
/cart/:id                  CartPage
/collab/:token             CollabCartPage
/collab-carts              CollabInvitesPage
/wardrobe                  WardrobePage
/mission                   MissionPickerPage
/mission/wedding           WeddingIntakePage
/mission/wedding/:id       WeddingMatrixPage
```

Preserve these routes unless there is a strong reason to change them.

Most important route for the pasted prompt:

```text
/agent
```

Most important route for family collaboration:

```text
/collab/:token
```

Most important route for the broader StyleOS platform vision:

```text
/mission
/mission/wedding
/mission/wedding/:id
```

Do not remove the existing Myntra clone storefront routes. The goal-based agent should feel integrated into a shopping app, not isolated from it.

---

## Page 15 - Current Backend Routes

Important backend route groups:

```text
GET  /health

/api/auth
/api/products
/api/cart
/api/collab
/api/agent
/api/wardrobe
/api/mission
```

Current agent endpoints:

```text
POST /api/agent/plan
POST /api/agent/shop
POST /api/agent/finalize
POST /api/agent/reoptimize
POST /api/agent/refine
```

Current collab endpoints:

```text
POST /api/collab/create/:cartId
POST /api/collab/mission/create/:missionId
POST /api/collab/:token/join
GET  /api/collab/:token
POST /api/collab/:token/react
POST /api/collab/:token/voice
POST /api/collab/:token/reconcile
GET  /api/collab/my/invites
```

Current mission endpoints:

```text
POST /api/mission/wedding/create
GET  /api/mission/wedding/:id
POST /api/mission/wedding/:id/orchestrate
POST /api/mission/wedding/:id/reject-slot
POST /api/mission/plan-only
```

When adding stricter goal-to-cart logic, prefer adding service modules under:

```text
StyleOS-backend/src/services/
```

Suggested new modules:

```text
constraints.js
catalog_filter.js
budget.js
outfit_assembler.js
copy_validator.js
demo_fallbacks.js
```

Keep routes thin. Put hard logic in services so it is testable.

---

## Page 16 - Database Reality

The current backend uses Oracle, not Postgres.

Connection:

```text
StyleOS-backend/src/db.js
oracledb thin mode
DB_USER
DB_PASSWORD
DB_CONNECT
default connect string localhost:1521/XEPDB1
```

Core tables:

```text
users
products
carts
cart_items
collab_sessions
collab_members
reactions
goals
wardrobes
missions
mission_events
mission_members
mission_slots
```

Watch for schema drift:

- Old `create_tables.sql` may use `cart_items.size`.
- Current models expect `cart_items.item_size`.
- Old reactions table may use `type`.
- Current models expect `reaction_type`.
- Mission tables may be created in a later setup script, not the old SQL file.

Before changing DB code, inspect the actual setup scripts and current model expectations.

Do not make sweeping schema migrations unless necessary. For hackathon speed, prefer small additive changes or compatibility code where possible.

---

## Page 17 - Product Schema And Normalization

Current product fields in code:

```text
id
title
brand
gender
master_category
sub_category
article_type
occasion
season
base_colour
fabric
price
mrp
rating
rating_count
delivery_days
images
description
sizes
in_stock
source
embedding
```

Frontend often normalizes product rows into camelCase:

```text
baseColour
articleType
deliveryDays
ratingCount
```

Be careful with Oracle uppercase fields:

```text
row.ID
row.TITLE
row.BASE_COLOUR
row.ARTICLE_TYPE
```

Write helper functions to normalize product shape. Do not scatter `row.ID || row.id` everywhere if adding new code.

Color normalization must treat these as equivalent where appropriate:

```text
grey = gray = charcoal (usually Grey)
black = Black
navy blue = Navy Blue
dark blue = Dark Blue
off white = Off White
```

For Script A strict black/grey:

```text
Allowed: Black, Grey
Maybe allowed if explicitly normalized: Charcoal -> Grey
Not allowed: Navy Blue, Dark Blue, Blue, White, Off White, Beige, Olive, Multi
```

---

## Page 18 - Constraint Object Contract

Add or converge toward a single structured constraint object. This object should be the truth passed across parse, clarify, filter, assemble, copy, and refine.

Target shape:

```json
{
  "rawGoal": "Starting college next month...",
  "gender": "Men",
  "genderConfidence": "explicit|inferred|unknown",
  "budgetTotal": 15000,
  "budgetFlex": "hard|stretch10|unknown",
  "items": [
    {
      "slotId": "tshirt-1",
      "kind": "tshirt",
      "articleTypes": ["Tshirts"],
      "queryTerms": ["oversized", "tee"],
      "qty": 3,
      "perItemBudgetMax": 6000,
      "mustHave": ["oversized"],
      "avoid": ["flashy logos"],
      "priority": 1
    }
  ],
  "colors": ["Black", "Grey"],
  "colorMode": "strict",
  "context": {
    "lifeStage": "college",
    "city": "Delhi",
    "living": "hostel",
    "occasion": "daily college",
    "laundryNotes": "easy wash",
    "styleNotes": ["minimal", "mix and match"]
  },
  "deadline": null,
  "sizes": {
    "top": null,
    "bottom": null,
    "shoe": null
  },
  "missing": ["size"],
  "strictness": {
    "gender": "hard",
    "category": "hard",
    "color": "hard",
    "budget": "hard"
  }
}
```

The exact property names may adapt to the codebase, but the concept must exist.

Do not pass around loose item objects like `{ type, quantity, budget }` without the global constraints. That is how context gets lost.

---

## Page 19 - Parser Requirements

The parser has two modes:

1. LLM parser through Ollama or configured LLM.
2. Deterministic fallback parser for demo reliability.

The fallback parser must handle:

```text
Script A college wardrobe
Script B wedding around 5k
Script C 5 outfits under 3k
Common delta edits:
  make the hoodie grey instead
  swap one jeans for joggers
  cheaper cargos
  actually budget is 12k
  no logos
  make it darker
```

LLM parser requirements:

- Return JSON only.
- Strip markdown fences defensively.
- Validate parsed JSON.
- Fill `missing` for unknown gender, size, budget flexibility, role, or quantity.
- Never collapse multiple item types into one item.
- Preserve exact quantities.
- Preserve strict color language.

Parser examples:

```text
"black/grey only" -> colors ["Black", "Grey"], colorMode "strict"
"prefer black" -> colors ["Black"], colorMode "preference"
"men's" -> gender "Men", genderConfidence "explicit"
"for my brother" -> gender "Men", genderConfidence "inferred"
"wedding to attend" -> gender unknown, ask
"5 outfits under Rs 3000" -> budgetTotal 3000, impossibleLikely true
```

If the model returns bad JSON, do not crash the demo. Fall back to deterministic parsing.

---

## Page 20 - Clarifying Question Logic

Clarifying questions must be useful and minimal.

Ask only questions whose answers are actually missing.

Never ask five questions after the user gave a complete brief.

For Script A, ask at most:

```text
What size do you usually wear?
[S] [M] [L] [XL] [XXL]
```

Question rules:

- One question at a time.
- Use tappable chips.
- Chip tap immediately posts a user bubble.
- Free text answer should also work.
- Do not block the user from proceeding if the missing field is not essential for filtering.

Essential clarifiers:

```text
Gender: required if ambiguous and gender-specific products may be selected.
Size: useful, but can default to M for demo if skipped.
Budget flexibility: ask only when the budget is tight or near overrun.
Occasion role: ask for wedding/festival when role changes garment choices.
```

Do not ask:

- "What brands do you like?" unless brand is a major stated preference.
- "What is your style?" when the user already gave colors, fit, context, and quantities.
- "What is your city?" when the user already gave Delhi.

---

## Page 21 - Hard Filtering Design

Hard filtering must happen before scoring and before LLM copy.

Target function:

```js
filterProducts(productsOrDb, constraints, itemSlot)
```

Required filters:

1. In stock:

```sql
in_stock = 1
```

2. Gender:

```sql
gender IN (:requestedGender, 'Unisex')
```

3. Category:

```sql
article_type IN (:allowedArticleTypes)
```

4. Color if strict:

```sql
base_colour IN (:allowedColors)
```

5. Budget sanity:

```text
single item price should not exceed a configurable share of total budget
unless the item category normally costs more and user allowed flexibility.
```

6. Avoid terms:

```text
title/description should not include avoided terms like flashy logo,
ripped, distressed, slim, etc., if those are explicit.
```

7. Delivery deadline if present:

```text
delivery_days must fit deadline if enough information exists.
```

The LLM must never see products that failed hard filters when generating recommendations.

Semantic search may be used only after hard prefilters. Embeddings rank candidates; they do not replace constraints.

Important current bug-risk:

`semanticSearch` currently does not strictly filter color. Fix that before trusting it for Script A.

---

## Page 22 - Product Selection And Scoring

After hard filtering, score candidates.

Suggested score:

```text
score =
  0.35 * ratingScore
  0.25 * valueScore
  0.20 * contextTagScore
  0.10 * fitScore
  0.10 * deliveryScore
```

Where:

- `ratingScore` uses rating and rating_count.
- `valueScore` rewards lower price within quality band.
- `contextTagScore` rewards hostel-friendly, easy-wash, cotton, dark, wrinkle-resistant, daily-wear.
- `fitScore` rewards oversized for oversized tee requests.
- `deliveryScore` rewards faster delivery if a deadline exists.

Selection must satisfy requested quantities if possible.

If selected total exceeds budget:

1. Identify the least valuable high-cost item.
2. Swap it with a cheaper filtered alternative in the same slot.
3. Repeat until under budget or no cheaper alternatives remain.
4. If still over budget and budget is hard, reduce quantity only with honest explanation.

Do not solve budget by adding unrelated cheap products.

---

## Page 23 - Budget Math Contract

Budget math must live in one module or one clear service boundary.

Target functions:

```js
sumItems(items)
subtotal(items)
discountTotal(items)
grandTotal(items)
budgetRemaining(items, budgetTotal)
budgetPct(items, budgetTotal)
budgetStatus(items, budgetTotal)
```

All UI surfaces must read from these functions or backend-derived totals:

- Summary strip.
- Budget bar.
- Cart review.
- Approval screen.
- Agent progress.
- Reoptimization response.
- Share view.

Never hardcode strings like:

```text
8 items - Rs 12,389 total
```

unless the numbers are computed from state at render time.

Test invariant:

```text
After 20 random swap/remove operations, header total,
budget bar total, and cart review total must match.
```

---

## Page 24 - Outfit Assembly

The output is a wardrobe, not a flat list.

For Script A:

Selected items:

```text
3 tees
2 cargos
2 jeans
1 hoodie
```

Should become outfit combinations:

```text
Outfit 1 - Everyday Campus
  black oversized tee + grey cargo

Outfit 2 - Library To Canteen
  grey oversized tee + black jeans

Outfit 3 - Hostel Evening
  black tee + black cargo + grey hoodie

Outfit 4 - Freshers' Day Minimal
  grey tee + dark jeans + hoodie
```

Outfits may reuse purchased items. That is the point: demonstrate mix-and-match value.

Outfit grouping rules:

- Prefer one top plus one bottom.
- Add layer if available and context fits.
- Avoid duplicate exact combinations.
- Name outfits from context, not generic "Look 1" only.
- Every outfit item must be one of the selected cart items.

Do not create an outfit using an item that was not selected.

---

## Page 25 - Grounded Stylist Copy

The stylist copy is commentary on selected items, not a product source.

System instruction for copy generation should be close to:

```text
You are a fashion stylist. Describe ONLY the items in the provided list.
Never mention an item, color, or category not present in the list.
Never claim a constraint is satisfied unless the list proves it.
If there is a shortfall, state it plainly and positively.
Write 2-4 warm, specific sentences.
Mention at least two actual selected item names.
Avoid generic filler.
```

Copy input must include only:

- Parsed constraints.
- Selected items.
- Shortfalls.

It must not include the whole catalog.

Validation pass:

1. Extract allowed color words from selected items.
2. Extract allowed category words from selected items.
3. Scan generated copy for known color/category words outside allowed set.
4. Scan for product names not in selected list if possible.
5. If violation exists, regenerate once.
6. If still invalid, use deterministic template.

Optional dev badge:

```text
Grounded
```

Only show the badge if validation passed.

---

## Page 26 - Agent Page Target UX

The current `AgentPage` should evolve into a mobile-first chat-and-results experience.

Target layout:

```text
Top: compact StyleOS/Kiya header
Middle: chat thread
Bottom: input bar pinned
Results: embedded in thread as outfit groups
Budget: sticky summary strip when results exist
```

Idle state:

- Kiya greeting streams in.
- Starter chips:
  - College wardrobe under Rs 15,000
  - Wedding guest outfit, Rs 5,000
  - First job formals, Rs 10,000
  - Monsoon essentials for Delhi
- Textarea/input for custom goal.

Working state:

- Chat bubble: "Give me a moment. I am building your wardrobe."
- Skeleton cards in the same layout results will occupy.
- Progress events may still stream, but user-facing copy should feel like a stylist, not logs.

Results state:

- Sticky summary strip.
- Outfit groups with horizontal carousels.
- Full haul grid below.
- Grounded copy bubble.
- Follow-up chips:
  - Swap something
  - Make it cheaper
  - Add footwear
  - Looks good, view cart

Do not dump raw backend progress as the main UX.

---

## Page 27 - Product Card Requirements

Every product card in the Agent results should be tappable.

Card content:

```text
Image
Brand
Product title
Price
MRP struck through if present
Discount percent if present
Why-tag pill
```

Why-tag examples:

```text
Oversized + Black
Hostel-friendly
Cotton + Easy wash
Under budget
```

The why-tag must come from metadata and constraints, not invented LLM text.

Card image handling:

- Fixed aspect ratio.
- Shimmer or placeholder while loading.
- No layout shift.
- Fallback if image fails.

Mobile carousel:

```css
scroll-snap-type: x mandatory;
overflow-x: auto;
```

Card width on mobile should leave a partial next-card peek so users know it swipes.

---

## Page 28 - Product Sheet Requirements

When a card is tapped, open a bottom sheet.

Sheet content:

```text
Image gallery
Brand and full title
Rating and rating count
Price, MRP, discount
Fabric
Fit if known
Delivery estimate
Size selector
Why Kiya picked this
Actions: Swap this item, Remove
```

Swap flow:

1. Show filtered alternatives in same item slot.
2. Alternatives must preserve hard constraints.
3. Show price difference:

```text
+Rs 200
-Rs 150
Same price
```

4. User taps alternative.
5. Backend updates cart item.
6. Card cross-fades.
7. Budget bar animates to new total.
8. Copy and outfit groups update if needed.

Remove flow:

1. Remove item.
2. Show undo snackbar for 5 seconds.
3. Budget updates.
4. If removal creates shortfall, Kiya says it plainly.

This interaction is a demo money shot. Make it reliable before adding extra features.

---

## Page 29 - Delta Edits And Refinement

The input bar remains active after results.

Supported messages:

```text
make the hoodie grey instead
swap one jeans for joggers
cheaper cargos
actually budget is 12k
no logos
make it darker
add footwear
remove the expensive tee
```

Refinement rules:

- Do not restart the whole cart for one edit.
- Identify affected slots.
- Preserve all other constraints.
- Re-run hard filters for affected slots.
- Animate changed cards only.
- Recompute budget.
- Explain the actual change.

Example:

```text
User: actually budget is 12k
Kiya: I brought the cart under Rs 12,000 by swapping the Levi's jeans for a Roadster pair. Everything is still men's black/grey and college-ready.
```

If request cannot be satisfied:

```text
I do not have olive cargos under Rs 1,500 in stock right now. Closest strict match is dark grey at Rs 1,299. Want that?
```

Never pretend.

---

## Page 30 - Squad Cart Requirements

Squad Cart is not a generic share link. It replaces the WhatsApp screenshot loop.

Current route:

```text
/collab/:token
```

Target behavior:

1. User creates share link from cart or mission.
2. Family member opens link.
3. They can inspect items in a mobile-first view.
4. They can love, skip, comment, or send voice feedback.
5. Reactions show live to original user through Socket.io.
6. AI re-plans the affected cart or mission state from that feedback.

Current `CollabCartPage` already supports:

- Vertical product navigation.
- Horizontal image swipes.
- Love/skip/comment/voice.
- Reconcile button.
- Mission mode for Wedding Matrix.

Improve it carefully. Do not remove mission support.

Important product promise:

```text
The family decision happens inside StyleOS, not on WhatsApp.
```

WhatsApp is only a transport for the link.

---

## Page 30A - Mentor Warning: Re-Planning, Not Alternates

The mentor flagged that "alternate suggestions" are a double-edged sword. Treat this as a product-positioning rule.

Do not pitch the Council flow as:

```text
Mom rejects an outfit, so AI recommends another outfit.
```

That sounds like Maya or a standard recommendation engine with a family reaction button.

Pitch it as:

```text
Mom rejects an outfit, so StyleOS re-solves the mission while preserving
all constraints that still hold: budget, ceremony theme, family preferences,
availability, color coordination, and previous approvals.
```

The replacement item is only one visible consequence of the re-planning engine. It is not the feature.

Preferred language:

- "The mission is re-planned."
- "The shared plan is re-optimized."
- "The system re-solves the affected slot while preserving the rest of the approved plan."
- "Everyone continues from the updated shared plan."
- "This is AI-mediated decision-making, not another recommendation surface."

Avoid language:

- "AI suggests an alternate."
- "AI recommends another outfit."
- "AI finds a replacement" as the headline.
- "Better recommendation after rejection."

When implementing UI copy, button labels, socket messages, and pitch text, use "re-plan", "re-solve", "re-balance", or "re-optimize" for family vetoes. Use "swap" only for an individual shopper manually choosing a different product in the product sheet.

---

## Page 31 - Wedding Wardrobe Matrix

The Wedding Wardrobe Matrix is a separate but related high-value feature.

Routes:

```text
/mission
/mission/wedding
/mission/wedding/:id
```

Concept:

```text
Rows = family members
Columns = wedding events
Cells = selected outfit for that person/event
```

The matrix proves StyleOS can handle multi-person, multi-event fashion missions.

Keep this feature.

Do not let college Script A work break wedding missions.

Important services:

```text
mission_config.js
mission.js route
WeddingIntakePage.js
WeddingMatrixPage.js
CollabCartPage.js mission mode
```

Current deterministic cultural layer is intentionally shallow. It maps communities to event garments and palettes. Do not oversell it as deep cultural research.

If improving this feature:

- Make constraints more explicit.
- Keep budget visible.
- Keep column re-harmonization after vetoes.
- Keep family council share flow.
- Frame veto handling as mission re-planning, not alternate recommendations.

---

## Page 32 - Data Pipeline

Current data-pipeline scripts:

```text
merge_catalog.py
seed_paramaggarwal.py
supplement_ethnic.py
build_embeddings.py
GET_DATASETS.md
requirements.txt
```

`merge_catalog.py` currently:

- Loads `myntra_products_catalog.csv`.
- Loads `Fashion Dataset.csv`.
- Infers article type.
- Normalizes color.
- Generates category, occasion, fabric, sizes, price/MRP if needed.
- Seeds Oracle products.

Important maps:

```text
TYPE_MAP
OCCASION_MAP
PRICE_RANGES
COLOUR_NORM
SIZE_MAP
FABRIC_MAP
```

For Script A, ensure the seeded database has enough:

```text
Men/Unisex Tshirts, black/grey, oversized-ish, at least 3
Men/Unisex Trousers/cargos, black/grey, at least 2
Men/Unisex Jeans, black/grey, at least 2
Men/Unisex Sweatshirts/hoodies, black/grey, at least 1
Women products in catalog, enough to prove exclusion
```

If real dataset is thin on cargos or hoodies, add a small deterministic supplement dataset rather than weakening filters.

---

## Page 33 - LLM And Fallback Strategy

Current backend LLM service:

```text
StyleOS-backend/src/services/llm.js
Ollama base URL: http://localhost:11434
Default model: qwen2.5:7b
Embedding model: nomic-embed-text
```

Keep local Ollama support because it is free and demo-friendly.

Add environment behavior:

```text
MOCK_LLM=true
```

When `MOCK_LLM=true`:

- Parse demo goals deterministically.
- Generate deterministic copy.
- Reconcile simple feedback deterministically.
- Do not require Ollama.
- Do not make network calls.

When `MOCK_LLM` is false:

- Use Ollama/LLM.
- Still validate all outputs.
- Still fall back on deterministic logic if response fails.

Do not let model downtime break the stage demo.

---

## Page 34 - API Contract For The Upgraded Agent

The current endpoints can remain, but they need stronger data contracts.

Suggested improved flow:

```text
POST /api/agent/plan
  input: { goalText }
  output: { constraints, cartId, nextQuestion? }

POST /api/agent/answer
  input: { cartId, answer }
  output: { constraints, nextQuestion?, readyToAssemble }

POST /api/agent/assemble
  input: { cartId }
  output: { cart, selectedItems, outfits, shortfalls, budget, groundedCopy }

POST /api/agent/swap
  input: { cartId, cartItemId, newProductId }
  output: { cart, budget, outfits, groundedCopy }

POST /api/agent/remove
  input: { cartId, cartItemId }
  output: { cart, budget, shortfalls }

POST /api/agent/refine
  input: { cartId, message }
  output: { actions, cart, budget, explanation }
```

If you keep existing `/shop` and `/finalize` endpoints, adapt them to return enough structured data for the new UI. Do not strand the frontend with only progress strings.

---

## Page 35 - Frontend Component Plan

The pasted prompt suggested components under Vite, but adapt the idea to CRA.

Suggested components under:

```text
StyleOS-frontend/src/components/agent/
```

Components:

```text
ChatThread.js
ChatBubble.js
ChipRow.js
TypingIndicator.js
BudgetStrip.js
BudgetBar.js
OutfitGroup.js
ProductCarousel.js
AgentProductCard.js
ProductSheet.js
SkeletonOutfit.js
FullHaulGrid.js
GroundedCopyBadge.js
UndoSnackbar.js
```

Suggested hooks:

```text
StyleOS-frontend/src/hooks/useStreamingText.js
StyleOS-frontend/src/hooks/useBudgetTween.js
```

Suggested service additions:

```text
StyleOS-frontend/src/services/agentSession.js
```

Use existing plain CSS. Do not add Tailwind unless explicitly asked.

Use existing React 17 compatible patterns. Do not introduce React 18-only APIs.

---

## Page 36 - Visual Design Direction

Mobile-first.

Target viewport:

```text
390px width
```

Desktop:

```text
Center a 420px mobile column with subtle backdrop.
```

Style:

- Myntra-adjacent, not copied.
- Clean, warm, shopping-native.
- More practical than a landing page.
- No huge marketing hero on the first screen.
- The first screen is the actual usable stylist.

Suggested colors:

```text
Background: #FAFAFA
User bubble: #FF3F6C
Stylist bubble: #F4F1FF
Card border: #EEEEEE
Text: #1F1F1F
Muted text: #6B7280
Under-budget green: #16A34A
Warning amber: #F59E0B
Over-budget red: #DC2626
```

Typography:

- Keep whatever the app currently uses unless adding a font is simple.
- Product brand: small, bold.
- Product title: one line ellipsis.
- Price: semibold.
- Do not let text overflow cards or buttons.

Do not create decorative gradient blobs, oversized landing cards, or a marketing homepage for the agent.

---

## Page 37 - Motion Direction

Motion should make the system feel alive, not slow.

Required motion:

- Typing indicator with three dots.
- Kiya messages stream in or fade in cleanly.
- Chip press feedback.
- Skeleton cards during assembly.
- Outfit groups stagger in.
- Product cards enter with small translateY and fade.
- Budget value animates on swap/remove.
- Bottom sheet opens with a smooth slide.
- Swap cross-fades card in place.

Animation constraints:

- Prefer transform and opacity.
- Avoid animating layout-heavy properties.
- Keep delays short.
- Do not block the user behind a global spinner.

The pause while assembling should be perceived intelligence:

```text
1.2s to 2.0s max
```

Do not make the demo crawl.

---

## Page 38 - Testing And Verification

There is no strong test setup yet. Add focused tests or scripts before broad refactors.

Critical tests:

1. Parser test for Script A.
2. Filter test for Script A:

```text
Every returned product is Men or Unisex.
Every returned product article_type is allowed.
Every returned product base_colour is Black or Grey.
Women's products exist but zero are selected.
```

3. Budget invariant:

```text
All totals match after swaps/removes.
```

4. Grounded copy validator:

```text
Rejects copy mentioning unselected colors/categories.
```

5. Shortfall behavior:

```text
When no strict hoodie exists, returns shortfall instead of wrong item.
```

6. API smoke test:

```text
plan -> assemble/shop -> finalize returns cart and outfits.
```

If adding Jest is too heavy, create a Node script under:

```text
StyleOS-backend/src/scripts/verify_script_a.js
```

The script should exit nonzero on violations.

Show the user test output when asked.

---

## Page 39 - Build Order

When asked to implement, follow this order.

Phase 1: Constraint core.

```text
1. Add/upgrade parser and deterministic fallback.
2. Add constraint validation.
3. Add hard catalog filters.
4. Fix semantic search color/category/gender prefilters.
5. Add budget service.
6. Add Script A verification.
```

Phase 2: Assembly.

```text
1. Score candidates.
2. Select quantities.
3. Optimize budget.
4. Detect shortfalls.
5. Group outfits.
6. Generate and validate grounded copy.
```

Phase 3: Agent UX.

```text
1. Mobile chat thread.
2. Clarifying chips.
3. Skeleton assembly.
4. Outfit groups.
5. Horizontal carousels.
6. Sticky budget strip.
7. Full haul grid.
```

Phase 4: Interactions.

```text
1. Product sheet.
2. Swap flow.
3. Remove with undo.
4. Delta edits.
5. Cart approve path.
```

Phase 5: Collaboration and polish.

```text
1. Family share from Agent results.
2. Mock/live family feedback.
3. Reconcile feedback.
4. Confetti/success if needed.
5. Motion polish.
```

Do not spend all time on visual polish before Phase 1 passes.

---

## Page 40 - What Not To Do

Do not:

- Rebuild the whole app from scratch.
- Replace the full-stack app with a tiny static mock.
- Migrate to Vite/Tailwind without being asked.
- Remove existing Myntra clone pages.
- Remove Wedding Matrix.
- Remove Squad Cart.
- Let the LLM choose products from the whole database.
- Let the LLM calculate totals.
- Silently relax gender/category/color constraints.
- Show empty carousels.
- Hardcode successful demo numbers.
- Add login/payment complexity to the Agent flow unless necessary.
- Add new giant features before Script A works.
- Use real Myntra scraping or hotlinked Myntra images unless the user explicitly wants that and it is allowed.
- Break existing dirty frontend changes.

The goal is not "more AI." The goal is trustworthy shopping execution.

---

## Page 41 - Current File Map For Claude

Frontend files to know:

```text
StyleOS-frontend/src/App.js
StyleOS-frontend/src/pages/AgentPage.js
StyleOS-frontend/src/pages/AgentPage.css
StyleOS-frontend/src/pages/CollabCartPage.js
StyleOS-frontend/src/pages/CollabCartPage.css
StyleOS-frontend/src/pages/CartPage.js
StyleOS-frontend/src/pages/WardrobePage.js
StyleOS-frontend/src/pages/MissionPickerPage.js
StyleOS-frontend/src/pages/WeddingIntakePage.js
StyleOS-frontend/src/pages/WeddingMatrixPage.js
StyleOS-frontend/src/pages/Mission.css
StyleOS-frontend/src/services/api.js
StyleOS-frontend/src/services/socket.js
StyleOS-frontend/src/context/AuthContext.js
StyleOS-frontend/src/helpers/normalizeProduct.js
```

Backend files to know:

```text
StyleOS-backend/src/index.js
StyleOS-backend/src/db.js
StyleOS-backend/src/models/index.js
StyleOS-backend/src/routes/agent.js
StyleOS-backend/src/routes/collab.js
StyleOS-backend/src/routes/cart.js
StyleOS-backend/src/routes/products.js
StyleOS-backend/src/routes/mission.js
StyleOS-backend/src/routes/wardrobe.js
StyleOS-backend/src/services/llm.js
StyleOS-backend/src/services/semantic_search.js
StyleOS-backend/src/services/type_map.js
StyleOS-backend/src/services/mission_config.js
StyleOS-backend/src/services/whisper.js
```

Data files to know:

```text
data-pipeline/merge_catalog.py
data-pipeline/seed_paramaggarwal.py
data-pipeline/supplement_ethnic.py
data-pipeline/build_embeddings.py
data-pipeline/GET_DATASETS.md
```

Docs to know:

```text
FitLoop_Project_Document.md
SETUP.md
CLAUDE.md
```

---

## Page 42 - Backend Refactor Suggestions

Do not put all logic in `routes/agent.js`.

Suggested backend service boundaries:

```text
services/constraints.js
  parseGoal
  parseGoalFallback
  mergeClarifierAnswer
  parseRefinement
  validateConstraints

services/catalog_filter.js
  buildHardFilterSql
  filterCandidatesForSlot
  explainShortfall
  normalizeColor
  normalizeGender

services/budget.js
  sumItems
  computeBudget
  optimizeUnderBudget

services/outfit_assembler.js
  scoreCandidate
  selectItems
  buildOutfitGroups
  findSwapAlternatives

services/grounded_copy.js
  generateGroundedCopy
  validateGroundedCopy
  deterministicCopy

services/demo_fallbacks.js
  parseScriptA
  parseScriptB
  parseScriptC
```

Keep each service deterministic where possible.

Route files should orchestrate request/response and socket events, not carry all business logic.

---

## Page 43 - Frontend Refactor Suggestions

`AgentPage.js` is currently too large and mixes:

- Goal input.
- API orchestration.
- Socket progress.
- Chat log.
- Product grid.
- Share.
- Reoptimize.
- Refinement.

Split it gradually.

Suggested decomposition:

```text
pages/AgentPage.js
  owns session state and API orchestration only

components/agent/AgentShell.js
components/agent/GoalComposer.js
components/agent/ChatThread.js
components/agent/AssemblyState.js
components/agent/ResultsView.js
components/agent/OutfitGroup.js
components/agent/ProductSheet.js
components/agent/FamilySharePanel.js
components/agent/AgentActionBar.js
```

Do not over-abstract before the first working pass. The split should make the demo easier to finish, not prettier on paper.

---

## Page 44 - Handling Auth In The Demo

Current frontend uses `localStorage` token through `services/api.js`.

This is acceptable in the current full-stack repo. Do not follow the pasted prompt's "no localStorage" rule globally because the app already has auth.

However:

- Do not make the primary Agent demo fail because a judge is not logged in.
- Consider a seeded demo account or smooth login path.
- Collab link behavior currently requires auth even where comments say no auth. Either make that clear in UX or implement a guest-light mode.
- If guest mode is too risky, keep auth but make the flow fast and reliable.

For hackathon demo:

```text
Have one logged-in Jai user.
Have one logged-in family reviewer user or use same browser/incognito if needed.
```

Do not spend days building perfect auth. The core innovation is goal-to-cart and family feedback.

---

## Page 45 - Socket Events To Preserve

Current socket events include:

```text
agent:progress
agent:done
reaction:new
member:joined
cart:reconciled
mission:slot_filled
mission:slot_shopping
mission:slot_failed
mission:orchestrate_done
mission:reharmonize_start
```

Preserve these where useful.

For upgraded Agent UI, consider emitting structured events:

```text
agent:question
agent:assembly_start
agent:slot_shortfall
agent:item_selected
agent:outfits_ready
agent:copy_ready
agent:budget_updated
agent:item_swapped
agent:item_removed
```

But do not require sockets for correctness. API responses should still contain complete state so refresh/retry works.

---

## Page 46 - Copy Voice

Kiya's voice:

- Warm.
- Brief.
- Specific.
- Honest.
- Confident with constraints.
- Indian shopping context aware.

Good:

```text
I kept this tight for Delhi hostel life: dark, easy-wash pieces that mix without looking repetitive. The Roadster black tee and Mast & Harbour grey cargos anchor most of the outfits, while the hoodie gives you a cleaner evening layer.
```

Bad:

```text
Here are some amazing fashion-forward picks perfect for your needs!
```

Bad:

```text
I added sneakers to complete the look.
```

If no sneakers were selected, this is a grounding failure.

Good shortfall:

```text
I found one strict black/grey hoodie that fits the budget. I can either keep the haul at 7 items or show a charcoal alternative that is close but not an exact strict match.
```

Bad shortfall:

```text
I added a blue jacket instead.
```

---

## Page 47 - Judge-Facing Demo Narrative

The 4-minute demo should be staged like this:

0:00 to 0:20: Insight.

```text
Young Indians do not make every fashion decision alone inside Myntra. They screenshot, ask family, negotiate, and come back. We built the product that keeps that whole decision loop inside the shopping experience.
```

0:20 to 0:45: Goal input.

Type Script A.

0:45 to 1:30: Understanding and clarifier.

Show Kiya parsing, asking size, then building.

1:30 to 2:20: Results.

Show outfit groups, exact budget, all black/grey men's items, product sheet.

2:20 to 2:50: Swap.

Swap one tee or cargo cheaper. Budget animates down.

2:50 to 3:30: Family.

Share cart, family reacts/skips/comments/voice, AI updates.

3:30 to 4:00: Approve.

Cart review and success.

One line close:

```text
Two minutes. One goal. No browsing.
```

---

## Page 48 - Implementation Priorities If Time Is Short

If time is short, prioritize:

1. Script A correctness.
2. Hard filter tests.
3. Budget consistency.
4. Outfit-group results.
5. Product sheet with swap.
6. Family share visible enough to demo.
7. Cart approval.

Defer:

- Perfect animation.
- Every possible festival.
- Deep LLM cultural reasoning.
- Real payment.
- OAuth.
- Production deployment.
- Full guest auth.
- Exhaustive admin tools.

A finished Phase 1 and Phase 2 beats a half-finished everything.

---

## Page 49 - Acceptance Checklist

Before telling the user "done", verify:

```text
[ ] Script A creates or can create an 8-item cart.
[ ] Script A selected products are all Men or Unisex.
[ ] Script A selected products are all Black or Grey.
[ ] Script A selected products are only requested categories.
[ ] Women's items exist in DB and are excluded.
[ ] Totals match in summary, budget bar, and cart.
[ ] Shortfall path exists and does not silently relax.
[ ] Copy validator rejects ungrounded colors/categories.
[ ] Every visible product card is tappable.
[ ] Swap preserves constraints and updates totals.
[ ] Remove updates totals and has undo or a clear recovery path.
[ ] Family share link can be generated.
[ ] Collab reaction appears live or reliably after refresh.
[ ] Cart approval path works.
[ ] MOCK_LLM/demo fallback works or Ollama dependency is clearly handled.
```

Do not claim these pass without running the app, tests, or a focused verification script.

---

## Page 50 - Final Mental Model

When working on this codebase, think of StyleOS as four layers:

Layer 1: Trust.

```text
No wrong items. No fake math. No hallucinated copy.
```

Layer 2: Wardrobe intelligence.

```text
Not a list. A usable set of outfits around a life goal.
```

Layer 3: Interaction.

```text
Swap, refine, remove, approve. The user stays in flow.
```

Layer 4: Social decision.

```text
Family feedback belongs inside the product.
```

If a code change improves Layer 4 but breaks Layer 1, it is wrong.

If a UI change looks beautiful but makes the product feel like a generic catalog, it is wrong.

If an LLM feature sounds impressive but cannot be verified against selected products, it is wrong.

The north star is simple:

```text
The user states a goal. StyleOS builds the right cart.
```
