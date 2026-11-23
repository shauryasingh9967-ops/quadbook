-- =====================================================================
-- QuadBook | Demo 04 | Triggers, stored procedures, functions, indexes
-- Run on a COPY of the database with --force. The stored procedures own their transaction (they
-- COMMIT internally), so the demo booking is removed explicitly at the end instead of by ROLLBACK.
-- =====================================================================
SET @res  = (SELECT id FROM resources WHERE code = 'CSE-LAB-01' LIMIT 1);
SET @stu  = (SELECT id FROM users WHERE email = 'aarav.sharma@smartcampus.edu');
SET @adm  = (SELECT id FROM users WHERE email = 'neha.kapoor@smartcampus.edu');
SET @day  = DATE_ADD(CURDATE(), INTERVAL 20 DAY);
-- avoid Sundays (campus closed in the demo data)
SET @day  = IF(DAYOFWEEK(@day) = 1, DATE_ADD(@day, INTERVAL 1 DAY), @day);
SET @s1   = TIMESTAMP(@day, '16:00:00');
SET @e1   = TIMESTAMP(@day, '17:00:00');

-- ---------------- FUNCTIONS ------------------------------------------
SELECT fn_booking_hours('2026-01-05 10:00:00', '2026-01-05 12:30:00') AS hours;       -- 2.5
SELECT fn_setting_int('max_hours_student', 3) AS student_limit;
SELECT fn_slot_conflict(@res, @s1, @e1, NULL) AS conflict_before;                      -- OK

-- ---------------- PROCEDURE + TRIGGERS: sp_create_booking ------------
START TRANSACTION;
CALL sp_create_booking(@stu, @res, @s1, @e1, 'Demo: team stand-up', 3, NULL, @bid, @st);
SELECT @bid AS booking_id, @st AS status;
SELECT fn_slot_conflict(@res, @s1, @e1, NULL) AS conflict_after;                       -- BOOKING_CONFLICT

-- trigger trg_bookings_ai wrote history + notifications
SELECT * FROM booking_status_history WHERE booking_id = @bid;
SELECT user_id, type, title FROM notifications WHERE booking_id = @bid;

-- ---------------- DOUBLE BOOKING GUARD (trigger trg_bookings_bi) -----
-- Expected: ERROR 1644 (45000): BOOKING_CONFLICT: ...  even for a raw INSERT that bypasses the API
-- INSERT INTO bookings (booking_code, resource_id, user_id, start_time, end_time, purpose, attendees, status)
-- VALUES ('RAW-1', @res, @stu, @s1, @e1, 'raw insert', 1, 'pending');

-- ---------------- sp_decide_booking (approve) -----------------------
CALL sp_decide_booking(@bid, @adm, 'approved', 'Demo approval');
SELECT status FROM bookings WHERE id = @bid;
SELECT * FROM booking_approvals WHERE booking_id = @bid;

-- ---------------- sp_cancel_booking ---------------------------------
CALL sp_cancel_booking(@bid, @stu, 'Demo cancellation');
SELECT status, cancel_reason FROM bookings WHERE id = @bid;
SELECT type, title FROM notifications WHERE booking_id = @bid ORDER BY id;

-- state machine trigger (trg_bookings_bu): a cancelled booking cannot be re-opened
-- Expected: ERROR 1644 (45000): INVALID_STATE: A closed booking cannot be re-opened
-- UPDATE bookings SET status = 'approved' WHERE id = @bid;
COMMIT;
DELETE FROM bookings WHERE id = @bid;   -- clean up the demo booking

-- ---------------- MAINTENANCE TRIGGER --------------------------------
START TRANSACTION;
INSERT INTO maintenance_requests (resource_id, reported_by, assigned_to, title, priority, status, starts_at, expected_end)
VALUES (@res, @adm, @adm, 'Demo: switch replacement', 'high', 'open', NOW() - INTERVAL 1 HOUR, NOW() + INTERVAL 5 HOUR);
SELECT status AS resource_status FROM resources WHERE id = @res;                      -- maintenance
SELECT fn_slot_conflict(@res, @s1, @e1, NULL) AS during_maintenance;                  -- OK later today? depends on window
ROLLBACK;

-- ---------------- HOUSEKEEPING + UTILIZATION PROCEDURES ---------------
CALL sp_housekeeping();
CALL sp_resource_utilization(CURDATE() - INTERVAL 30 DAY, CURDATE());

-- ---------------- INDEXES: show they are used ------------------------
SHOW INDEX FROM bookings;
EXPLAIN SELECT id FROM bookings WHERE resource_id = @res AND start_time < @e1 AND end_time > @s1;
EXPLAIN SELECT COUNT(*) FROM notifications WHERE user_id = @stu AND is_read = 0;
SELECT trigger_name, event_manipulation, event_object_table, action_timing FROM information_schema.triggers WHERE trigger_schema = DATABASE();
SELECT routine_type, routine_name FROM information_schema.routines WHERE routine_schema = DATABASE() ORDER BY routine_type, routine_name;
