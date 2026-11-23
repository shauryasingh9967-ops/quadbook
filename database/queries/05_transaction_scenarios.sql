-- =====================================================================
-- QuadBook | Demo 05 | Three transaction scenarios
-- Run with:  mysql --force -t -u root -p <db> < 05_transaction_scenarios.sql  (--force keeps going past the expected errors)
-- Each one is also what the application runs (see database/migrations/004_procedures.sql).
-- =====================================================================
SET @res = (SELECT resource_id FROM equipment WHERE bookable_addon = 1 AND status = 'operational' AND quantity_total < 999 ORDER BY resource_id LIMIT 1);
SET @stu = (SELECT id FROM users WHERE email = 'aarav.sharma@smartcampus.edu');
SET @fac = (SELECT id FROM users WHERE email = 'meera.nair@smartcampus.edu');
SET @adm = (SELECT id FROM users WHERE email = 'neha.kapoor@smartcampus.edu');
SET @day = DATE_ADD(CURDATE(), INTERVAL 12 DAY);
SET @day = IF(DAYOFWEEK(@day) = 1, DATE_ADD(@day, INTERVAL 1 DAY), @day);

-- ---------------------------------------------------------------------
-- SCENARIO 1: ATOMIC BOOKING CREATION (all-or-nothing)
-- sp_create_booking locks the resource row, validates rules, inserts the booking and its
-- equipment add-ons, and rolls back everything if any step fails.
-- ---------------------------------------------------------------------
SET @eq = (SELECT id FROM equipment WHERE resource_id = @res AND bookable_addon = 1 AND status = 'operational' LIMIT 1);
-- 1a. failure path first: asking for more equipment than exists must leave NO booking behind
SELECT COUNT(*) AS bookings_before FROM bookings;
-- Expected: ERROR 1644 EQUIPMENT_INVALID / not enough stock; the count below stays identical
CALL sp_create_booking(@stu, @res, TIMESTAMP(@day,'09:00:00'), TIMESTAMP(@day,'10:30:00'), 'Should roll back', 2,
                       JSON_ARRAY(JSON_OBJECT('equipmentId', @eq, 'quantity', 999)), @b2, @s2);
SELECT COUNT(*) AS bookings_after FROM bookings;


-- 1b. success path: same slot, sane quantity
CALL sp_create_booking(@stu, @res, TIMESTAMP(@day, '09:00:00'), TIMESTAMP(@day, '10:30:00'), 'Scenario 1: booking with equipment', 2,
                       JSON_ARRAY(JSON_OBJECT('equipmentId', @eq, 'quantity', 1)), @b1, @s1);
SELECT @b1 AS booking_id, @s1 AS status;
SELECT * FROM booking_equipment WHERE booking_id = @b1;

-- ---------------------------------------------------------------------
-- SCENARIO 2: APPROVAL WORKFLOW (booking + approval record + history + notification in one unit)
-- ---------------------------------------------------------------------
CALL sp_decide_booking(@b1, @adm, 'approved', 'Scenario 2 approval');
SELECT b.status, a.decision, a.remarks FROM bookings b JOIN booking_approvals a ON a.booking_id = b.id WHERE b.id = @b1;
SELECT old_status, new_status FROM booking_status_history WHERE booking_id = @b1 ORDER BY id;
-- a second decision on the same booking is refused (ERROR 1644 INVALID_STATE)
CALL sp_decide_booking(@b1, @adm, 'rejected', 'too late');

-- ---------------------------------------------------------------------
-- SCENARIO 3: CONCURRENCY - two sessions competing for the same slot
-- Open two mysql sessions and run the blocks in the order shown. Session B waits on the
-- resource-row lock until A commits, then fails with BOOKING_CONFLICT. (The Vitest suite
-- fires 8 parallel API calls and asserts that exactly 1 wins.)
--
--   Session A:  START TRANSACTION;
--               CALL sp_create_booking(@stu, @res, '<same slot>', ..., @id, @st);   -- holds the lock
--   Session B:  CALL sp_create_booking(@fac, @res, '<same slot>', ..., @id, @st);   -- blocks...
--   Session A:  COMMIT;                                                             -- releases lock
--   Session B:  ERROR 1644 (45000): BOOKING_CONFLICT: This resource is already booked ...
-- ---------------------------------------------------------------------
-- single-session simulation: second insert for the same slot is rejected
CALL sp_create_booking(@fac, @res, TIMESTAMP(@day, '09:30:00'), TIMESTAMP(@day, '10:00:00'), 'Scenario 3: overlap attempt', 5, NULL, @b3, @s3);

-- clean up what this demo created
DELETE FROM bookings WHERE id IN (@b1, @b3);
