# Seed data

Two ways to load demo data:

1. **Recommended:** `cd backend && npm run db:reset`. The TypeScript seeder generates data relative to today's date (so "upcoming" and "last 30 days" always look alive) and also fills MongoDB.
2. **Plain SQL:** `smart_campus_seed_data.sql` (generated with `npm run db:export-schema -- --data`). Load after `database/schema/smart_campus_schema.sql`. Dates are fixed to the day it was exported, and MongoDB is not filled.

## Contents (about 10,800 rows)

| Table | Rows | Notes |
|---|---|---|
| users | 131 | 3 admins, 18 faculty, 110 students; bcrypt hashes of the demo passwords |
| resources | 36 | labs, classrooms, halls and equipment kits across 6 buildings |
| equipment | 52 | projectors, instruments, kits with asset tags |
| academic_schedules | 40 | weekly timetable that blocks ad-hoc bookings |
| bookings | 1,700 | mixed statuses over about 5 months, none overlapping |
| booking_status_history, booking_approvals, booking_equipment | one row per event, decision or add-on | consistent with each booking's status |
| notifications | about 3,100 | generated for bookings and maintenance |
| maintenance_requests | 14 | open, in progress, resolved, reported |

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Admin | neha.kapoor@smartcampus.edu | Admin@12345 |
| Faculty | meera.nair@smartcampus.edu | Faculty@12345 |
| Student | aarav.sharma@smartcampus.edu | Student@12345 |

Every seeded admin, faculty and student uses the password for their role. These are demo values only.
