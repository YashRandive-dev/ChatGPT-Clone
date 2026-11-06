# Kairo — full-stack AI chat

Kairo is a ChatGPT-style AI assistant with its own brand. It has streaming answers, saved and searchable chat history, file attachments, user settings, and an admin dashboard.

| Layer    | Stack |
|----------|-------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion, Lucide, React Markdown + highlight.js, SWR |
| Backend  | Node.js, Express 5, TypeScript, Zod, JWT, bcrypt (bcryptjs), Helmet, express-rate-limit, Multer |
| Database | MongoDB + Mongoose |
| AI       | OpenAI Chat Completions (streaming) behind a provider interface |

---

## 1. Architecture

```
 Browser (Next.js)                         Express API                                MongoDB
 ─────────────────                         ───────────                                ───────
 AuthProvider ──cookies──▶ /api/auth/*  ─▶ authController ─▶ tokenService ──────────▶ users, refreshtokens,
 chatStore  ──SSE POST──▶ /api/messages/stream                                        passwordresettokens …
   │                        │ requireAuth → requireVerified → aiLimiter → zod
   │                        ▼
   │                 messageController.prepareSend
   │                   1 validate · 2 auth · 3 ownership · 4 save user msg
   │                        ▼
   │                 chatService.generateReply
   │                   5 buildContext (system prompt + history + files, token budget)
   │                   6 provider.stream()  ──▶  services/ai/registry ─▶ OpenAIProvider ─▶ OpenAI API
   │   ◀── event: delta ── 7 stream tokens (SSE)
   │                   8 save assistant msg (complete | stopped | error)
   │                   9 UsageLog + conversation timestamps / title
   │   ◀── event: done ── 10 final message
 Admin UI ─────────────▶ /api/admin/*  (requireAdmin, RBAC)
```

Key design decisions:

* **Streaming.** The browser POSTs to `/api/messages/stream`, and the server answers with Server-Sent Events: `meta`, `delta`, `title`, `done`, and `error`. When the client aborts the fetch (the **Stop** button), the server aborts the upstream AI call and saves the partial answer with status `stopped`. A provider failure or a dropped connection never loses saved messages. The failed reply is stored with status `error` and can be retried.
* **Pluggable AI providers.** `backend/src/services/ai/types.ts` defines the `AIProvider` interface. To add Anthropic, Gemini, or a local model, implement it and call `registerProvider()`. Each model in the admin catalog names its provider.
* **Model catalog in the backend.** Models are seeded from `AI_MODELS` on first boot. After that, admins manage them in **Admin → Models & settings**. The UI only offers models the backend reports, and disabled ones are shown as unavailable.
* **Auth.** A short-lived JWT access token and a rotating refresh token are both stored in **HTTP-only cookies**. Refresh tokens are stored hashed. Reusing a rotated refresh token revokes that whole session family.

## 2. Folder structure

```
ChatGPTClone/                 (monorepo root – "ai-chatbot")
├── backend/
│   ├── src/
│   │   ├── config/           env.ts (validated env), db.ts
│   │   ├── controllers/      auth, conversation, message, file, settings, admin
│   │   ├── middleware/       auth (RBAC), validate (zod), rateLimit, sanitize, originCheck, upload, errorHandler
│   │   ├── models/           User, Conversation, Message, File, RefreshToken, PasswordResetToken,
│   │   │                     EmailVerificationToken, Feedback, UsageLog, AppSettings
│   │   ├── routes/           REST routers
│   │   ├── services/         ai/ (provider registry + OpenAI), chatService, fileService,
│   │   │                     tokenService, emailService, settingsService
│   │   ├── utils/            ApiError, sse, crypto, logger, strings
│   │   ├── validators/       zod schemas
│   │   ├── scripts/          createAdmin.ts
│   │   ├── app.ts            express app (helmet, cors, cookies, sanitize, routes)
│   │   └── server.ts         bootstrap + graceful shutdown
│   ├── tests/                vitest + supertest + mongodb-memory-server (mocked AI provider)
│   └── .env.example
├── frontend/
│   ├── app/                  /, login, register, forgot-password, reset-password, verify-email,
│   │                         chat, chat/[id], settings, profile, help, share/[id], admin/*
│   ├── components/           chat/, sidebar/, ui/, layout/, admin/
│   ├── hooks/  lib/  services/  types/  styles/  public/
│   ├── tests/                vitest + Testing Library
│   └── .env.example
├── render.yaml               Render blueprint for the API
├── package.json              convenience scripts for both apps
└── README.md
```

## 3. Prerequisites

* **Node.js 20+** (developed on Node 26) and npm 10+
* **MongoDB 6+**, either local or a free MongoDB Atlas cluster
* An **OpenAI API key** from <https://platform.openai.com/api-keys>

## 4. Installation

```bash
cd ChatGPTClone
```

```bash
npm run install:all
```

This runs `npm install` in `backend/` and `frontend/`. With npm 11, approve esbuild's install script if npm asks; the backend dev runner (`tsx`) needs it:

```bash
cd backend && npm approve-scripts esbuild && npm rebuild esbuild && cd ..
```

## 5. Environment setup

```bash
cp backend/.env.example backend/.env
```

```bash
cp frontend/.env.example frontend/.env.local
```

Generate three secrets and paste them into `backend/.env` as `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET`:

```bash
node -e "for (let i=0;i<3;i++) console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then set at least these values:

| Variable (backend) | Purpose |
|---|---|
| `MONGODB_URI` | e.g. `mongodb://127.0.0.1:27017/kairo` or your Atlas URI |
| `OPENAI_API_KEY` | Server-side only. Never exposed to the browser |
| `FRONTEND_URL` | `http://localhost:3000` (comma-separate several origins) |
| `ADMIN_EMAILS` | Optional. Accounts registered with these emails become admins |
| `AI_MODELS` | Model list, e.g. `gpt-4o-mini\|GPT-4o mini\|true` or `llama3.2\|Llama 3.2 (local)\|false`. **When you change it, the database's model list is replaced on the next backend start**; otherwise edits made in Admin → Models & settings are kept |
| `AI_DEFAULT_MODEL` | Default model id |
| `SMTP_*`, `EMAIL_FROM` | Email delivery for the 6-digit verification and password-reset codes. **If `SMTP_HOST` is empty, emails (including the code) are printed to the API console** (handy in development) |
| `REQUIRE_EMAIL_VERIFICATION` | `true` blocks AI chat until the user verifies their email |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Upload storage folder and size limit |
| `OPENAI_BASE_URL` | Optional. An OpenAI-compatible gateway |
| `TRUST_PROXY` | `true` behind Render, Railway, Nginx, etc. (correct client IPs for rate limiting) |

Frontend (`frontend/.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Where the browser reaches the API, e.g. `http://localhost:5000` |
| `BACKEND_URL` | Alternative: leave `NEXT_PUBLIC_API_URL` empty and set this. Next.js then proxies `/api/*` to the backend, so cookies are first-party (recommended in production) |

> **macOS note:** the AirPlay Receiver already listens on port 5000. Either turn it off (System Settings → General → AirDrop & Handoff), or set `PORT=5001` in `backend/.env` and `NEXT_PUBLIC_API_URL=http://localhost:5001` in `frontend/.env.local`.

## 6. Database setup

**Local MongoDB (macOS / Homebrew):**

```bash
brew tap mongodb/brew && brew install mongodb-community
```

```bash
brew services start mongodb-community
```

**MongoDB Atlas:** create a free cluster, add a database user, allow your IP (or `0.0.0.0/0` for PaaS hosts), and copy the `mongodb+srv://…/kairo` URI into `MONGODB_URI`.

No migrations are needed. Collections and indexes are created on first start, and the `AppSettings` document is seeded from your env.

**Create an admin account.** You can register normally with an email listed in `ADMIN_EMAILS`, or run:

```bash
npm run seed:admin -- you@example.com "Your Name" "AStrongPassw0rd"
```

## 7. Run in development

Start both apps with one command:

```bash
npm run dev
```

* Frontend: <http://localhost:3000>
* API: `http://localhost:<PORT from backend/.env>/api/health`

Output is prefixed with `[api]` / `[web]`. **Ctrl+C stops both.** If either app crashes, the other is stopped too, so nothing is left running in the background.

If a port is still busy (for example, a server left running after a terminal was closed), `npm run dev` explains what's wrong instead of crashing. Free the ports with:

```bash
npm run stop
```

This only stops this project's Node dev servers. Then run `npm run dev` again.

To run the apps separately, use `npm run dev:backend` and `npm run dev:frontend` in two terminals. To use other ports, run e.g. `API_PORT=5003 WEB_PORT=3002 npm run dev`.

## 8. Tests

```bash
npm test
```

* **Backend** (57 tests): auth (registration, login, refresh rotation and reuse detection, OTP email verification, OTP password reset with attempt lockout and resend cooldown, two-step sign-in, security alert emails, avatar upload, archive and shared links, personalization in the prompt, profile stats, blocked users, CSRF origin check, NoSQL injection), models, authorization and ownership on every chat resource, streaming with a **mocked AI provider** (deltas, context, stop, failures and retry, edit and regenerate, feedback, usage limits), file uploads (magic-byte validation, ownership), settings, and admin RBAC.
  MongoDB runs in memory through `mongodb-memory-server`. To reuse a local `mongod` instead of downloading one:
  ```bash
  MONGOMS_SYSTEM_BINARY=$(which mongod) npm test --prefix backend
  ```
* **Frontend** (22 tests): OTP input (typing, paste, backspace), composer keyboard behavior, markdown and code rendering, XSS safety, message actions, the SSE parser, and chat-store streaming flows against a mocked service.

## 9. API reference

All routes are under `/api`. JSON errors look like `{ "error": { "code", "message" } }`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` (returns a challenge if two-step is on) · `POST /auth/login/verify` · `POST /auth/login/resend` · `POST /auth/logout` · `POST /auth/refresh` · `POST /auth/forgot-password` (email a reset code) · `POST /auth/verify-reset-code` (code → reset token) · `POST /auth/reset-password` · `POST /auth/verify-email` (6-digit code) · `POST /auth/resend-verification` · `GET /auth/config` · `GET /auth/me` · `GET/DELETE /auth/sessions[/:id]` |
| Conversations | `POST /conversations` · `GET /conversations?search=&cursor=&limit=` · `GET /conversations/:id?before=&limit=` · `PATCH /conversations/:id` · `DELETE /conversations/:id` · `DELETE /conversations` · `POST/DELETE /conversations/:id/share` · `POST /conversations/archive-all` · `GET /conversations?archived=true` · `GET/DELETE /conversations/shared` |
| Messages | `POST /messages` (JSON) · `POST /messages/stream` (SSE) · `PATCH /messages/:id` (edit) · `DELETE /messages/:id` · `POST /messages/:id/regenerate` (SSE) · `POST /messages/:id/feedback` |
| Files | `POST /files/upload` (multipart `file`) · `GET /files/:id` · `DELETE /files/:id` |
| Settings | `GET /settings` · `PATCH /settings` · `GET /models` · `PATCH /users/me` · `PATCH /users/me/password` · `DELETE /users/me` · `GET /users/me/export` · `GET /users/me/stats` · `POST/DELETE /users/me/avatar` · `GET /users/:id/avatar` · `POST /users/me/two-factor` |
| Admin | `GET /admin/dashboard` · `GET /admin/users` · `PATCH /admin/users/:id` · `DELETE /admin/users/:id` · `GET /admin/conversations[/:id]` · `GET/PATCH /admin/settings` · `GET /admin/usage` · `GET /admin/feedback` |
| Public | `GET /share/:shareId` · `GET /health` |

## 10. Security

* bcrypt password hashing (cost 12) and timing-safe login for unknown emails
* **OTP email verification and password recovery:** 6-digit codes from a CSPRNG, stored only as a keyed HMAC bound to the user and purpose. Codes expire after 10 minutes, allow 5 attempts, and have a 60 s resend cooldown. A correct reset code is exchanged for a single-use 15-minute reset token, which is kept in `sessionStorage` rather than the URL. Reset responses never reveal whether an email is registered
* Access JWT (15 min) plus a rotating refresh token (30 days). Both are HTTP-only cookies, the refresh cookie is signed and scoped to `/api/auth`, and reuse detection revokes the session family
* `SameSite=None; Secure` cookies in production, `Lax` in development, and an **Origin check** on every state-changing request (CSRF)
* Helmet security headers, a strict CORS allow-list, and rate limits (global, auth, per-user AI, uploads), with daily message and token budgets configured by admins
* Zod validation on every route, removal of `$`/`.` keys (NoSQL injection), and a 1 MB JSON body limit
* Every chat resource is queried with `{ _id, userId }`. Other users' resources return **404** so their existence isn't revealed
* Uploads: an extension and MIME allow-list, a **magic-byte content check**, random storage names, a path-traversal guard, owner-only downloads with `nosniff` and a sandbox CSP, and a size cap
* Markdown is rendered **without raw HTML**, so AI output can't inject scripts. Remote images in AI output are shown as links
* Admins see conversation content **only** if the privacy toggle is on, and every view is audit-logged
* Secrets live only in env files. `.gitignore` excludes `.env*` and `uploads/`

## 11. Deployment

### Database: MongoDB Atlas
Create a cluster and a database user. Under Network Access, allow your backend host. Copy the SRV URI.

### Backend: Render (or Railway, Fly.io, any Node host)
* **Blueprint:** push the repo, then New → Blueprint, and pick `render.yaml`. Fill in `MONGODB_URI`, `OPENAI_API_KEY`, `FRONTEND_URL` (your Vercel URL), and `ADMIN_EMAILS`. The secrets are generated for you.
* **Manual:** root `backend`, build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`, and set `NODE_ENV=production` and `TRUST_PROXY=true`.
* Uploaded files are written to `UPLOAD_DIR`. Most PaaS filesystems are temporary, so mount a persistent disk there (the blueprint mounts `/var/data`).

### Frontend: Vercel
Import the repo and set **Root Directory** to `frontend`. Then pick one of these:

1. **Recommended:** set `BACKEND_URL=https://your-api.onrender.com` and leave `NEXT_PUBLIC_API_URL` empty. The browser calls `/api/*` on the Vercel domain and Next.js proxies it, so auth cookies are first-party and work in Safari and other browsers that block third-party cookies.
2. **Direct:** set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`. Use a custom domain on the same site as the frontend (e.g. `app.example.com` and `api.example.com`) so cookies aren't third-party.

Set the backend `FRONTEND_URL` to the exact frontend origin, for example `https://kairo.vercel.app`.

### Production checklist
- [ ] Strong, unique `JWT_*` and `COOKIE_SECRET` values (the server refuses to start in production without them)
- [ ] `NODE_ENV=production` and HTTPS everywhere
- [ ] SMTP configured so verification and reset emails are delivered
- [ ] The model ids in the admin catalog exist on your OpenAI account
- [ ] A persistent disk for `UPLOAD_DIR`

## 12. Profile & settings at a glance

| Where | What you can do |
|---|---|
| **Profile** | Upload or remove a profile photo (PNG/JPG/WEBP/GIF, 2 MB). See activity stats (chats, messages, tokens, active days, files, shared links, ratings) and a 30-day chart. Edit your display name. You can fix a typo in your email until it is verified; after that **the email is locked and can't be changed**. Security summary |
| **Settings → General** | Theme, language, timestamps, Enter-to-send |
| **Settings → Appearance** | Font size, chat width, wrap long code lines, reduce motion |
| **Settings → Personalization** | What Kairo should call you, your occupation, "about you", and how Kairo should respond. All of it goes into the AI's system prompt |
| **Settings → Chat & AI** | Default model, AI titles, auto-scroll, token usage, suggested prompts, creativity (temperature), daily usage |
| **Settings → Notifications** | Email alerts for sign-ins from a new device and for password changes |
| **Settings → Security** | Two-step verification (a 6-digit email code at every sign-in, password required to change it), change password, active sessions |
| **Settings → Data controls** | Export, archived chats (restore or delete), archive all, shared links (open or revoke), delete all chats, delete account |

## 13. Extending

* **New AI provider:** implement `AIProvider` (`stream`, `complete`, `isConfigured`) in `backend/src/services/ai/`, register it in `registry.ts`, then add models with that `provider` in the admin settings.
* **New UI language:** add a dictionary in `frontend/lib/i18n.tsx` and the code to `SUPPORTED_LANGUAGES` in `backend/src/models/User.ts`.
