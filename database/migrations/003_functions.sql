-- =====================================================================
-- QuadBook  |  Migration 003  |  Stored functions
-- =====================================================================
DELIMITER $$

-- Reads an integer value from system_settings, falling back to a default.
CREATE FUNCTION fn_setting_int(p_key VARCHAR(60), p_default INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_val VARCHAR(255);
  SELECT setting_value INTO v_val FROM system_settings WHERE setting_key = p_key;
  IF v_val IS NULL OR v_val NOT REGEXP '^-?[0-9]+$' THEN
    RETURN p_default;
  END IF;
  RETURN CAST(v_val AS SIGNED);
END$$

-- Duration of a booking in hours (2 decimals).
CREATE FUNCTION fn_booking_hours(p_start DATETIME, p_end DATETIME)
RETURNS DECIMAL(6,2)
DETERMINISTIC
BEGIN
  RETURN ROUND(TIMESTAMPDIFF(MINUTE, p_start, p_end) / 60, 2);
END$$

-- The single source of truth for "can this resource be used in this window?".
-- Returns 'OK' or the first reason the slot is NOT free:
--   NO_RESOURCE | RETIRED | BOOKING_CONFLICT | MAINTENANCE | CLASS_SCHEDULE
-- Overlap rule for half-open intervals:  existing.start < new.end AND existing.end > new.start
CREATE FUNCTION fn_slot_conflict(p_resource_id INT UNSIGNED, p_start DATETIME, p_end DATETIME,
                                 p_exclude_booking BIGINT UNSIGNED)
RETURNS VARCHAR(20)
READS SQL DATA
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_cnt INT DEFAULT 0;

  SELECT status INTO v_status FROM resources WHERE id = p_resource_id;
  IF v_status IS NULL THEN RETURN 'NO_RESOURCE'; END IF;
  IF v_status = 'retired' THEN RETURN 'RETIRED'; END IF;

  SELECT COUNT(*) INTO v_cnt
    FROM bookings b
   WHERE b.resource_id = p_resource_id
     AND b.status IN ('pending','approved')
     AND b.start_time < p_end AND b.end_time > p_start
     AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking);
  IF v_cnt > 0 THEN RETURN 'BOOKING_CONFLICT'; END IF;

  SELECT COUNT(*) INTO v_cnt
    FROM maintenance_requests m
   WHERE m.resource_id = p_resource_id
     AND m.status IN ('open','in_progress')
     AND m.starts_at < p_end
     AND COALESCE(m.expected_end, '9999-12-31 00:00:00') > p_start;
  IF v_cnt > 0 THEN RETURN 'MAINTENANCE'; END IF;

  SELECT COUNT(*) INTO v_cnt
    FROM academic_schedules s
   WHERE s.resource_id = p_resource_id
     AND s.day_of_week = WEEKDAY(p_start)
     AND DATE(p_start) BETWEEN s.valid_from AND s.valid_to
     AND s.start_time < TIME(p_end) AND s.end_time > TIME(p_start);
  IF v_cnt > 0 THEN RETURN 'CLASS_SCHEDULE'; END IF;

  RETURN 'OK';
END$$

DELIMITER ;
