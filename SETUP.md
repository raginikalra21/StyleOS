# StyleOS — Setup Guide

## One-time setup (do this first)

### 1. Install Ollama model (downloading now — ~4.7GB)
```
ollama pull qwen2.5:7b
```

### 2. Set up Oracle database (you already have Oracle 21c ✅)
Run the schema creation script in SQL*Plus or SQL Developer:
```
sqlplus system/your_password@localhost:1521/XE @StyleOS-backend/src/scripts/create_tables.sql
```
Or open SQL Developer → connect to XE → run the script.

### 3. Configure backend environment
```
cd StyleOS-backend
copy .env.example .env
```
Edit `.env` — update DATABASE_URL with your postgres password.

### 4. Install backend dependencies
```
cd StyleOS-backend
npm install
```

### 5. Install frontend dependencies
```
cd StyleOS-frontend
npm install --legacy-peer-deps
```

### 6. Install Python pipeline dependencies
```
cd data-pipeline
pip install -r requirements.txt
```

### 7. Install Whisper for voice notes
```
pip install openai-whisper
```
Also install ffmpeg: https://ffmpeg.org/download.html (add to PATH)

### 8. Download datasets
```
pip install kaggle
# Configure kaggle API key first: https://www.kaggle.com/docs/api
kaggle datasets download -d hiteshsuthar101/myntra-fashion-product-dataset -p data-pipeline/raw --unzip
kaggle datasets download -d shivamb/fashion-clothing-products-catalog -p data-pipeline/raw --unzip
```

### 9. Seed the database
```
cd data-pipeline
python merge_catalog.py
```

---

## Running the app

### Terminal 1 — Ollama (LLM)
```
ollama serve
```

### Terminal 2 — Backend
```
cd StyleOS-backend
npm run dev
```

### Terminal 3 — Frontend
```
cd StyleOS-frontend
npm start
```

App runs at: http://localhost:3000
Backend at: http://localhost:5000

---

## For demo — expose to public URL (ngrok)

### Install ngrok: https://ngrok.com/download
```
ngrok http 5000
```
Copy the https URL → update PUBLIC_URL in StyleOS-backend/.env
Update REACT_APP_API_URL in StyleOS-frontend/.env to the ngrok URL.

Anyone with the ngrok URL can use the app from their phone while your laptop is running.

---

## Project structure

```
StyleOS-backend/         Node.js + Express + Socket.io + Sequelize
  src/
    routes/              auth, products, cart, collab, agent, wardrobe
    models/              User, Product, Cart, CartItem, CollabSession, etc.
    services/            llm.js (Ollama), whisper.js (local transcription)
    sockets/             real-time event handlers

StyleOS-frontend/        React + Redux (forked from tm2k23/myntra)
  src/
    pages/               AgentPage, CollabCartPage
    services/            api.js, socket.js
    context/             AuthContext.js

data-pipeline/           Python — dataset merge + PostgreSQL seed
  merge_catalog.py
  raw/                   put downloaded CSV files here
```

---

## Tech stack (all free)

| Component | Tool | Cost |
|-----------|------|------|
| LLM | Ollama + qwen2.5:7b | Free |
| Voice | Whisper (local) | Free |
| Database | PostgreSQL | Free |
| Real-time | Socket.io | Free |
| Frontend | React | Free |
| Public URL | ngrok | Free |
| Hosting | Your laptop | Free |
