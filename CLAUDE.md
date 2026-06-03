# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VATh — Verification Analytical Tools Helper** is a fullstack workforce analytics platform built with React 19, Three.js, Express 5, and Supabase Auth. It ingests Excel/CSV access-log/shift data, runs anomaly detection, and generates visualizations and PDF reports. UI is in Bahasa Indonesian.

## Development Commands

```bash
npm run dev          # Start both frontend (Vite :5173) and backend (Express :4174) concurrently
npm run dev:client   # Frontend only (Vite dev server)
npm run dev:server   # Backend only (Express API)
npm run build        # Production build (client only)
npm run start        # Production server (server only)
npm run install:all  # Install deps for root, client, and server
npm run lint         # ESLint (flat config)
```

## Architecture

### Frontend (`client/`)
- **`src/App.jsx`**: Router shell with React Router. Contains wrapper components for each page that manage data fetching.
- **`src/pages/`**: Page components — Dashboard, Input, Output, EmployeeDetail, AiSettings, History, Landing, Login, Register, VerifyEmail, NotFound.
- **`src/components/`**: Shared components — Layout (Navbar + 3D scene + outlet), Navbar, ProtectedRoute, Toast, Scene3D, Astronaut, Loader.
- **`src/context/`**: AuthContext (Supabase auth state), ToastContext (notification state).
- **`src/hooks/`**: useApi (fetch with auth headers), useAuth, useToast.
- **`src/config/`**: api.js (API_BASE), supabase.js (client init), palette.js (colors), providers.js (AI provider config).
- **`src/utils/`**: format.js (formatNumber, truncate).

### Backend (`server/`)
- **`server/index.js`**: Express 5 entry point. Mounts route modules with auth middleware. CORS configured for Vercel domain.
- **`server/routes/`**: Modular route files — health.js (public), datasets.js, aiConfig.js, export.js (all protected).
- **`server/middleware/`**: auth.js (Supabase JWT verification), errorHandler.js.
- **`server/lib/pipeline.js`** (~2340 lines): Core analysis engine — schema inference, shift assembly, anomaly detection, AI integration.
- **`server/lib/pdf-generator.js`**: Puppeteer-based PDF generation for employee reports.
- **`server/lib/supabase-admin.js`**: Supabase admin client for JWT verification.
- **`server/storage/`**: File-based storage (gitignored). ai-config.json, datasets/, tmp/.

### Data Flow
1. User uploads Excel/CSV via Input page → `POST /api/datasets`
2. `pipeline.js` parses, infers schema, detects anomalies, builds shift analytics
3. Results saved as `records.ndjson` + `analysis.json` per dataset
4. Two analyze methods: Local (rule-based) or AI-enhanced (external provider)
5. Frontend fetches and renders across Dashboard/Output/EmployeeDetail pages
6. PDF export via Puppeteer on `GET /api/export/pdf/:datasetId/:employeeKey`

### Auth Flow
1. Supabase Auth handles registration, login, email verification
2. Frontend AuthContext manages session state via `supabase.auth.onAuthStateChange`
3. ProtectedRoute component redirects unauthenticated users to `/login`
4. Backend auth middleware verifies JWT from `Authorization: Bearer <token>` header
5. All `/api/datasets/*` and `/api/ai-config` routes require authentication

## Key Technical Details

- **Vite proxy**: Dev mode proxies `/api` to `127.0.0.1:4174` (see `client/vite.config.js`)
- **ES modules**: `"type": "module"` in all package.json — use ESM imports throughout
- **Tailwind v4**: Uses `@tailwindcss/vite` plugin, not PostCSS config
- **React 19**: Uses latest React with concurrent features
- **Express 5**: Backend uses Express 5 (not 4)
- **No TypeScript**: Source is `.jsx`/`.js`, but `@types/*` packages are installed for IDE autocompletion
- **3D Scene**: React Three Fiber with lazy-loaded Scene3D component. Astronaut model is 2.9MB GLB.
- **PDF**: Puppeteer with `--no-sandbox` (required for Render deployment)

## Environment Variables

### Client (`.env` in `client/`)
- `VITE_API_BASE` — API base URL (default: `/api`)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (safe for client)

### Server (`.env` in `server/`)
- `PORT` — Server port (default: 4174)
- `CORS_ORIGIN` — Allowed CORS origin (Vercel domain in production)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (NEVER expose to client)
- `MIMO_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `GEMINI_API_KEY` — AI provider keys

## Deployment

- **Frontend**: Vercel (SPA with rewrites)
- **Backend**: Render (Express with Puppeteer)
- **Auth**: Supabase (managed service)
