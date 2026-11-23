# Viva Preparation (45 questions with answers)

## A. Project overview

**1. What problem does the project solve?** Campus labs and classrooms are booked through paper or chat, which causes double bookings, no approval trail and no usage data. The system gives one place to browse, book, approve, maintain and analyse resources.

**2. Who are the users?** Students and faculty (request bookings), administrators (approve, manage resources, users, maintenance, read reports).

**3. Why two databases?** MySQL holds the transactional core where integrity matters. MongoDB holds append-only logs (activity, booking audit, notification history) that are flexible, time-ordered and must never slow or break a booking.

**4. What happens if MongoDB is down?** Bookings keep working. Log writes go to a bounded in-memory queue (1,000 entries) and flush on reconnect; audit pages show a clear "offline" state (HTTP 503). The API retries the connection every 10 seconds.

**5. Describe the architecture.** React SPA, REST API (routes, validators, controllers, services), MySQL stored procedures/triggers for rules and concurrency, MongoDB for logs, JWT for stateless auth.

## B. Database design

**6. How many tables and which are the core ones?** 19 including a migration bookkeeping table. Core: users, resources, bookings, booking_approvals, maintenance_requests, notifications.

**7. Explain normalization in this project.** See NORMALIZATION.md. Repeating equipment lists became `booking_equipment` (1NF), junction attributes depend on the whole key (2NF), and role, department, building and category facts moved to their own tables (3NF).

**8. Where did you deliberately denormalize?** Status text in history rows, notification text, and cancel info on bookings, because they are historical records or single optional facts.

**9. Which constraints did you use?** PK, FK with RESTRICT/CASCADE/SET NULL, UNIQUE, NOT NULL, ENUM, and CHECK (end after start, capacity, quantity, weekday range, email pattern).

**10. Why a junction table for equipment?** A booking can request many items and an item appears in many bookings: a many-to-many relation needs `booking_equipment(booking_id, equipment_id, quantity)`.

**11. Which indexes did you add and why?** Composite `(resource_id, start_time, end_time)` for overlap checks, `(user_id, status, start_time)` for my bookings, `(status, start_time)` for the approval queue, notification unread index, and a FULLTEXT index for search. `EXPLAIN` output is in the demo file 04.

**12. Why not store utilization percentage in a column?** It is derived data; storing it creates update anomalies. A procedure and views compute it on demand.

**13. What is the difference between a view and a table?** A view is a stored query with no data of its own; it simplifies reads (e.g. `v_booking_details` joins 8 tables) and can restrict what a reporting user sees.

## C. Double booking and concurrency

**14. How do you prevent double booking?** Resource-row lock (`SELECT ... FOR UPDATE`) inside a transaction plus a BEFORE INSERT trigger that calls `fn_slot_conflict`. The trigger makes the rule impossible to bypass.

**15. What overlap condition do you use?** `existing.start < new.end AND existing.end > new.start`. It is half-open, so 10-11 and 11-12 do not conflict.

**16. Why lock the resource row rather than the bookings?** There is nothing to lock for a slot that does not exist yet (phantom). Locking the parent row serialises all writers for that resource without table locks.

**17. Why READ COMMITTED?** Under REPEATABLE READ the second transaction could keep an old snapshot and miss the first one's committed row. With READ COMMITTED each statement sees the latest commit.

**18. How did you prove it works?** An integration test fires 8 parallel booking requests for the same slot and asserts exactly one succeeds and seven get 409. Another test shows a raw SQL insert is rejected by the trigger.

**19. What about deadlocks?** Rare because there is one lock order (resource row first). The API retries a deadlock up to 3 times.

**20. Can maintenance and classes conflict with bookings?** The same function checks active maintenance windows and the weekly class timetable, returning MAINTENANCE or CLASS_SCHEDULE.

**21. What happens to existing bookings when maintenance is scheduled?** Overlapping pending/approved bookings are cancelled in the same transaction and their owners notified.

## D. SQL features

**22. Where are triggers used?** Six: double-booking guard, state machine, history and notifications on booking changes, and resource status sync plus notifications on maintenance.

**23. Why create notifications in triggers?** They then happen for every route into the database and are in the same transaction as the change, so a notification can never exist without its booking change.

**24. Name your stored procedures.** `sp_create_booking`, `sp_decide_booking`, `sp_cancel_booking`, `sp_update_booking`, `sp_validate_booking_rules`, `sp_resource_utilization`, `sp_housekeeping`.

**25. Your functions?** `fn_setting_int`, `fn_booking_hours`, `fn_slot_conflict`.

**26. Where do you use a window function?** `v_popular_resources` uses RANK(); demo 03 also uses DENSE_RANK, LAG, ROW_NUMBER, NTILE and running totals.

**27. Where is a recursive CTE used?** `sp_resource_utilization` generates one row per day and demo 03 builds a 14-day calendar so days with zero bookings still show.

**28. Explain a transaction scenario.** `sp_create_booking`: lock resource, validate, insert booking, insert equipment; if any step fails the whole thing rolls back, proven by demo 05 where requesting 999 units leaves the booking count unchanged.

**29. What are DDL, DML, DCL, TCL?** DDL defines structure (CREATE, ALTER, DROP), DML changes data (INSERT, UPDATE, DELETE), DCL controls access (GRANT, REVOKE), TCL controls transactions (COMMIT, ROLLBACK, SAVEPOINT). Demo 01 runs all four.

**30. HAVING vs WHERE?** WHERE filters rows before grouping, HAVING filters groups after aggregation.

**31. INNER vs LEFT JOIN example?** Resources that were never booked need a LEFT JOIN with `b.id IS NULL`; an inner join would hide them.

**32. How do you protect against SQL injection?** Parameterised queries everywhere (`?` placeholders), Zod validation of all input, stored procedures with typed parameters, least-privilege DB user. A test posts SQL-injection strings and checks nothing breaks.

## E. Backend and security

**33. How does authentication work?** Login verifies a bcrypt hash and returns a signed JWT with a unique `jti`. Logout stores the `jti` in `revoked_tokens`.

**34. Why re-check the user on every request?** The middleware reloads role and status from MySQL, so a suspended user or demoted admin loses access immediately, not when the token expires.

**35. How is authorization enforced?** `requireRole('admin')` middleware on every admin route, plus ownership checks in services. The frontend hides buttons, but the server is the real gate; tests assert 401 and 403 cases.

**36. How are passwords stored?** bcrypt with a per-password salt (10 rounds). Reset tokens are stored only as a SHA-256 hash and expire.

**37. What other security measures exist?** CORS allow-list, auth rate limit (30 per 15 min per IP), general rate limit, request size limit, no secrets in code (zod-validated env), safe error messages, constant-time dummy hash to avoid user enumeration at login, CSV formula-injection protection.

**38. How are errors mapped?** Procedures and triggers `SIGNAL SQLSTATE '45000'` with `'CODE: message'`; the error handler turns codes into HTTP statuses (409 conflicts, 403, 404, 422 other rules).

**39. How do analytics work?** Real SQL: views and procedures feed `/admin/analytics/*`. Nothing is hard-coded or random.

## F. Frontend

**40. Which frontend libraries and why?** React + TypeScript for typed components, Vite for fast builds, Tailwind for design tokens (light and dark themes via CSS variables), Recharts for charts, React Hook Form + Zod for validated forms, Axios with one client, Framer Motion used sparingly.

**41. What is the "availability ribbon"?** A compact timeline showing a day's free and busy periods for a resource (booked, pending, class, maintenance, your booking, your selection), reused on cards, details, calendar and booking form.

**42. How do you handle loading, empty and error states?** A shared `useLoad` hook returns data, loading and error; pages render skeletons, empty states with an action, or an error state with Retry.

**43. How do users avoid conflicts before submitting?** The booking form shows the day's schedule and highlights the chosen window, but the database remains the authority: if someone else wins the slot first, the user sees "That slot was just taken".

## G. Testing and limitations

**44. How did you test?** 30 backend integration tests (auth, RBAC, lifecycle, overlaps, race, maintenance, analytics, Mongo outage) on a separate test database, SQL demo scripts run on a copy, and a Playwright run through the real UI (login for all roles, booking, conflict, approval, cancellation, maintenance, CSV download).

**45. What are the known limitations?** No email sending (reset token shown only in development), no automated frontend unit tests, not run on Windows during development, a single-instance scheduler (would need a lock for multiple API servers), and the utilization metric depends on the configured opening hours.

**46. What would you add next?** Email/SMS delivery, recurring bookings, calendar (iCal) export, and WebSocket live updates.

**47. Why stored procedures instead of only application code?** The rules and locking then hold for every client, including future ones, and transactions run close to the data, cutting round trips.

**48. What is an outbox pattern and where is it used?** Notifications are saved in MySQL first with `mongo_synced = 0`; a job copies them to MongoDB and flips the flag. This gives at-least-once delivery without a distributed transaction, and the unique `notificationId` index in MongoDB prevents duplicates.
