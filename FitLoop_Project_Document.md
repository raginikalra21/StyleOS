# StyleOS
## Myntra WeForShe HackerRamp 2026 — Final Project Document
### Theme 3: Fashion is Identity

---

## The Pitch

> "People shouldn't have to shop anymore. They should only have to describe what they're trying to achieve. StyleOS understands the goal, shops Myntra autonomously like a human, invites your family to review the cart collaboratively, and returns a final wardrobe ready to approve — in under two minutes."

**The paradigm shift:**

```
TODAY          User intent → search → filter → browse → compare → WhatsApp family → come back → checkout
STYLEOS        User states goal → AI shops → family reviews inside app → AI refines → approve
```

The user does two things: **describe the goal** and **approve the cart.**

---

## Why This Is Different From Every Existing AI Shopping Tool

| Tool | What it does | What it cannot do |
|------|-------------|-------------------|
| Amazon Rufus | Answers questions about products | Does not shop, does not execute |
| Google Shopping AI | Surfaces products from search | Still requires manual browsing and deciding |
| ChatGPT / Perplexity shopping | Recommends products, links to stores | Does not control the store, does not act |
| Myntra's recommendation engine | Personalizes catalog | User still does all browsing and deciding |
| Browser Use / OpenAI Operator | General browser automation | Not fashion-specific, no wardrobe reasoning, no collaboration layer |
| **StyleOS** | Autonomous fashion goal execution + collaborative family approval | — |

The combination of three things that do not exist together anywhere:
1. Fashion-specific contextual reasoning (cultural, seasonal, occasion, wardrobe compatibility)
2. Autonomous execution on a live storefront
3. Collaborative review that replaces the WhatsApp screenshot loop

---

## The Core Insight

<cite index="1-3,1-4,1-5">One behavior we noticed is that young Indians don't actually make their buying decision on Myntra. They add products to their cart, take screenshots, send them to family or friends on WhatsApp, wait for opinions, come back, remove products, add new ones, and repeat. The final purchase decision happens outside the shopping app.</cite>

<cite index="1-6">We started wondering: what if the entire shopping and decision-making process stayed inside Myntra?</cite>

Open with this in the pitch. Every judge in the room — especially anyone who has bought clothes in India — will immediately recognize it as true.

---

## What StyleOS Is

<cite index="1-7,1-8,1-9,1-10,1-11">Instead of another AI stylist or recommendation engine, StyleOS is an autonomous shopping agent. A user can simply give a goal like: "I'm joining college. My budget is 15k. I need 3 T-shirts, 2 jeans, sneakers and a backpack. I prefer black, grey and minimal designs." The AI understands the situation and then executes the shopping task, not just recommends products.</cite>

<cite index="1-12">It searches Myntra, applies filters, compares products, reads reviews, optimizes the budget, finds coupons, and builds multiple complete carts live on screen. The shopping process becomes goal-driven instead of search-driven.</cite>

---

## Three Components (All Built, Fully Working)

### Component 1 — Goal-to-Cart Engine

**Input:** Natural language goal from the user.

**Examples:**
```
"Starting college next month. Budget ₹15,000.
 Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie.
 Black/grey only. No flashy logos. Everything should match.
 Delhi. Hostel. Need before August 15."

"First internship at Infosys, Bangalore.
 Budget ₹12,000. Already own black shoes. Need before Aug 10.
 I hate ironing."

"Cousin's Punjabi wedding. Guest, not family.
 Budget ₹8,000. One ethnic, one semi-formal."
```

**What the AI does:**

```
STEP 1 — PLAN
  Parse goal into structured shopping requirements:
  - Item list with quantities
  - Budget allocation per category
  - Color / style constraints
  - Delivery deadline
  - Contextual inferences:
      "Hostel + Delhi" → dark colors, easy wash, wrinkle-resistant
      "Bangalore August" → avoid linen, wrinkle-free fabrics
      "Punjabi wedding guest" → salwar/lehenga range, not too elaborate
      "I hate ironing" → filter for wrinkle-free fabric attribute

STEP 2 — EXECUTE
  AI agent navigates the storefront:
  - Searches each item category
  - Applies correct filters (fit, fabric, occasion, price range)
  - Opens product pages, reads descriptions and reviews
  - Checks delivery date vs. user deadline
  - Evaluates outfit compatibility across items in cart
  - Applies available coupons

STEP 3 — OPTIMIZE
  - Balances total cost against budget dynamically
  - Ensures outfit combinations work together
  - Swaps expensive items for equivalent alternatives if over budget
  - Replaces items whose delivery date misses the deadline

STEP 4 — PRESENT
  Final cart with:
  - Item summary
  - Budget breakdown (spent vs. remaining)
  - Outfit combinations possible with these items
  - Delivery timeline per item
  - Savings from coupons applied
```

<cite index="1-13,1-14,1-15">The AI also understands context beyond keywords. For example, if someone says they're shopping for a wedding, it understands whether it's a Punjabi wedding, Bengali wedding, Nikah, Tamil wedding, etc., and plans the cart around that context. Similarly, it can understand life transitions like joining college, first job, gym journey, moving to Bangalore, vacations, festivals, etc.</cite>

---

### Component 2 — Squad Cart (Collaborative Review)

<cite index="1-16,1-17,1-18">Instead of taking screenshots, the user can simply share a live collaborative cart. Family or friends can browse products together, swipe through images, leave comments or voice notes, and approve or reject products. The AI understands everyone's feedback and re-plans the shared cart while preserving the constraints already agreed on. Instead of people discussing on WhatsApp, the discussion happens inside the shopping experience itself.</cite>

#### How the share works

AI builds the cart → user taps **"Share with family"** → a unique Squad Cart link is generated instantly → user sends it over WhatsApp (one tap, native share sheet).

Mom opens the link on her phone. No app download. No login required. Squad Cart opens directly in her mobile browser — fully responsive, feels native.

#### The Squad Cart UI (mobile, touch-first)

```
┌─────────────────────────────────┐
│  Jai's College Wardrobe  8 items │
│  ₹14,840  •  Delivery by Aug 15  │
├─────────────────────────────────┤
│                                  │
│   [Product image — full width]   │
│   ← swipe for more views →       │
│                                  │
│   Oversized Tee — Black          │
│   H&M  •  ₹799  •  M            │
│   ⭐ 4.3  •  Delivery Aug 12     │
│                                  │
│   [View Product ↗]               │
│                                  │
│   ❤️  ❌  💬  🎤                  │
│                                  │
│   ↓ swipe up for next product    │
└─────────────────────────────────┘
```

**Vertical scroll (swipe up/down)** = move between products in the cart. One product fills the screen at a time.

**Horizontal swipe (left/right)** = see all image views of the current product — Front → Back → Detail closeup → Model shot. Price is always visible. No need to open anything.

**"View Product ↗" button** = opens the full product page on the Myntra clone in a new sheet. One back swipe returns to exactly where she was in the Squad Cart — she never loses her place.

**Reactions per product:**
- ❤️ Love it
- ❌ Skip it
- � Text comment ("too bright", "looks cheap", "size?")
- 🎤 Voice note — recorded in Hindi, English, or whatever — LLM transcribes and understands

All reactions appear on the original user's screen live, next to each product.

#### Native integration in the Myntra clone

When the Squad Cart link is shared with Mom, her profile on the Myntra clone automatically gets a **"Collab Carts"** section in her navigation. She can access the cart both ways:

- **Direct link** (from WhatsApp) — opens Squad Cart immediately
- **App nav** → Collab Carts tab → Jai's Wardrobe appears there

This means the collaboration is a first-class feature of the storefront, not just a share link. It lives inside the app experience.

#### AI reconciles all feedback

```
Mom:     ❌ Polo 1  |  ❌ Polo 2  |  🎤 "yeh itna plain hai"
Brother: ❤️ Polo 3  |  💬 "blue wala better hai"
Dad:     💬 "too casual?"  (context: college — AI flags as fine, ignores)

AI reconciliation:
  Mom rejected 2 polos — treating that as a new family constraint
  Brother prefers blue variant — adding that preference to the plan
  Dad's concern resolved by context (college casual, not professional)
  Mission re-solved with budget, approvals, and outfit compatibility preserved
  Budget still ₹14,840 ✓
  Shared cart updated. Notifying Jai.
```

This is AI-mediated family decision-making for fashion. Not cart sharing, and not just alternate recommendations. A live collaborative session where the AI is a silent participant who understands everyone's feedback, re-solves the mission, and acts on the updated shared plan.

---

### Component 3 — Identity Preview + Wardrobe

<cite index="1-19,1-20">Instead of ending at checkout, the AI creates an Identity Preview. For example: "Your First College Wardrobe — fits your 15k budget, 15+ mix-and-match outfits, can be saved and reused later." The idea is to move from buying individual products to building complete wardrobes around a person's current life stage.</cite>

The user sees their wardrobe as a visual lookbook — not a cart of individual items. Each outfit combination is rendered. The wardrobe can be saved, revisited, and extended.

**Continuous agent (living cart):**
```
Tonight:   Nike price dropped ₹1,200. Cart updated. Saved ₹1,200.
Tomorrow:  Coupon COLLEGE15 available. Applied. Saved ₹900.
Day after: Seller for item #3 delayed to Aug 17 — past deadline.
           Switched to alternate seller, same item, delivery Aug 8.
```

The agent keeps working after the cart is approved. The user gets notified. They approve or ignore each change.

---

## Technical Architecture (Full Working Build)

### Platform Architecture

This is one single full-stack web application — not a demo wrapper, not a prototype. Both Jai and Mom use the **same app**, same URL, same login system. It behaves like a real product.

---

### Frontend Base Repo

**Do not use ShubhangiSisodia/Myntra-Clone** — it is HTML/CSS/JS + Node.js, no component architecture, not extendable for real-time features or dynamic routing.

**Use one of these React-based repos instead:**

| Repo | Stack | Why it's better |
|------|-------|-----------------|
| `harshau9/Myntra-Clone` | React | Team project, closest to real Myntra layout |
| `tm2k23/myntra` | React + Redux | Has filters, sorting, bag, wishlist, search already built |
| `AMARDEEP115/Myntra-Clone` | React | Collaborative build, 5-day sprint, good structure |
| `abhiram11/Myntra-Clone-ReactJS` | React + Redux + styled-components | Cleanest component structure to extend |

**Recommended:** Fork `tm2k23/myntra` or `abhiram11/Myntra-Clone-ReactJS` — both already have the filter/sort/cart/wishlist plumbing done. You extend them, not rebuild them.

**Your full stack on top of the fork:**
- Replace the tiny dummy JSON catalog with your merged Kaggle database (PostgreSQL + API)
- Add auth (NextAuth.js or JWT)
- Add Squad Cart routes + WebSocket layer
- Add the StyleOS agent UI panel
- Add Collab Carts nav tab

---

### Product Catalog — Three Datasets Merged

Use all three datasets. Merge them into one unified PostgreSQL table. Combined coverage: **~75,000+ unique products** across apparel, footwear, accessories, ethnic wear, western, kids — diverse enough to handle any goal the agent gets.

---

**Dataset 1 — `paramaggarwal/fashion-product-images-dataset`**
~44,000 products. The best dataset for this project.

Key columns:
```
id, gender, masterCategory, subCategory, articleType,
baseColour, season, year, usage, productDisplayName
+ images in /images/{id}.jpg
```

Covers: Apparel, Footwear, Accessories, Personal Care, Free Items
Genders: Men, Women, Boys, Girls, Unisex
Usage tags: Casual, Formal, Sports, Ethnic, Party, Smart Casual, Travel

**What to add synthetically for demo:**
- `price` (INR) — generate by category: tees ₹499–₹1,499, jeans ₹999–₹2,999, etc.
- `mrp` (original price, ~20–40% above price)
- `rating` — random 3.5–4.8 per product
- `delivery_days` — 3–7 based on category
- `brand` — map from productDisplayName (already contains brand names)
- `fabric` — map from articleType + usage

---

**Dataset 2 — `hiteshsuthar101/myntra-fashion-product-dataset` or `djagatiya/myntra-fashion-product-dataset`**
~15,000 products. Real Myntra-scraped CSVs.

Key columns:
```
ProductName, ProductBrand, Gender, Price (INR), NumImages,
Description, PrimaryColor
+ actual Myntra CDN image URLs
```

This dataset has **real INR prices** already — use these as-is. Covers brands like H&M, Roadster, HRX, Puma, Nike, Biba, W, Libas — exactly what the agent should recommend.

---

**Dataset 3 — `Gssmc/myntra_dataset` (HuggingFace) or `shivamb/fashion-clothing-products-catalog` (Kaggle)**
~10,000–15,000 products. Strong on product descriptions and ethnic wear.

Key columns:
```
title, brand, category, description, price, color,
fabric, occasion, image_url
```

Strong coverage of ethnic wear (kurtas, sarees, lehengas, sherwanis) — critical for the wedding/festival use cases that make cultural reasoning shine.

---

### Merge Strategy

```python
# Unified schema for PostgreSQL products table
{
  "id":            "UUID (generated)",
  "source":        "paramaggarwal | myntra_scraped | clothing_catalog",
  "title":         "product display name",
  "brand":         "extracted or mapped",
  "gender":        "Men | Women | Boys | Girls | Unisex",
  "master_category": "Apparel | Footwear | Accessories",
  "sub_category":  "Topwear | Bottomwear | Ethnic | Shoes | Bags...",
  "article_type":  "Tshirts | Jeans | Kurtas | Sneakers | Sarees...",
  "occasion":      "Casual | Formal | Ethnic | Sports | Party | Wedding",
  "season":        "Summer | Winter | Fall | All Season",
  "base_colour":   "Black | White | Navy | Red...",
  "fabric":        "Cotton | Polyester | Linen | Silk | Denim...",
  "price":         "integer (INR)",
  "mrp":           "integer (INR, original)",
  "rating":        "float 3.5–4.8",
  "rating_count":  "integer",
  "delivery_days": "integer 3–7",
  "images":        "array of image URLs",
  "description":   "text",
  "in_stock":      "boolean",
  "sizes":         "array: [S, M, L, XL, XXL] or [6, 7, 8, 9, 10]"
}
```

**Merge script outline (Python):**
```python
import pandas as pd

# Load all three
df1 = pd.read_csv("paramaggarwal/styles.csv")        # 44k rows
df2 = pd.read_csv("myntra_scraped/products.csv")      # 15k rows
df3 = pd.read_csv("clothing_catalog/products.csv")    # 10k rows

# Normalize column names to unified schema
# Map article_type → fabric (lookup table)
# Generate price where missing (category-based ranges)
# Generate delivery_days (3–7, weighted by category)
# Merge image paths / URLs

merged = pd.concat([df1_normalized, df2_normalized, df3_normalized])
merged.drop_duplicates(subset=["title", "brand"], inplace=True)
merged.to_csv("unified_catalog.csv", index=False)
# → seed into PostgreSQL: psql COPY or SQLAlchemy bulk insert
```

**Final catalog after merge and dedup:** ~60,000–70,000 products covering:
- Men's western: tees, shirts, jeans, trousers, shorts, jackets
- Women's western: dresses, tops, jeans, skirts, co-ords
- Ethnic (men + women): kurtas, sarees, lehengas, sherwanis, salwar suits
- Footwear: sneakers, formal shoes, sandals, heels, slippers
- Accessories: bags, belts, sunglasses, watches, jewellery
- Kids: boys and girls apparel + footwear
- Sports: gym wear, activewear, sports shoes

---

### Database Schema (PostgreSQL)

```sql
users
  id, name, email, password_hash, avatar_url, created_at

products
  id, title, brand, price, mrp, images[] (array of URLs),
  fabric, category, subcategory, color, size_options[],
  occasion, season, rating, delivery_days, stock

carts
  id, owner_user_id, name ("Jai's College Wardrobe"),
  total_price, status (active/approved/checked_out), created_at

cart_items
  id, cart_id, product_id, size, quantity, added_by_user_id, added_at

collab_sessions
  id, cart_id, share_token (UUID — the link token),
  created_at, expires_at (null = never expires)

collab_members
  id, session_id, user_id, joined_at
  -- created when Mom taps the link and logs in

reactions
  id, cart_item_id, user_id,
  type ENUM('love', 'skip', 'comment', 'voice'),
  content (text or voice note URL), created_at

wardrobes
  id, user_id, name, cart_id,
  outfit_combinations (JSONB), saved_at

goals
  id, user_id, raw_text, parsed_plan (JSONB),
  status (planning/shopping/done), created_at
```

Everything persists across refresh, across sessions, across devices. Nothing is in-memory only.

---

### Auth System

Standard session-based auth (NextAuth.js or Passport.js):

- Email + password registration / login
- Google OAuth option
- JWT stored in httpOnly cookie → persists across refresh
- Session tied to user_id → cart, collab memberships, wardrobe all load on login

When Mom taps the share link:
- If she's already logged in → collab cart added to her account instantly
- If not logged in → redirected to login/signup → after auth, she's redirected back to the collab cart → cart added to her account
- Cart now permanently appears in her **"Collab Carts"** nav tab on every session

---

### Full Stack

```
FRONTEND (Next.js + React + Tailwind)
───────────────────────────────────────────────────────
  / (Home)              — Myntra-style storefront, search, filters
  /product/[id]         — Full PDP with images, fabric, delivery, reviews
  /cart                 — User's own cart
  /collab/[token]       — Squad Cart (mobile-first, touch UI)
  /collab-carts         — All collab carts shared with this user
  /wardrobe             — Identity Preview, saved outfit combinations
  /agent                — Goal input + live agent progress view

        ↓

API LAYER (Next.js API routes / Express)
───────────────────────────────────────────────────────
  POST /api/auth/login|register
  GET  /api/products?q=&category=&price_max=&fabric=&occasion=
  POST /api/carts                    — create cart
  POST /api/carts/:id/items          — add item
  POST /api/collab                   — generate share token
  POST /api/collab/:token/join       — Mom joins → collab_member created
  POST /api/collab/:token/react      — post reaction / voice note
  GET  /api/collab/:token            — fetch full collab session + reactions
  POST /api/agent/plan               — send goal → LLM returns shopping plan
  POST /api/agent/execute            — trigger browser agent
  POST /api/agent/reconcile          — send reactions → LLM updates cart

        ↓

REAL-TIME LAYER (Socket.io)
───────────────────────────────────────────────────────
  Room: collab_session_{token}
  Events:
    reaction:new       — Mom taps ❤️/❌/💬/🎤 → Jai sees it live
    cart:updated       — AI reconciles and updates → both screens refresh
    member:joined      — "Mom joined the session"
    agent:progress     — browser agent step updates during shopping

        ↓

LLM PLANNER (GPT-4o / Claude Sonnet via API)
───────────────────────────────────────────────────────
  Input:  raw goal text
  Output: structured shopping plan JSON
  {
    items: [{ type, qty, budget, constraints }],
    context: { occasion, city, season, life_stage, cultural_notes },
    deadline: "2025-08-15",
    total_budget: 15000
  }

        ↓

BROWSER AGENT (Playwright — operates on the same Next.js app)
───────────────────────────────────────────────────────
  Runs against the live local storefront (same app, different session)
  Executes: search → filter → read PDP → evaluate → add to cart
  Visible mode during demo: judges watch the cursor move
  Steps streamed live to frontend via Socket.io agent:progress events

        ↓

REASONING ENGINE (LLM calls mid-agent)
───────────────────────────────────────────────────────
  Outfit compatibility check across cart items
  Budget rebalancing when total exceeds limit
  Delivery validation against user deadline
  Cultural/contextual constraint application
  Feedback reconciliation: Mom's reactions → cart diff

        ↓

VOICE NOTE PIPELINE
───────────────────────────────────────────────────────
  Browser MediaRecorder API → audio blob
  Uploaded to server → OpenAI Whisper API transcription
  Transcribed text → LLM for intent extraction
  Understood as structured feedback → fed to reconciliation engine

        ↓

MEMORY LAYER (PostgreSQL + session context)
───────────────────────────────────────────────────────
  Past goals and wardrobes stored per user
  "Remember my internship wardrobe? Need winter version."
    → loads previous goal + cart from DB → LLM builds on top of it
  Family preference profiles built from collab reaction history

        ↓

CONTINUOUS AGENT (background job — Node.js cron / BullMQ)
───────────────────────────────────────────────────────
  Polls cart items every N minutes
  Price drop detection → swap item → notify user
  Coupon matching → apply → notify
  Delivery date drift → find alternate seller → notify
  Each change queued as notification → user approves or ignores
```

---

## The Demo (4 Minutes, Fully Live)

No mockups. No pre-filled responses. Everything runs in real time.

---

**0:00–0:20 — Open with the insight**

*"Before buying clothes, most young Indians don't checkout. They take screenshots and send them to their family on WhatsApp."*

Let the room nod.

*"We asked one question: why are people leaving the shopping experience to collaborate? And we built the product that keeps the entire decision — including the family — inside the shopping experience."*

---

**0:20–0:40 — Type the goal**

```
Starting college next month. Budget ₹15,000.
Need 3 oversized tees, 2 cargos, 2 jeans, 1 hoodie.
Black/grey only. No logos. Hostel. Delhi.
Need before August 15.
```

Press Enter.

---

**0:40–2:00 — Watch the agent shop**

The Myntra-clone storefront opens in the demo pane. The audience watches:
- Search bar fills: "oversized tee men black"
- Filters click: cotton, regular fit, under ₹799
- Products scan, two open
- First item adds to cart — budget tracker ticks
- Agent flags item #4: delivery August 17, past deadline
- Agent swaps seller — delivery now August 11
- Coupons checked — one applied

**Real automation. Real product data. Real reasoning. Live.**

---

**2:00–3:00 — Squad Cart**

Cart built. User taps **"Share with Mom"** → WhatsApp opens with the Squad Cart link. Mom taps it on her phone. She's not logged in — quick signup, 10 seconds. She's in.

Squad Cart opens. The collab cart is now permanently saved in her **"Collab Carts"** tab — it'll be there on every future login, won't disappear.

She swipes up — next product. Swipes right on the polo — back image loads, then detail shot, price always visible. Taps **"View Product ↗"** — full PDP opens as an overlay on the same app. Back swipe — she's back in Squad Cart, same position.

She taps ❌ on the grey polo. Holds the mic button, says: *"yeh itna plain hai, blue wala better tha."* Voice note uploads. Whisper transcribes. LLM understands.

On Jai's screen — live: reaction appears next to Polo 1. AI processes.

AI: *"Mom's veto changed the styling constraint. I re-planned the affected look around the blue preference, kept the existing approvals, and the budget is still ₹14,840."*

Both screens update. Database persists the change. Neither screen loses state on refresh.

---

**3:00–3:30 — Identity Preview**

Cart transitions to wardrobe view. 15 outfit combinations rendered. Summary card:
```
Your First College Wardrobe
  8 items  |  15+ outfits  |  ₹14,840
  All delivery before Aug 15
  Saved ₹2,100 through coupons and swaps
```

---

**3:30–4:00 — Approve**

One tap. Cart goes to checkout. *"Two minutes. One goal. No browsing."*

---

## Why This Fits Theme 3

<cite index="1-21,1-22">Existing AI shopping assistants mostly recommend products for a single search. StyleOS instead understands a user's intent and life context, completes a multi-item shopping mission within constraints, keeps collaborative decision-making inside Myntra instead of WhatsApp, and acts autonomously rather than waiting for repeated user input.</cite>

Theme 3 is about Gen Z using fashion to signal who they are. StyleOS addresses this at every level:

- **Gen Z thinks in goals, not products.** "I need to look like I belong at Infosys without trying too hard" is how Gen Z shops. Searching for "slim fit formal shirt" is how their dad shops. StyleOS speaks their language.

- **Fashion is communal.** Squad Cart reflects how fashion decisions are actually made in India — collectively, with family input, with opinions and negotiation. The product makes that process effortless and immediate.

- **Identity is contextual.** A college wardrobe, a wedding wardrobe, a Goa wardrobe — these are different identity expressions. StyleOS plans for each one, understands the context, and builds accordingly. It doesn't recommend products. It understands who you're trying to be.

---

## Business Impact

| Metric | Direction | Mechanism |
|--------|-----------|-----------|
| Session-to-cart conversion | +35% to +50% | AI eliminates browsing drop-off — complete cart from one prompt |
| Cart abandonment | –25% to –40% | Family approval built into flow removes post-cart hesitation |
| Average Order Value | +15% to +25% | AI builds complete wardrobes, not single items |
| Time to checkout | –70% to –80% | 2-minute goal → cart vs. 45-minute browse |
| First-time buyer conversion (Tier 2/3) | Significantly higher | Natural language input removes the skill barrier of learning Myntra's filter system |

---

## Scalability and Future Roadmap

```
StyleOS Platform
├── Goal-to-Cart Engine     (shipped) — autonomous wardrobe building
├── Squad Cart              (shipped) — collaborative purchase decisions
├── Memory Layer            (Year 2) — cross-session wardrobe awareness
├── Continuous Agent        (Year 2) — price/coupon/delivery optimization
├── Occasion Planner        (Year 3) — wedding, travel, festival packs
├── Style Identity Profile  (Year 3) — evolves your aesthetic over time
├── Creator Integration     (Year 4) — "shop this look" → agent executes
└── Social Commerce         (Year 4) — squads shop together in real time
```

The platform vision: an AI operating system for personal fashion. Not a feature inside Myntra — the new interface layer through which Gen Z interacts with fashion commerce. Just as search boxes replaced catalogs, shopping goals replace search boxes.

---

## Rubric Alignment

| Criterion | Weight | StyleOS's case |
|-----------|--------|---------------|
| Problem Statement | ×1 | Grounded in a real and observable Indian shopping behavior — the WhatsApp screenshot loop — that judges will immediately recognize as true |
| Relevance | ×1 | Directly addresses Theme 3: Gen Z's relationship with fashion as identity and community. Goal-based interaction is how Gen Z thinks about fashion |
| Innovation & Technology | ×3 | Autonomous commerce agent + fashion-specific contextual reasoning + collaborative social layer. No existing product combines all three. LLM role is structural. Technically demanding: LLM planning, browser automation, real-time collaboration, wardrobe reasoning, agentic loops |
| Impact & Roadmap | ×1 | Measurable improvements to conversion, AOV, and time-to-checkout. Clear platform vision extending to creator integration, occasion planning, social commerce |
| Execution Excellence | ×4 | Demo is fully live — judges watch the AI control the storefront in real time. Squad Cart is tactile and immediately relatable. Kaggle dataset + open-source UI = buildable and demonstrable without infrastructure risk |
