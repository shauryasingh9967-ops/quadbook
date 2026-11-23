-- =====================================================================
-- QuadBook  |  Migration 004  |  Stored procedures (transactional units)
-- Error contract: SIGNAL SQLSTATE '45000' with MESSAGE_TEXT = 'CODE: message'.
-- The API layer maps CODE -> HTTP status.
-- =====================================================================
DELIMITER $$

-- ---------------------------------------------------------------------
-- Business-rule validation shared by create + update.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_validate_booking_rules(
  IN p_role VARCHAR(20), IN p_resource_id INT UNSIGNED,
  IN p_start DATETIME, IN p_end DATETIME, IN p_attendees SMALLINT UNSIGNED)
BEGIN
  DECLARE v_capacity SMALLINT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_max_hours INT;
  DECLARE v_window_days INT;
  DECLARE v_day_start INT;
  DECLARE v_day_end INT;

  SELECT capacity, status INTO v_capacity, v_status FROM resources WHERE id = p_resource_id;
  IF v_capacity IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: Resource does not exist';
  END IF;
  IF v_status = 'retired' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RESOURCE_RETIRED: This resource is no longer available for booking';
  END IF;
  IF p_end <= p_start THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_TIME: End time must be after start time';
  END IF;
  IF DATE(p_start) <> DATE(p_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_TIME: A booking must start and end on the same day';
  END IF;
  IF p_start <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_TIME: Bookings must start in the future';
  END IF;
  IF p_attendees > v_capacity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAPACITY_EXCEEDED: Attendees exceed the capacity of this resource';
  END IF;

  SET v_max_hours   = IF(p_role = 'faculty', fn_setting_int('max_hours_faculty', 6),
                      IF(p_role = 'admin',   fn_setting_int('max_hours_faculty', 6) * 2,
                                             fn_setting_int('max_hours_student', 3)));
  SET v_window_days = fn_setting_int('booking_window_days', 30);
  SET v_day_start   = fn_setting_int('day_start_hour', 8);
  SET v_day_end     = fn_setting_int('day_end_hour', 20);

  IF TIMESTAMPDIFF(MINUTE, p_start, p_end) > v_max_hours * 60 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DURATION_EXCEEDED: Booking is longer than the maximum allowed for your role';
  END IF;
  IF DATE(p_start) > DATE_ADD(CURDATE(), INTERVAL v_window_days DAY) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OUTSIDE_WINDOW: Bookings cannot be made this far in advance';
  END IF;
  IF TIME_TO_SEC(TIME(p_start)) < v_day_start * 3600 OR TIME_TO_SEC(TIME(p_end)) > v_day_end * 3600 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OUTSIDE_HOURS: Bookings must fall within campus operating hours';
  END IF;
END$$

-- ---------------------------------------------------------------------
-- TRANSACTION SCENARIO 1: create a booking (atomic, concurrency-safe)
--   1. lock the resource row  -> all bookings for one resource are serialised
--   2. validate rules, INSERT booking (trigger re-checks overlap as a backstop)
--   3. attach equipment add-ons, write auto-approval if applicable
--   any failure -> ROLLBACK, nothing is persisted
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_create_booking(
  IN  p_user_id     INT UNSIGNED,
  IN  p_resource_id INT UNSIGNED,
  IN  p_start       DATETIME,
  IN  p_end         DATETIME,
  IN  p_purpose     VARCHAR(255),
  IN  p_attendees   SMALLINT UNSIGNED,
  IN  p_equipment   JSON,
  OUT p_booking_id  BIGINT UNSIGNED,
  OUT p_status      VARCHAR(20))
BEGIN
  DECLARE v_role VARCHAR(20);
  DECLARE v_user_status VARCHAR(20);
  DECLARE v_requires TINYINT(1);
  DECLARE v_lock INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT r.name, u.status INTO v_role, v_user_status
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = p_user_id;
  IF v_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: User does not exist';
  END IF;
  IF v_user_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FORBIDDEN: Account is suspended';
  END IF;

  SET @sc_actor = p_user_id;
  START TRANSACTION;

  SELECT id, requires_approval INTO v_lock, v_requires
    FROM resources WHERE id = p_resource_id FOR UPDATE;
  IF v_lock IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: Resource does not exist';
  END IF;

  CALL sp_validate_booking_rules(v_role, p_resource_id, p_start, p_end, p_attendees);

  SET p_status = IF(v_requires = 1 AND v_role <> 'admin', 'pending', 'approved');

  INSERT INTO bookings (resource_id, user_id, start_time, end_time, purpose, attendees, status)
  VALUES (p_resource_id, p_user_id, p_start, p_end, p_purpose, p_attendees, p_status);
  SET p_booking_id = LAST_INSERT_ID();

  IF p_equipment IS NOT NULL AND JSON_LENGTH(p_equipment) > 0 THEN
    IF EXISTS (
      SELECT 1
        FROM JSON_TABLE(p_equipment, '$[*]' COLUMNS (eid INT UNSIGNED PATH '$.equipmentId', qty INT PATH '$.quantity')) j
        LEFT JOIN equipment e ON e.id = j.eid
       WHERE e.id IS NULL OR e.resource_id <> p_resource_id OR e.bookable_addon = 0
          OR e.status <> 'operational' OR j.qty IS NULL OR j.qty < 1) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EQUIPMENT_INVALID: One or more equipment items cannot be requested for this resource';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM (SELECT eid, SUM(qty) AS qty
                FROM JSON_TABLE(p_equipment, '$[*]' COLUMNS (eid INT UNSIGNED PATH '$.equipmentId', qty INT PATH '$.quantity')) x
               GROUP BY eid) j
        JOIN equipment e ON e.id = j.eid
       WHERE j.qty > e.quantity_total - COALESCE((
              SELECT SUM(be.quantity)
                FROM booking_equipment be JOIN bookings b ON b.id = be.booking_id
               WHERE be.equipment_id = e.id AND b.status IN ('pending','approved')
                 AND b.start_time < p_end AND b.end_time > p_start), 0)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EQUIPMENT_UNAVAILABLE: Requested equipment quantity is not available in this time slot';
    END IF;

    INSERT INTO booking_equipment (booking_id, equipment_id, quantity)
    SELECT p_booking_id, eid, SUM(qty)
      FROM JSON_TABLE(p_equipment, '$[*]' COLUMNS (eid INT UNSIGNED PATH '$.equipmentId', qty INT PATH '$.quantity')) j
     GROUP BY eid;
  END IF;

  IF p_status = 'approved' THEN
    INSERT INTO booking_approvals (booking_id, admin_id, decision, remarks)
    VALUES (p_booking_id, NULL, 'auto_approved', 'Approved automatically by policy');
  END IF;

  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- TRANSACTION SCENARIO 2: approve / reject a pending booking
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_decide_booking(
  IN p_booking_id BIGINT UNSIGNED,
  IN p_admin_id   INT UNSIGNED,
  IN p_decision   VARCHAR(10),
  IN p_remarks    VARCHAR(255))
BEGIN
  DECLARE v_admin_role VARCHAR(20);
  DECLARE v_status VARCHAR(20);
  DECLARE v_resource INT UNSIGNED;
  DECLARE v_start DATETIME;
  DECLARE v_end DATETIME;
  DECLARE v_conflict VARCHAR(20);
  DECLARE v_lock INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_decision NOT IN ('approved','rejected') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VALIDATION: Decision must be approved or rejected';
  END IF;
  SELECT r.name INTO v_admin_role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = p_admin_id;
  IF v_admin_role IS NULL OR v_admin_role <> 'admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FORBIDDEN: Only administrators can decide bookings';
  END IF;

  SET @sc_actor = p_admin_id;
  START TRANSACTION;

  SELECT status, resource_id, start_time, end_time
    INTO v_status, v_resource, v_start, v_end
    FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: Booking does not exist';
  END IF;
  IF v_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATE: Only pending bookings can be approved or rejected';
  END IF;

  IF p_decision = 'approved' THEN
    SELECT id INTO v_lock FROM resources WHERE id = v_resource FOR UPDATE;
    IF v_start <= NOW() THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'BOOKING_EXPIRED: The requested slot has already started';
    END IF;
    SET v_conflict = fn_slot_conflict(v_resource, v_start, v_end, p_booking_id);
    IF v_conflict <> 'OK' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CONFLICT: Slot is no longer free (maintenance, class schedule or another booking)';
    END IF;
  END IF;

  -- approval row first so the AFTER UPDATE trigger can quote the remarks
  INSERT INTO booking_approvals (booking_id, admin_id, decision, remarks)
  VALUES (p_booking_id, p_admin_id, p_decision, p_remarks);

  UPDATE bookings SET status = p_decision WHERE id = p_booking_id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- TRANSACTION SCENARIO 3: cancel a booking (owner or admin)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_cancel_booking(
  IN p_booking_id BIGINT UNSIGNED,
  IN p_actor_id   INT UNSIGNED,
  IN p_reason     VARCHAR(255))
BEGIN
  DECLARE v_role VARCHAR(20);
  DECLARE v_owner INT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_start DATETIME;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT r.name INTO v_role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = p_actor_id;
  IF v_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: User does not exist';
  END IF;

  SET @sc_actor = p_actor_id;
  START TRANSACTION;

  SELECT user_id, status, start_time INTO v_owner, v_status, v_start
    FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: Booking does not exist';
  END IF;
  IF v_owner <> p_actor_id AND v_role <> 'admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FORBIDDEN: You can only cancel your own bookings';
  END IF;
  IF v_status NOT IN ('pending','approved') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATE: Only pending or approved bookings can be cancelled';
  END IF;
  IF v_role <> 'admin' AND v_start <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TOO_LATE: A booking that has already started cannot be cancelled';
  END IF;

  UPDATE bookings
     SET status = 'cancelled', cancel_reason = COALESCE(NULLIF(p_reason, ''), 'Cancelled by user'),
         cancelled_at = NOW()
   WHERE id = p_booking_id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Edit a still-pending booking (owner only). Conflict re-check happens in
-- trg_bookings_bu under the same resource lock.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_update_booking(
  IN p_booking_id BIGINT UNSIGNED,
  IN p_user_id    INT UNSIGNED,
  IN p_start      DATETIME,
  IN p_end        DATETIME,
  IN p_purpose    VARCHAR(255),
  IN p_attendees  SMALLINT UNSIGNED)
BEGIN
  DECLARE v_role VARCHAR(20);
  DECLARE v_owner INT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_resource INT UNSIGNED;
  DECLARE v_lock INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT r.name INTO v_role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = p_user_id;
  SET @sc_actor = p_user_id;
  START TRANSACTION;

  SELECT user_id, status, resource_id INTO v_owner, v_status, v_resource
    FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_FOUND: Booking does not exist';
  END IF;
  IF v_owner <> p_user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FORBIDDEN: You can only edit your own bookings';
  END IF;
  IF v_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATE: Only pending bookings can be edited';
  END IF;

  SELECT id INTO v_lock FROM resources WHERE id = v_resource FOR UPDATE;
  CALL sp_validate_booking_rules(v_role, v_resource, p_start, p_end, p_attendees);

  UPDATE bookings
     SET start_time = p_start, end_time = p_end, purpose = p_purpose, attendees = p_attendees
   WHERE id = p_booking_id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Analytics: utilisation % per resource for a date range.
-- utilisation = (ad-hoc booked hours + timetabled class hours)
--               / (Mon-Sat days in range * operating hours per day)
-- Uses a recursive CTE to build the calendar and expand weekly timetable rows.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_resource_utilization(IN p_from DATE, IN p_to DATE)
BEGIN
  DECLARE v_hours_per_day INT;
  SET v_hours_per_day = GREATEST(fn_setting_int('day_end_hour', 20) - fn_setting_int('day_start_hour', 8), 1);

  WITH RECURSIVE days AS (
    SELECT p_from AS d
    UNION ALL
    SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM days WHERE d < p_to
  ),
  open_days AS (SELECT COUNT(*) AS n FROM days WHERE WEEKDAY(d) < 6),
  class_hours AS (
    SELECT s.resource_id, SUM(TIME_TO_SEC(TIMEDIFF(s.end_time, s.start_time)) / 3600) AS hrs
      FROM academic_schedules s
      JOIN days ON WEEKDAY(days.d) = s.day_of_week AND days.d BETWEEN s.valid_from AND s.valid_to
     GROUP BY s.resource_id
  ),
  booked AS (
    SELECT b.resource_id, COUNT(*) AS n, SUM(fn_booking_hours(b.start_time, b.end_time)) AS hrs
      FROM bookings b
     WHERE b.status IN ('approved','completed') AND DATE(b.start_time) BETWEEN p_from AND p_to
     GROUP BY b.resource_id
  )
  SELECT r.id, r.code, r.name, c.name AS category, c.kind,
         COALESCE(bk.n, 0) AS bookings,
         ROUND(COALESCE(bk.hrs, 0), 2) AS booked_hours,
         ROUND(COALESCE(ch.hrs, 0), 2) AS class_hours,
         (od.n * v_hours_per_day) AS available_hours,
         LEAST(100, ROUND(100 * (COALESCE(bk.hrs, 0) + COALESCE(ch.hrs, 0)) / (od.n * v_hours_per_day), 1)) AS utilization_pct
    FROM resources r
    JOIN resource_categories c ON c.id = r.category_id
    CROSS JOIN open_days od
    LEFT JOIN booked bk ON bk.resource_id = r.id
    LEFT JOIN class_hours ch ON ch.resource_id = r.id
   WHERE r.status <> 'retired'
   ORDER BY utilization_pct DESC, r.name;
END$$

-- ---------------------------------------------------------------------
-- Housekeeping: finish past bookings, expire undecided ones, purge tokens.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_housekeeping()
BEGIN
  DECLARE v_completed INT DEFAULT 0;
  DECLARE v_expired INT DEFAULT 0;

  UPDATE bookings SET status = 'completed'
   WHERE status = 'approved' AND end_time < NOW();
  SET v_completed = ROW_COUNT();

  UPDATE bookings
     SET status = 'cancelled', cancelled_at = NOW(),
         cancel_reason = 'Expired: no decision was made before the start time'
   WHERE status = 'pending' AND start_time < NOW();
  SET v_expired = ROW_COUNT();

  UPDATE resources r SET r.status = IF(EXISTS(
            SELECT 1 FROM maintenance_requests m
             WHERE m.resource_id = r.id AND m.status IN ('open','in_progress')
               AND m.starts_at <= NOW() AND (m.expected_end IS NULL OR m.expected_end > NOW())),
          'maintenance', 'available')
   WHERE r.status <> 'retired';

  DELETE FROM revoked_tokens WHERE expires_at < NOW();
  DELETE FROM password_reset_tokens WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY);

  SELECT v_completed AS completed_bookings, v_expired AS expired_bookings;
END$$

DELIMITER ;
