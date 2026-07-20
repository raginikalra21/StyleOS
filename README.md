# StyleOS — Collab Cart

A goal-based AI stylist for Myntra-style shopping. Describe a life goal in plain language, and StyleOS turns it into a real, constraint-correct cart — then keeps the whole family's shopping decision inside the app instead of scattered across WhatsApp screenshots.

**"Two minutes. One goal. No browsing."**

## What's in here

| Folder | What it is |
|---|---|
| `StyleOS-frontend/` | The full product — React 17 (CRA), Redux. Storefront, Kiya AI agent, Squad Cart (5 collab modes), Clash Engine, Wedding Wardrobe Matrix, Wardrobe, Lookbook. |
| `StyleOS-backend/` | Node/Express API, Socket.io, Oracle DB (`oracledb` thin mode), Ollama LLM integration. |
| `styleos-frontend-next/` | Next.js 16 storefront shell (Phase 1) — home, product detail, search, on a custom commerce-provider pattern. |
| `data-pipeline/` | Python scripts that build the product catalog (H&M + DeepFashion + a hand-curated ethnic-wear supplement — 59,322 real products, zero Myntra/Ajio scraping). |

## Core idea

Fashion decisions in India are rarely solo. You add something to cart, screenshot it, send it to Mom, wait, come back, change it. **Squad Cart** keeps that entire negotiation inside the product — five modes (Advisor, Approver/Payer Lock, Proxy, Peer, Co-Attendee) for five different kinds of relationships, plus a Wedding Wardrobe Matrix for coordinating an entire family's outfits across multiple events at once.

**Kiya**, the AI stylist, never lets the model pick freely from the catalog — every gender/category/colour/budget constraint is enforced in code, not by the LLM. See `CLAUDE.md` for the full invariant list.

## Running it locally

```bash
# Backend
cd StyleOS-backend
npm install
cp .env.example .env   # fill in your Oracle DB connection + JWT secret
npm start               # http://localhost:5000

# Frontend
cd StyleOS-frontend
npm install
npm start               # http://localhost:3000
```

Requires an Oracle DB instance (XE works fine locally) and Ollama running locally (`qwen2.5:7b` + `nomic-embed-text`) for live AI parsing — or set `MOCK_LLM=true` to run the core demo scripts deterministically without either.

Seed the catalog:
```bash
cd data-pipeline
pip install -r requirements.txt
python seed_hm_catalog.py
python supplement_deepfashion.py
python seed_ethnic_manual.py
```

## Demo

`/demo` on the running frontend is a presenter dashboard — one-click scenario seeding per feature, or a full 2-minute autopilot walkthrough of the whole flow: goal → AI-built cart → family review → budget lock → clash detection → wedding coordination → checkout.

## Team

Built by [Your Name] &amp; Hiyanshi, mentored by Abhinav Mishra.
