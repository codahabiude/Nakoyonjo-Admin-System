# Nakoyonjo Admin System

A school administration system for **Nakoyonjo DEB Primary School** (Bungoma, Kenya). It manages students, teachers, classes, exams and marks, attendance, report cards and parent communication. It runs as a web app, installs as a PWA, and can be packaged as an Android app with Capacitor.

> All sample data in this project (students, teachers, phone numbers) is made up for demonstration.

## Features

- **Roles**
  - **Admin**: full control of students, teachers, classes, exams, grading and settings.
  - **Class teacher**: takes daily attendance and writes class remarks, and sees marks progress for the whole class.
  - **Subject teacher**: enters marks for their own subjects and views their classes.
  - **Parent**: portal showing their children's results, attendance and report cards.
- **Academics**: classes, subjects, teacher-to-subject and teacher-to-class assignment, exams, marks entry, class ranking.
- **Grading**: configurable grading schemes and grade rules.
- **Attendance**: daily register with attendance reports.
- **Reports**: report cards and performance reports as PDF (PDFKit) and Excel (ExcelJS), singly or in bulk.
- **Notifications**: SMS to parents through [Africa's Talking](https://africastalking.com), with a delivery log.
- **Settings**: school name, motto, address, head teacher, term dates and SMS credentials. Changes update the sidebar, login page, browser tab and PWA manifest right away.
- **Dark mode** and a **mobile-friendly PWA** with an offline page.

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix UI), Recharts |
| State / data fetching | Zustand, TanStack Query |
| Auth | NextAuth (credentials) with token-based API auth, bcrypt password hashing |
| Database | Prisma ORM. SQLite by default; PostgreSQL and MySQL schemas included |
| Mobile | PWA, plus Capacitor for Android |
| Reverse proxy (optional) | Caddy |

## Getting started

### Prerequisites

- Node.js 20 or newer, and npm (or [Bun](https://bun.sh))

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    then set NEXTAUTH_SECRET (generate one with: openssl rand -base64 32)

# 3. Create the database tables
npm run db:push

# 4. Load the sample data (admin, teachers, classes, students, marks)
npx tsx scripts/seed.ts

# 5. Start the dev server
npm run dev
```

Open <http://localhost:3000>.

### Sign in

The seed script creates these accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@nakoyonjo.ac.ke` | value of `ADMIN_SEED_PASSWORD`, default `ChangeMeImmediately!1` |
| Teachers | e.g. `james.mwangi@nakoyonjo.ac.ke` | value of `TEACHER_SEED_PASSWORD`, default `ChangeMeImmediately!2` |

**Change these passwords after your first login.**

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Database connection string. Defaults to SQLite (`file:./dev.db`). |
| `NEXTAUTH_SECRET` | Yes | Secret for signing sessions and API tokens. |
| `NEXTAUTH_URL` | In production | Public URL of the app. |
| `ADMIN_SEED_PASSWORD` | No | Admin password used by the seed. |
| `TEACHER_SEED_PASSWORD` | No | Teacher password used by the seed. |

SMS credentials (username, API key, sender ID) are not environment variables. An admin enters them in **Settings** inside the app.

## Switching database

SQLite is used by default. To use PostgreSQL (local Docker, or a hosted provider such as Supabase):

1. Copy `prisma/schema.postgresql.prisma` over `prisma/schema.prisma` (back up the original first). A MySQL version is at `prisma/schema.mysql.prisma`.
2. For local PostgreSQL, run `docker compose up -d`. This starts PostgreSQL 16 and pgAdmin.
   Then set `DATABASE_URL="postgresql://schooladmin:schoolpass@localhost:5432/school_admin"` in `.env`.
   The credentials in `docker-compose.yml` are for local development only.
3. Run `npm run db:push` and `npm run db:generate`.
4. Seed again with `npx tsx scripts/seed.ts`.

Before moving real data over, check that the models in the schema file you copy match your data. `scripts/export-sqlite.ts` and `scripts/import-to-postgres.ts` are provided to move data from SQLite to PostgreSQL.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Production build (standalone output) |
| `npm start` | Run the production build (uses Bun) |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Sync the Prisma schema to the database |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` / `db:reset` | Prisma migrate dev / reset |

The `scripts/` folder also holds the seed script, a password reset helper (`reset-passwords.js`) and API/auth test scripts. The test scripts expect a running dev server with seeded data.

## Android app

The app can be wrapped with [Capacitor](https://capacitorjs.com) (app id `ke.co.ndeb.schooladmin`):

```bash
npm run cap:add:android     # first time only
npm run cap:build:android   # build, sync and open Android Studio
```

See `capacitor.config.ts` for the splash screen, status bar and server options.

## Project structure

```
prisma/          Database schemas (SQLite, PostgreSQL, MySQL)
public/          Icons, service worker, static assets
scripts/         Seed, maintenance and test scripts
src/
  app/           Next.js routes, including the REST API under app/api
  components/
    app/         Screens (dashboard, students, exams, marks, attendance, reports, parent portal, settings)
    ui/          shadcn/ui components
  lib/           Auth, roles, grading, report builders, SMS, settings
  stores/        Zustand stores (app, auth, branding)
Caddyfile        Optional reverse proxy config
docker-compose.yml  Local PostgreSQL + pgAdmin
capacitor.config.ts Android app config
```

## Security notes

- Never commit `.env` files, database files or exports. They are already in `.gitignore`.
- Set a strong `NEXTAUTH_SECRET` before deploying. Without it the app falls back to an insecure development secret.
- Change the seeded passwords, and the Docker database credentials if you expose them beyond your machine.
