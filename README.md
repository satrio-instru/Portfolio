# VATh — Verification Analytical Tools Helper

Platform analitik workforce modern untuk audit shift, access-log, dan deteksi anomali berbasis AI.

## Features

- **Deteksi Anomali** — Analisis otomatis keterlambatan, pulang cepat, lembur, dan pola mencurigakan
- **Visualisasi Interaktif** — Dashboard dengan chart, heatmap, dan KPI real-time
- **AI Integration** — Mendukung MiMo, OpenAI, Claude, Gemini, dan analisis lokal
- **Export PDF** — Generate laporan formal per karyawan dalam format PDF profesional
- **Autentikasi** — Supabase Auth dengan email/password dan verifikasi email
- **3D Scene** — Visualisasi 3D interaktif menggunakan React Three Fiber

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4, Three.js, Recharts |
| Backend | Express 5, Puppeteer, XLSX (SheetJS) |
| Auth | Supabase Auth |
| Deploy | Vercel (frontend), Render (backend) |

## Project Structure

```
├── client/                    # Frontend (React SPA)
│   ├── src/
│   │   ├── pages/             # Page components
│   │   ├── components/        # Shared components
│   │   ├── context/           # Auth & Toast providers
│   │   ├── hooks/             # Custom hooks
│   │   ├── config/            # API, Supabase, palette config
│   │   └── utils/             # Utility functions
│   └── public/                # Static assets (3D models, images)
├── server/                    # Backend (Express API)
│   ├── routes/                # Modular route handlers
│   ├── middleware/             # Auth & error middleware
│   ├── lib/                   # Pipeline, PDF generator, Supabase admin
│   └── storage/               # File-based storage (gitignored)
├── vercel.json                # Vercel deployment config
└── render.yaml                # Render deployment config
```

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase project (for auth)

### Installation

```bash
# Install all dependencies
npm run install:all

# Create .env files
cp .env.example .env
cp client/.env.example client/.env
cp server/.env.example server/.env
```

### Environment Variables

**Client (`client/.env`):**
```
VITE_API_BASE=/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Server (`server/.env`):**
```
PORT=4174
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
MIMO_API_KEY=           # Optional
OPENAI_API_KEY=         # Optional
CLAUDE_API_KEY=         # Optional
GEMINI_API_KEY=         # Optional
```

### Development

```bash
npm run dev          # Start both frontend and backend
npm run dev:client   # Frontend only (http://localhost:5173)
npm run dev:server   # Backend only (http://localhost:4174)
```

### Production Build

```bash
npm run build        # Build frontend
npm run start        # Start production server
```

## Deployment

### Vercel (Frontend)
1. Connect your GitHub repo to Vercel
2. Set root directory to `client`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables: `VITE_API_BASE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Render (Backend)
1. Connect your GitHub repo to Render
2. Set root directory to `server`
3. Build command: `npm install`
4. Start command: `node index.js`
5. Add environment variables: `CORS_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, AI provider keys

### Supabase (Auth)
1. Create a project at [supabase.com](https://supabase.com)
2. Enable Email auth under Authentication > Providers
3. Set Site URL to your Vercel domain
4. Add redirect URL: `https://your-app.vercel.app/verify-email`
5. Copy URL and anon key to client `.env`
6. Copy service role key to server `.env`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Service health check |
| GET | /api/datasets | Yes | List all datasets |
| POST | /api/datasets | Yes | Upload file |
| GET | /api/datasets/:id | Yes | Get dataset analysis |
| POST | /api/datasets/:id/analyze-local | Yes | Local analysis |
| POST | /api/datasets/:id/analyze | Yes | AI-enhanced analysis |
| GET | /api/datasets/:id/records | Yes | Paginated records |
| GET | /api/datasets/:id/employees | Yes | Employee list |
| GET | /api/datasets/:id/employees/:key | Yes | Single employee |
| GET | /api/datasets/:id/anomalies.csv | Yes | Anomalies CSV |
| GET | /api/datasets/:id/chart-data.csv | Yes | Chart data CSV |
| GET | /api/ai-config | Yes | Get AI config |
| PUT | /api/ai-config | Yes | Save AI config |
| GET | /api/export/pdf/:datasetId/:key | Yes | PDF report |
