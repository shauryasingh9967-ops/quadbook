# Database Design

## 1. Why two databases

| Concern | MySQL (primary) | MongoDB (secondary) |
|---|---|---|
| Data | users, resources, bookings, approvals, maintenance, notifications | activity log, booking audit trail, notification history |
| Needs | foreign keys, transactions, CHECK, triggers | append-only, flexible JSON metadata, fast time-ordered reads |
| If it is down | the app cannot work | the app keeps working; audit pages return 503 and logs queue in memory (bounded, 1000 entries) and flush on reconnect |

Notifications are written to MySQL by triggers (transactional). An outbox flag (`notifications.mongo_synced`) lets a background job copy them to MongoDB, so an offline MongoDB never loses history.

## 2. Tables (19)

roles, departments, buildings, rooms, resource_categories, users, resources, equipment, academic_schedules, bookings, booking_equipment, booking_approvals, booking_status_history, maintenance_requests, notifications, system_settings, password_reset_tokens, revoked_tokens. (The ER diagram shows 18 boxes; the count of 19 includes the migration bookkeeping table `schema_migrations`.)

## 3. Constraint summary

* **Primary keys** on every table (composite on `booking_equipment`).
* **Foreign keys** with explicit actions: RESTRICT for history that must survive (bookings to users/resources), CASCADE for owned rows (equipment, status history), SET NULL for optional links (department, notification back-links).
* **UNIQUE:** users.email, users.member_id, resources.code, equipment.asset_tag, bookings.booking_code, booking_approvals.booking_id, departments.code/name, buildings.code, password_reset_tokens.token_hash.
* **NOT NULL** on all mandatory columns; ENUMs restrict statuses.
* **CHECK:** `end_time > start_time`, same-day bookings, capacity >= 1, attendees >= 1, quantity >= 1, day_of_week 0..6, maintenance end after start, valid email pattern, schedule dates.

## 4. Indexes

| Index | Why |
|---|---|
| `idx_bookings_resource_time (resource_id, start_time, end_time)` | the overlap check used by the trigger and the calendar |
| `idx_bookings_user_status (user_id, status, start_time)` | "my bookings" |
| `idx_bookings_status_start (status, start_time)` | approval queue, housekeeping |
| `idx_notifications_user_read (user_id, is_read, created_at)` | unread badge and list |
| `idx_notifications_outbox (mongo_synced, id)` | outbox sync job |
| `idx_resources_category_status`, `idx_maintenance_resource_status`, `idx_users_role_status` | filters |
| `ftx_resources_search` (FULLTEXT) | resource search |

## 5. Programmable objects

**Functions:** `fn_setting_int`, `fn_booking_hours`, `fn_slot_conflict` (returns OK, BOOKING_CONFLICT, MAINTENANCE, CLASS_SCHEDULE, RETIRED or NOT_FOUND).

**Procedures:** `sp_validate_booking_rules`, `sp_create_booking`, `sp_decide_booking`, `sp_cancel_booking`, `sp_update_booking`, `sp_resource_utilization` (recursive CTE), `sp_housekeeping` (completes past bookings, expires stale pending ones).

**Triggers:** `trg_bookings_bi` (double-booking guard), `trg_bookings_bu` (state machine and re-check on change), `trg_bookings_ai` (history and notifications), `trg_bookings_au`, `trg_maintenance_ai`, `trg_maintenance_au` (sync resource status, notify).

**Views:** `v_booking_details`, `v_resource_catalog`, `v_monthly_booking_trends`, `v_popular_resources` (window function RANK), `v_user_booking_stats`.

**Roles (DCL):** the demo in `database/queries/01_ddl_dml_dcl_tcl.sql` creates a read-only reporting user with SELECT on the views only.

## 6. How double booking is prevented

1. `sp_create_booking` starts a transaction and runs `SELECT ... FOR UPDATE` on the resource row. Concurrent bookings for the same resource queue up behind this lock.
2. It validates business rules, then inserts the booking.
3. `trg_bookings_bi` locks the same row again (re-entrant) and calls `fn_slot_conflict`, which uses the half-open interval test `existing.start < new.end AND existing.end > new.start` against active bookings, open maintenance and the class timetable.
4. The second transaction, once the first commits, sees the committed row (sessions use READ COMMITTED) and fails with `BOOKING_CONFLICT`, which the API maps to HTTP 409.
5. Because the guard is a trigger, it also stops raw SQL inserts that bypass the API. Deadlocks are retried up to 3 times by the API.

Back-to-back bookings (10:00-11:00 then 11:00-12:00) are allowed because the interval is half-open.

## 7. Transaction scenarios

1. **Create booking** (atomic with equipment add-ons; failure rolls everything back).
2. **Approve or reject** (status change, approval record, history and notification as one unit).
3. **Concurrent booking race** (resource-row lock serialises competing sessions).
4. Cancel and maintenance auto-cancel also run inside transactions.

Runnable versions: `database/queries/05_transaction_scenarios.sql`.
