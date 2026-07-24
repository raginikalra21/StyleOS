# StyleOS — Collab Cart

I built this for Myntra's WeForShe HackerRamp because I was tired of watching how fashion shopping *actually* works in Indian households — you add something to cart, screenshot it, send it to Mom on WhatsApp, wait, come back, change it, repeat. Nobody's building for that. So this is my attempt: tell StyleOS a real-life goal in plain language, and it turns it into an actual constraint-correct cart — then keeps the whole family's back-and-forth inside the app instead of scattered across five WhatsApp chats.

**"Two minutes. One goal. No browsing."**

🔗 **Live:** [StyleOS](https://styleos-frontend.vercel.app/) &nbsp;·&nbsp; **API:** your-api.onrender.com

---

## What's actually in here

| Folder | What it is |
|---|---|
| `StyleOS-frontend/` | The main product. React 17 (CRA) + Redux. Storefront, Kiya (the AI stylist), Squad Cart with its 5 collab modes, the Live Session layer (presence, follow-me, shared control), Clash Engine, Wedding Wardrobe Matrix, Wardrobe, Lookbook. Lives on Vercel. |
| `StyleOS-backend/` | Node/Express API + Socket.io, PostgreSQL on Render, Ollama for the LLM side. |
| `styleos-frontend-next/` | A Next.js 16 shell I started for Phase 1 — home, product detail, search, built on a custom commerce-provider pattern. Still early. |
| `data-pipeline/` | Python scripts that built the actual product catalog — H&M + DeepFashion + a bunch of ethnic-wear listings I curated by hand. 59,322 real products. No scraping Myntra/Ajio, all clean sources. Images sit on Cloudflare R2. |

## The actual idea

Fashion decisions in Indian households are almost never solo decisions. Someone always needs to check with someone — Mom, a sister, whoever's paying. **Squad Cart** is my attempt to bring that negotiation into the product itself instead of leaving it to happen outside the app. Five modes for five different kinds of relationships (Advisor, Approver/Payer Lock, Proxy, Peer, Co-Attendee), plus a Live Session layer on top so people can actually see each other shopping in real time — presence, "follow my screen," request-and-grant control, kind of like FaceTime meets Figma. There's also a Wedding Wardrobe Matrix for the nightmare scenario of coordinating an entire family's outfits across multiple wedding events at once.

**Kiya**, the AI stylist, is deliberately kept on a short leash — it never gets to freely pick from the catalog. Every gender/category/colour/budget constraint is enforced in actual code, not left to the LLM to "figure out." I care about this a lot, mostly because I don't trust an LLM alone to not put a saree in a menswear budget. Full invariant list is in `CLAUDE.md`. The co-presence stuff is documented separately in `StyleOS_Live_Session_Documentation.md`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 17 (CRA) + Redux — deployed on Vercel |
| Frontend (Phase 1 shell) | Next.js 16, custom commerce-provider pattern |
| Backend | Node/Express + Socket.io — deployed on Render |
| Database | PostgreSQL on Render (moved off Oracle partway through — long story) |
| Object storage | Cloudflare R2 for product images, served via public bucket URLs |
| LLM | Ollama running `qwen2.5:7b` + `nomic-embed-text`, with a deterministic `MOCK_LLM` fallback for when I don't want to spin up a local model just to demo something |

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

**Backend `.env` — you'll need these:**

```bash
DATABASE_URL=postgres://user:pass@host:5432/styleos
JWT_SECRET=your_jwt_secret

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=styleos-catalog-images
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Ollama (optional — skip it and set MOCK_LLM=true if you don't want to run a local model)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
MOCK_LLM=false
```

You'll need a Postgres instance (Render's free tier works, or just run one locally), and if you want live AI parsing rather than the mocked version, Ollama running locally with `qwen2.5:7b` + `nomic-embed-text`. If you just want to poke around the core demo without setting any of that up, `MOCK_LLM=true` gets you a fully deterministic version.

**Seeding the catalog** (this uploads images to R2 and writes everything into Postgres, so it takes a minute):
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
| Frontend (CRA) | Vercel | Auto-deploys off `main`; set `REACT_APP_API_URL` to the Render backend URL |
| Backend (API + sockets) | Render | Web Service; all the backend `.env` keys above go in as Render env vars |
| Database | Render Postgres | Managed instance — run migrations before the first deploy or nothing will work |
| Product images | Cloudflare R2 | Public bucket; the data-pipeline scripts push directly to it while seeding |

One thing that tripped me up: Socket.io needs a Render plan that supports WebSockets, but that's the default on Render web services, so it's really only worth mentioning in case you're on something else.

## Demo

`/demo` on the live frontend is a presenter dashboard I built specifically for pitching this — you can one-click seed a scenario for any single feature, or run the full 2-minute autopilot version that walks through everything end to end: goal → AI-built cart → family review → budget lock → clash detection → wedding coordination → checkout.

## Docs

- `CLAUDE.md` — the full product spec and the correctness invariants I'm not willing to compromise on
- `StyleOS_Project_Documentation.pdf` — the complete writeup, problem statement through backend internals
- `StyleOS_Live_Session_Documentation.md` — the presence/follow-me/shared-control layer
- `FRONTEND_STATUS.md` — a route-by-route, service-by-service map of the codebase for when I inevitably forget what I built
- `evals/goals.json` + `evals/run.js` — the test suite I use to check parser accuracy

## Team

Built by Ragini Kalra & Hiyanshi.
