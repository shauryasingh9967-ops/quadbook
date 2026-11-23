# QuadBook — Campus Resource Booking System

Capstone project: a full-stack platform where students and faculty book labs, classrooms, halls and equipment, and administrators approve requests, schedule maintenance and read live analytics.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Lucide, Recharts, React Router, Axios, React Hook Form + Zod |
| Backend | Node.js, Express 5, TypeScript, JWT, bcrypt, Zod, express-rate-limit |
| Primary database | **MySQL 8** (19 tables, 5 views, 10 routines, 6 triggers) |
| Secondary database | **MongoDB** (user activity log, booking audit trail, notification history) |

## What it does

* **Public:** landing page with live "today on campus" availability ribbons, features, how it works, resource preview, login, register, forgot/reset password.
* **Student and faculty:** dashboard, browse and filter resources, resource details with day availability, weekly booking calendar, booking form with equipment add-ons, my bookings, history, booking details with status timeline, cancellation, notifications, issue reporting, profile and password change.
* **Admin:** analytics overview (charts from real SQL), approvals queue, users, resources, labs, classrooms, equipment, maintenance, reports with CSV export, audit logs (MongoDB), system settings and health.
* **Double booking is impossible.** The resource row is locked inside a transaction and a `BEFORE INSERT` trigger re-checks overlaps, maintenance windows and the class timetable, so even a raw SQL insert is rejected. An 8-way parallel race test proves exactly one request wins.

## Quick start (Windows, VS Code)

Full steps are in [documentation/SETUP_GUIDE.md](documentation/SETUP_GUIDE.md). The short version, after installing Node 20+, MySQL 8 and MongoDB:

```powershell
cd backend
copy .env.example .env        # then edit DB_PASSWORD and JWT_SECRET
npm install
npm run db:reset              # creates the schema and seeds 10,000+ rows
npm run dev                   # API on http://localhost:4000

# second terminal
cd frontend
npm install
npm run dev                   # app on http://localhost:5173
```

### Demo accounts (created by the seeder)

| Role | Email | Password |
|---|---|---|
| Admin | neha.kapoor@smartcampus.edu | Admin@12345 |
| Faculty | meera.nair@smartcampus.edu | Faculty@12345 |
| Student | aarav.sharma@smartcampus.edu | Student@12345 |

All seeded users share their role's password. Change them before any real deployment.

## Folder structure

```
quadbook/
  frontend/          React app (src/pages, src/components, src/lib)
  backend/           Express API (src/controllers, services, middleware, validators, db, models, jobs) + tests/
  database/
    migrations/      Canonical SQL: tables, indexes, functions, procedures, triggers, views, reference data
    schema/          Generated full schema export
    seeds/           Generated seed data export + README
    queries/         Runnable SQL demos (DDL/DML/DCL/TCL, joins, CTEs, windows, triggers, transactions)
    diagrams/        ER diagram (.mmd source, .svg, .png)
  documentation/     ER_DIAGRAM, DATABASE_DESIGN, NORMALIZATION, API_DOCUMENTATION, SETUP_GUIDE, VIVA_PREPARATION
```

## Useful commands

| Where | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | API with auto-reload |
| backend | `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations, load data, or rebuild everything |
| backend | `npm test` | 30 integration tests against a separate `smart_campus_test` database |
| backend | `npm run build && npm start` | Production build |
| backend | `npm run db:export-schema -- --data` | Regenerate `database/schema` and `database/seeds` |
| frontend | `npm run build` | Type-check and production build |

## Honest limitations

* No email server: the forgot-password flow returns the reset token in the API response **only in development mode**. In production you must plug in an email sender.
* Tested on Linux with MySQL 8.0 and MongoDB 8.0. The Windows commands above are standard but were not run on Windows.
* Booking times are campus-local wall-clock times. Keep MySQL, the API and the browsers in the same time zone.
* Public self-registration creates students and faculty only; admins are created by admins.
