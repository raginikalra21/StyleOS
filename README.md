# StyleOS — Collab Cart

A goal-based AI stylist for Myntra-style shopping. Describe a life goal in plain language, and StyleOS turns it into a real, constraint-correct cart — then keeps the whole family's shopping decision inside the app instead of scattered across WhatsApp screenshots.

**"Two minutes. One goal. No browsing."**

🔗 **Live:** [[StyleOS](https://styleos-frontend.vercel.app/)](#) &nbsp;·&nbsp; **API:** [your-api.onrender.com](#)

---

## What's in here

| Folder | What it is |
|---|---|
| `StyleOS-frontend/` | The full product — React 17 (CRA), Redux. Storefront, Kiya AI agent, Squad Cart (5 collab modes), Live Session layer (presence, follow-me, shared control), Clash Engine, Wedding Wardrobe Matrix, Wardrobe, Lookbook. Deployed on **Vercel**. |
| `StyleOS-backend/` | Node/Express API, Socket.io, **PostgreSQL** (hosted on **Render**), Ollama LLM integration. Deployed on **Render**. |
| `styleos-frontend-next/` | Next.js 16 storefront shell (Phase 1) — home, product detail, search, on a custom commerce-provider pattern. |
| `data-pipeline/` | Python scripts that build the product catalog (H&M + DeepFashion + a hand-curated ethnic-wear supplement — 59,322 real products, zero Myntra/Ajio scraping). Product images served from **Cloudflare R2**. |

## Core idea

Fashion decisions in India are rarely solo. You add something to cart, screenshot it, send it to Mom, wait, come back, change it. **Squad Cart** keeps that entire negotiation inside the product — five modes (Advisor, Approver/Payer Lock, Proxy, Peer, Co-Attendee) for five different kinds of relationships, plus a **Live Session layer** on top (presence, "follow my screen," request-and-grant control — FaceTime/Figma-style) and a Wedding Wardrobe Matrix for coordinating an entire family's outfits across multiple events at once.

**Kiya**, the AI stylist, never lets the model pick freely from the catalog — every gender/category/colour/budget constraint is enforced in code, not by the LLM. See `CLAUDE.md` for the full invariant list, and `StyleOS_Live_Session_Documentation.md` for the co-presence layer.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 17 (CRA) + Redux, deployed on **Vercel** |
| Frontend (Phase 1 shell) | Next.js 16, custom commerce-provider pattern |
| Backend | Node/Express, Socket.io, deployed on **Render** |
| Database | **PostgreSQL**, hosted on **Render** (migrated from Oracle) |
| Object storage | **Cloudflare R2** — product images, served via public bucket URLs |
| LLM | Ollama (`qwen2.5:7b` + `nomic-embed-text`), with a deterministic `MOCK_LLM` fallback |

## Running it locally

```bash
# Backend
cd StyleOS-backend
npm install
cp .env.example .env   # fill in your Postgres connection string, R2 credentials, JWT secret
npm start               # http://localhost:5000

# Frontend
cd StyleOS-frontend
npm install
npm start               # http://localhost:3000
```

**Backend `.env` — required keys:**

```bash
DATABASE_URL=postgres://user:pass@host:5432/styleos
JWT_SECRET=your_jwt_secret

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=styleos-catalog-images
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Ollama (optional — omit + set MOCK_LLM=true to run without a local model)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
MOCK_LLM=false
```

Requires a Postgres instance (a free Render Postgres works fine, or run one locally) and, for live AI parsing, Ollama running locally with `qwen2.5:7b` + `nomic-embed-text` — or set `MOCK_LLM=true` to run the core demo scripts deterministically without either.

**Seed the catalog** (uploads product images to R2 and writes rows to Postgres):
```bash
cd data-pipeline
pip install -r requirements.txt
python seed_hm_catalog.py
python supplement_deepfashion.py
python seed_ethnic_manual.py
```

## Deployment

| Service | Platform | Notes |
|---|---|---|
| Frontend (CRA) | **Vercel** | Auto-deploys from `main`; set `REACT_APP_API_URL` to the Render backend URL |
| Backend (API + sockets) | **Render** | Web Service; set all backend `.env` keys above as Render environment variables |
| Database | **Render Postgres** | Managed instance; run migrations before first deploy |
| Product images | **Cloudflare R2** | Public bucket; `data-pipeline` scripts upload directly during seeding |

Socket.io requires the Render service plan to support WebSocket connections (standard on Render web services — no extra config needed beyond the default).

## Demo

`/demo` on the running frontend is a presenter dashboard — one-click scenario seeding per feature, or a full 2-minute autopilot walkthrough of the whole flow: goal → AI-built cart → family review → budget lock → clash detection → wedding coordination → checkout.

## Docs

- `CLAUDE.md` — full product spec and non-negotiable correctness invariants
- `StyleOS_Project_Documentation.pdf` — complete project reference, problem statement through backend internals
- `StyleOS_Live_Session_Documentation.md` — the presence/follow-me/shared-control layer
- `FRONTEND_STATUS.md` — route-by-route, service-by-service codebase reference
- `evals/goals.json` + `evals/run.js` — parser accuracy test suite

## Team

Built by [Your Name] &amp; Hiyanshi, mentored by Abhinav Mishra.
