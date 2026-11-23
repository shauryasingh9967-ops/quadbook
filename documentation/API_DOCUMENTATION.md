# API Documentation

Base URL: `http://localhost:4000/api`. JSON in and out. Authenticated routes need `Authorization: Bearer <token>` (token from login).

## Response envelope

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 10, "total": 120, "totalPages": 12 } }
```

Errors: `{ "success": false, "error": { "code": "BOOKING_CONFLICT", "message": "...", "details": [ ... ] } }`. Internals and stack traces are never returned.

| HTTP | Typical code |
|---|---|
| 400 | VALIDATION_ERROR (body or query failed Zod validation, `details` lists fields), BAD_JSON |
| 401 | UNAUTHORIZED (missing, invalid, expired or revoked token; suspended account), INVALID_CREDENTIALS |
| 403 | FORBIDDEN (role not allowed, or not your booking) |
| 404 | NOT_FOUND, ROUTE_NOT_FOUND |
| 409 | BOOKING_CONFLICT, MAINTENANCE, CLASS_SCHEDULE, DUPLICATE (unique key), IN_USE (foreign key), INVALID_STATE, EQUIPMENT_UNAVAILABLE, TOO_LATE, BOOKING_EXPIRED |
| 422 | RULE_VIOLATION and other business-rule codes raised by the stored procedures (for example duration limit, capacity, outside opening hours, booking window), INVALID_REFERENCE, CHECK_FAILED |
| 429 | RATE_LIMITED (auth routes 30 per 15 min per IP; all routes 600 per minute) |
| 503 | MONGO_UNAVAILABLE (audit endpoints only) |

Admin routes live under `/admin` (for example `/admin/users`). Roles: **P** public, **U** any signed-in user, **A** admin only. List endpoints accept `page` and `limit` (max 100).

## Public

| Method | Path | Role | Description |
|---|---|---|---|
| GET | /public/overview | P | counts, featured resources, public settings |
| GET | /public/availability | P | today's anonymous occupancy ribbons |
| GET | /public/departments | P | department list for registration |
| GET | /public/settings | P | opening hours, booking limits |

## Authentication (rate limited: 30 per 15 min per IP)

| Method | Path | Role | Body |
|---|---|---|---|
| POST | /auth/register | P | fullName, email, password, role (student or faculty), memberId, departmentId, phone? |
| POST | /auth/login | P | email, password. Returns `{ user, token }` |
| POST | /auth/forgot-password | P | email. Always answers success; `devResetToken` only when NODE_ENV=development |
| POST | /auth/reset-password | P | token, password |
| POST | /auth/logout | U | revokes the token's `jti` |
| GET | /auth/me | U | current user |
| PATCH | /auth/profile | U | fullName?, phone?, departmentId? |
| POST | /auth/change-password | U | currentPassword, newPassword |

Password rule: 8 to 72 characters with an uppercase letter, a lowercase letter and a digit.

## Resources and equipment

| Method | Path | Role | Description |
|---|---|---|---|
| GET | /resources | U | filters: q, kind, categoryId, buildingId, departmentId, status, minCapacity, sort |
| GET | /resources/lookups | U | categories, buildings, rooms, departments |
| GET | /resources/:id | U | details with equipment, timetable, maintenance, upcoming bookings |
| GET | /resources/:id/schedule?from&to | U | bookings, classes and maintenance as events (other users' bookings are anonymised) |
| POST / PUT / DELETE | /resources(/:id) | A | create, update, remove (retired instead of deleted if it has bookings) |
| GET / POST / PUT / DELETE | /equipment(/:id) | A | equipment catalogue |

## Bookings

| Method | Path | Role | Description |
|---|---|---|---|
| POST | /bookings | U | `{ resourceId, startTime, endTime, purpose, attendees, equipment?: [{equipmentId, quantity}] }`. Times like `2026-12-03T10:00`. Returns the booking with status `approved` (auto-approval resources) or `pending` |
| GET | /bookings | U | own bookings (admins see all). Filters: scope=upcoming or history, status (comma list), q, kind, resourceId, userId, from, to, sort |
| GET | /bookings/stats | A | counts per status |
| GET | /bookings/:id | U | detail with equipment, status history, `canCancel`, `canDecide` (owner or admin only) |
| PUT | /bookings/:id | U | change time, purpose, attendees of an active booking |
| POST | /bookings/:id/cancel | U | `{ reason? }` owner or admin |
| POST | /bookings/:id/decision | A | `{ decision: "approved" or "rejected", remarks? }` (remarks required for reject) |

## Maintenance

| Method | Path | Role | Description |
|---|---|---|---|
| GET | /maintenance | A | filters: status, priority, resourceId, q |
| GET | /maintenance/mine | U | issues you reported |
| GET | /maintenance/staff | A | admins that can be assigned |
| POST | /maintenance | A | schedule a job. An open or in-progress job cancels overlapping bookings and notifies their owners |
| POST | /maintenance/report | U | report an issue (status `reported`, does not block bookings) |
| PATCH / DELETE | /maintenance/:id | A | update (resolving frees the resource) or delete |

## Notifications and personal

| Method | Path | Description |
|---|---|---|
| GET | /notifications | own list, `unread=true` filter, meta.unread count |
| GET | /notifications/unread-count | badge number |
| PATCH | /notifications/:id/read | mark one read |
| POST | /notifications/read-all | mark all read |
| DELETE | /notifications/:id | delete one |
| GET | /notifications/history | MongoDB archive of your notifications |
| GET | /me/overview | dashboard counts, upcoming and recent bookings |
| GET | /me/activity | your recent activity (MongoDB) |

## Admin (`/admin/*`, role A)

| Method | Path | Description |
|---|---|---|
| GET / POST | /admin/users | list (q, role, status, departmentId) or create |
| PATCH / DELETE | /admin/users/:id | update or suspend, delete (suspended instead if history exists) |
| POST | /admin/users/:id/reset-password | `{ password }` |
| GET | /admin/analytics/overview, /trends, /popular, /utilization | dashboard data (SQL view and stored-procedure backed) |
| GET | /admin/reports/bundle?from&to | charts and tables for the Reports page |
| GET | /admin/reports/bookings.csv?from&to&status | CSV export (spreadsheet formulas are neutralised) |
| GET | /admin/audit/activity, /audit/bookings, /audit/summary | MongoDB logs |
| GET / PUT | /admin/settings | read or update booking rules (validated) |
| GET | /admin/health | MySQL and MongoDB connection state |

## Example

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"aarav.sharma@smartcampus.edu","password":"Student@12345"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")

curl -X POST http://localhost:4000/api/bookings -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"resourceId":1,"startTime":"2026-12-03T10:00","endTime":"2026-12-03T11:00","purpose":"Project review","attendees":4}'
```
