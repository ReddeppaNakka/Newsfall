# Newsfall — Ultra-Premium Tech & AI Tracker

A 100% free-stack, open-source platform that tracks the latest in programming languages,
frameworks, and frontier AI models. Data is **never hardcoded** — a daily Python job
scrapes the web, uses a free LLM to structure the updates, and upserts them into Supabase.
The Next.js 15 frontend renders that live data with a premium dark, glassmorphic UI.

```
┌─────────────────┐     daily cron      ┌──────────────────┐     fetch (SSR)    ┌──────────────┐
│ GitHub Actions  │  ────────────────▶  │  Supabase (free) │  ───────────────▶  │  Next.js 15  │
│  scraper.py     │   upsert rows       │   PostgreSQL     │   live data        │  (Vercel)    │
└─────────────────┘                     └──────────────────┘                    └──────────────┘
```

## Tech Stack (all free tiers)

| Layer            | Choice                                            |
|------------------|---------------------------------------------------|
| Frontend         | Next.js 15 (App Router) + React 19 + TypeScript   |
| Styling          | Tailwind CSS 3.4 (dark, glassmorphism, neon glow) |
| Database         | Supabase PostgreSQL (free tier)                   |
| Automation       | Python + feedparser + requests + supabase-py      |
| LLM parsing      | Groq / Gemini free API (swappable)                |
| Scheduler        | GitHub Actions cron (`.github/workflows`)         |
| Hosting          | Vercel free tier                                  |

## Repository Structure

```
Newsfall/
├── web/                          # Next.js 15 frontend
│   ├── app/
│   │   ├── layout.tsx            # Root layout, fonts, dark canvas
│   │   ├── page.tsx              # Homepage: hero + grid + hot topics
│   │   ├── globals.css           # Tailwind + base theme
│   │   └── topic/[id]/page.tsx   # Dynamic deep-dive (/topic/<slug>)
│   ├── components/
│   │   ├── Hero.tsx              # High-impact summary header
│   │   ├── CategoryGrid.tsx      # Interactive category grid
│   │   ├── TechCard.tsx          # Premium hover card
│   │   └── HotTopicsFeed.tsx     # Latest-iterations feed
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client init
│   │   └── types.ts              # Shared TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── next.config.mjs
│   └── .env.local.example
│
├── automation/                   # Python automation engine
│   ├── scraper.py                # Scrape → LLM parse → upsert
│   ├── requirements.txt
│   └── .env.example
│
├── supabase/
│   └── schema.sql                # Run this in the Supabase SQL editor
│
├── .github/workflows/
│   └── daily-update.yml          # Daily cron that runs scraper.py
│
└── README.md
```

## Quick Start

### 1. Database
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [supabase/schema.sql](supabase/schema.sql), run it.
3. Grab your **Project URL** and **anon** key (Settings → API). For the scraper you also
   need the **service_role** key (keep it secret — server-side only).

### 2. Frontend
```bash
cd web
cp .env.local.example .env.local      # fill in NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
npm install
npm run dev                           # http://localhost:3000
```

### 3. Automation (local test)
```bash
cd automation
python -m venv .venv && . .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                  # fill in SUPABASE_URL / SERVICE key / LLM key
python scraper.py
```

### 4. Schedule it
Push to GitHub, then add these **repository secrets** (Settings → Secrets → Actions):
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `LLM_API_KEY`. The workflow in
[.github/workflows/daily-update.yml](.github/workflows/daily-update.yml) runs `scraper.py`
every day at 06:00 UTC (and on manual dispatch).

## Mobile / Cross-Platform Path
The frontend is a clean Next.js app; to ship mobile later, wrap the deployed site with
[Capacitor](https://capacitorjs.com/) or rebuild the views in Expo/React Native reusing
`lib/types.ts` and the same Supabase client. The data layer stays identical.

## License
MIT — open source, free to fork.
