# StyleOS — Codebase Documentation

What actually exists in this repo, right now, across every layer. Written as reference documentation, not a pitch — if something's listed here, it's real code that runs.

---

## Architecture

```
StyleOS-frontend/       React 17, CRA, Redux, plain CSS — port 3000 — THE app judges see
StyleOS-frontend-next/  Next.js 16 — port 3002 — Phase 1 storefront shell only
StyleOS-backend/        Node/Express, Socket.io, Oracle (oracledb thin mode) — port 5000
data-pipeline/          Python scripts that seed the Oracle catalog
```

Both frontends talk to the same backend on port 5000. The backend is the single source of truth — neither frontend has its own business logic beyond display.

---

## Backend — `StyleOS-backend/src/`

### Routes (`routes/*.js`) — every HTTP endpoint that exists

**`auth.js`**
`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

**`products.js`**
`GET /api/products` (search/filter: q, gender, articleType, baseColour, minPrice, maxPrice, sort), `GET /api/products/:id`

**`cart.js`**
`GET /api/cart` (list mine), `POST /api/cart` (create), `GET /api/cart/:id`, `POST /api/cart/:id/items`, `DELETE /api/cart/:id/items/:itemId`, `POST /api/cart/:id/approve`

**`agent.js`** — Kiya, the goal-to-cart pipeline
`POST /api/agent/plan` (parse goal → constraints, handles clarifying questions + budget-feasibility checks), `POST /api/agent/shop` (fill one item slot, hard-filtered by gender/category/color, respects an Approver-mode Payer Lock if one exists), `POST /api/agent/alternatives`, `POST /api/agent/swap`, `POST /api/agent/reoptimize`, `POST /api/agent/refine` (free-text delta edits), `POST /api/agent/finalize` (budget-fit + grounded copy + outfit grouping)

**`collab.js`** — Squad Cart + all Five Modes
`POST /api/collab/create/:cartId` (body: `askMode`, `recipientName`, `recipientRelation`), `POST /api/collab/mission/create/:missionId`, `POST /api/collab/:token/join` (real account), `POST /api/collab/:token/guest-join` (no account — zero-friction), `GET /api/collab/:token`, `POST /api/collab/:token/payer-lock` (Approver), `POST /api/collab/:token/recipient-profile` (Proxy), `GET /api/collab/:token/vote-options/:cartItemId` + `POST /api/collab/:token/vote` (Advisor), `POST /api/collab/:token/react`, `POST /api/collab/:token/voice`, `POST /api/collab/:token/reconcile` (applies feedback; also runs Peer-mode deadlock detection), `POST /api/collab/:token/resolve-peer-deadlock` (Peer shuttle diplomacy), `GET /api/collab/my/invites`

**`mission.js`** — Wedding Wardrobe Matrix
`POST /api/mission/wedding/create`, `GET /api/mission/wedding/:id`, `POST /api/mission/wedding/:id/orchestrate`, `POST /api/mission/wedding/:id/reject-slot`, `POST /api/mission/wedding/:id/resolve-deadlock`, `POST /api/mission/wedding/:id/resolve-escalation`, `POST /api/mission/plan-only` (lightweight plan for non-wedding occasions)

**`party.js`** — Co-Attendee mode, the Clash Engine
`POST /api/parties/create`, `POST /api/parties/:token/join`, `PATCH /api/parties/:token/cart`, `GET /api/parties/:token`

**`wardrobe.js`**
`GET /api/wardrobe`, `POST /api/wardrobe`

### Middleware (`middleware/*.js`)
- `auth.js` — real JWT auth
- `identify.js` — resolves EITHER a real JWT user OR a guest token scoped to one collab session (used by every `/collab/:token/...` route so guests never need an account)
- `ownership.js` — `ownsCart`/`ownsMission` helpers, closes IDOR gaps across cart/mission/collab routes

### Services (`services/*.js`) — the actual business logic
- `constraints.js` — deterministic gender resolution (never trusts the LLM's own claim)
- `catalog_filter.js` — `COLOUR_NORM` colour vocabulary + hard SQL filter builders
- `type_map.js` — free-text item description → canonical `article_type`
- `budget.js` — `sumItems`, `budgetRemaining`, `optimizeUnderBudget` (the swap/remove-to-fit-budget ladder used by both goal budgets and Approver Payer Locks)
- `outfit_assembler.js` — groups selected cart items into named outfit combinations
- `grounded_copy.js` — validates Kiya's generated copy only mentions actually-selected items/colours
- `demo_fallbacks.js` — deterministic parser (goal text → structured plan) used when the LLM is unavailable or `MOCK_LLM=true`; also the code the eval harness grades
- `llm.js` — Ollama integration (`qwen2.5:7b`), `parseGoalViaLLM`, cart rationale generation, refinement, mission planning
- `semantic_search.js` — embedding-based product search with SQL fallback
- `convergence.js` — the tabu-list/deadlock-detection engine: a rejected product never reappears for that slot, learned constraints (price ceilings/floors) accumulate from rejection reasons, conflicting constraints are detected as a deadlock before ever searching again. Powers both the Wedding Matrix's family vetoes AND Peer mode's shuttle diplomacy on plain carts.
- `mission_config.js` — community → event → allowed garment/colour mapping for the Wedding Matrix (explicitly a shallow MVP, not deep cultural research)
- `venue_memory.js` — "Don't Twin" repetition-avoidance (down-ranks, never hard-excludes, a product shipped to the same venue too often recently)
- `whisper.js` — voice-note transcription for Collab reactions

### Models (`models/index.js`) — one file, all Oracle table access
`User, Product, Cart, CartItem, CollabSession, CollabMember, Reaction, Goal, Wardrobe, Mission, MissionEvent, MissionMember, MissionSlot, Party, PartyMember`

### Database tables (Oracle)
`users, products, carts, cart_items, collab_sessions (+ ask_mode/budget_lock/item_price_cap/recipient_profile — Five Modes columns), collab_members (+ guest_name/guest_token), reactions (+ guest_name, type='vote' for Advisor), goals, wardrobes, missions, mission_events, mission_members, mission_slots, slot_rejections (the convergence engine's tabu list), parties, party_members`

### Scripts (`scripts/*.js`)
- `create_tables.sql`, `setup_db.js`, `clean_and_setup.js`, `fix_tables.js` — schema setup (older generations, schema has since drifted via additive migrations below)
- `add_context_layer_tables.js`, `add_convergence_tables.js`, `add_guest_collab.js`, `add_five_modes.js` — additive migrations, each safe to re-run
- `verify_script_a.js` — 15-check regression gate for the primary demo script (gender/colour/category correctness, budget math, grounding) — **currently 15/15**
- `verify_council_robustness.js` — 16-check regression gate for the convergence engine / Wedding Matrix — **currently 16/16**
- `verify_vocab_sync.js` — diffs the DB's actual `article_type`/`base_colour` values against what the backend code recognizes
- `debug_cart.js` — manual inspection helper

### Eval harness (`evals/`, repo root)
`goals.json` (30 hand-labeled goals: core demo scripts, Hinglish/code-mixed, contradictory signals, impossible budgets, adversarial input) + `run.js` — grades the deterministic parser and the real LLM path separately, prints known limitations by name. Deterministic parser currently 100% across every graded field.

---

## Frontend — `StyleOS-frontend/` (React 17 CRA, port 3000) — the real app

### Pages (`src/pages/`)
| File | Route | What it does |
|---|---|---|
| `Home.js` | `/` | Storefront grid (Myntra-clone shell) |
| `Product.js` | `/product/:id` | Product detail |
| `LoginPage.js` / `RegisterPage.js` | `/login`, `/register` | Auth |
| `AgentPage.js` | `/agent` | Kiya — goal text → chat → built cart, BEAT-paced streaming choreography, per-slot skeleton→product cards, clarifying-question chips, budget-shortfall chips, live refinement room |
| `CartPage.js` | `/cart/:id` | Cart view, approve, **Five Modes share picker** (Advisor/Approver/Proxy/Peer/Co-Attendee), Lookbook link after approval |
| `CollabCartPage.js` | `/collab/:token` | Shared cart — zero-friction guest join, swipe/react/comment/voice (Advisor), Payer Lock card (Approver), recipient profile form (Proxy), shuttle-diplomacy deadlock modal (Peer), live vote panel (Advisor), live presence ("Mom is looking...") |
| `PartyPage.js` | `/party/:token` | Co-Attendee mode — join with a name, attach your own cart, live clash alerts against everyone else's cart |
| `WardrobePage.js` | `/wardrobe` | Saved wardrobes |
| `CollabInvitesPage.js` | `/collab-carts` | Pending invites |
| `MissionPickerPage.js` | `/mission` | Occasion picker — Wedding and College route to full execution, everything else gets a lightweight plan-only response |
| `WeddingIntakePage.js` | `/mission/wedding` | Wedding Matrix intake form (community, city, budget, household members, events) |
| `WeddingMatrixPage.js` | `/mission/wedding/:id` | The live matrix (people × events grid), reject-slot reasons, deadlock/escalation modals, Family Council share |
| `LookbookPage.js` | `/lookbook/:type/:id` | Close/share screen for an approved cart or a completed mission |

### Components
- `components/agent/` — `AgentProductCard`, `BudgetStrip`, `FullHaulGrid`, `GroundedCopyBadge`, `OutfitGroup`, `ProductCarousel`, `ProductSheet`, `UndoSnackbar` — all the Agent results-screen building blocks
- `components/ItemCard`, `BagItemCard`, `WishListItemCard` — storefront product cards (now lazy-loading images)
- `components/Navbar` — global nav: storefront filters, search, "✨ StyleOS" (→ `/mission`), Collab, Wardrobe, Wishlist, Bag
- `components/404`, `ActiveFilters`, `Breadcrumb`, `Empty`, `FilterOptions`, `ProductSampleCarousel`, `Sort`, `ViewSimilarButton` — storefront chrome
- `containers/` — `BagContainer`, `FilterContainer`, `Modal`, `ProductDetailsContainer`, `ProductListContainer`, `ProductSamplesContainer`, `SimilarProductsContainer`, `WishListContainer` — the Myntra-clone page containers

### Design system
`src/styles/tokens.css` — single source of truth for every colour/radius/shadow used across the whole app (both the storefront and every StyleOS-specific screen). Zero hardcoded hex codes anywhere else in the codebase.

### Services
`services/api.js` (every backend call), `services/socket.js` (Socket.io client — `presence:join/leave`, `mission:deadlock/escalation/loop_guard`, `peer:deadlock/resolved`, `payer_lock:updated`, `vote:updated`, `reaction:new`, `cart:reconciled`, `party:member_joined/clash`), `context/AuthContext.js`

---

## Frontend — `styleos-frontend-next/` (Next.js 16, port 3002) — Phase 1 only

`lib/styleos/` — custom commerce provider (plain `fetch` against the same Express API, no GraphQL/Shopify). `app/page.tsx` (home grid), `app/product/[id]/page.tsx` (detail + gallery), `app/search/page.tsx`. Styled with the same `tokens.css`.

**Does not exist here yet:** Agent, Collab (any of the Five Modes), Party, Mission/Wedding Matrix, Wardrobe, Lookbook. All of that is CRA-only right now.

---

## Data pipeline — `data-pipeline/*.py`

**Live/active:**
- `catalog_vocab.py` — shared vocabulary maps (article_type, colour) that both seed scripts import, kept in sync with the backend's own `type_map.js`/`catalog_filter.js`
- `backup_catalog.py` / `restore_catalog.py` — safety net, called automatically before any reseed
- `seed_hm_catalog.py` — H&M dataset (52,263 products, real descriptions, real 896×896 photos)
- `supplement_deepfashion.py` — DeepFashion In-Shop (6,999 products with genuine multi-angle photo galleries)
- `seed_ethnic_manual.py` — hand-curated ethnic-wear supplement (60 rows, non-scraped photo sources) for the Wedding Matrix's community/event coverage
- `build_embeddings.py` — Ollama embeddings for semantic search

**Superseded, not part of the live pipeline:** `seed_paramaggarwal.py`, `merge_catalog.py`, `supplement_ethnic.py` — the old Myntra-adjacent catalog, replaced entirely by the three scripts above.

**Current catalog: 59,322 products**, sourced `hm` / `deepfashion_inshop` / `ethnic_manual_supplement` — zero Myntra/Ajio scraping.

---

## Known limitations (stated honestly, not hidden)
- Missions/carts created before the catalog reseed reference deleted product IDs — stale, expected, not fixable without recreating them.
- Ethnic-wear photography is a small (~13 unique photo) curated pool, not proper product photography — freely-licensed clean product shots of Indian ethnic wear are genuinely scarce.
- The deterministic goal parser has known gaps documented by the eval harness (word-form numbers like "teen"/"fifteen thousand", bare numbers with no currency symbol, quantities stated after the noun) — every one is named in `evals/goals.json`, not swept under the rug.
- `styleos-frontend-next` is a Phase 1 storefront shell — the actual product (Agent, Five Modes, Mission) is CRA-only.
