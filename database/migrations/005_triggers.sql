-- =====================================================================
-- QuadBook  |  Migration 005  |  Triggers
-- Session variables used by the stored procedures / seeder:
--   @sc_actor    user id performing the change (audit trail)
--   @sc_seeding  1 = bulk-loading historical data, skip notifications/history
-- =====================================================================
DELIMITER $$

-- ---------------------------------------------------------------------
-- 1. BEFORE INSERT on bookings: default code + DOUBLE-BOOKING GUARD.
--    The resource row is locked (SELECT ... FOR UPDATE) so concurrent
--    inserts for the same resource are serialised; the second one then
--    sees the first one's committed row and is rejected.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_bookings_bi BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_lock INT UNSIGNED;
  DECLARE v_conflict VARCHAR(20);
  DECLARE v_msg VARCHAR(200);

  IF NEW.booking_code IS NULL OR NEW.booking_code = '' THEN
    SET NEW.booking_code = CONCAT('BK-', DATE_FORMAT(NOW(), '%y%m'), '-',
                                  UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 6)));
  END IF;

  IF NEW.status IN ('pending','approved') THEN
    SELECT id INTO v_lock FROM resources WHERE id = NEW.resource_id FOR UPDATE;
    SET v_conflict = fn_slot_conflict(NEW.resource_id, NEW.start_time, NEW.end_time, NULL);
    IF v_conflict <> 'OK' THEN
      SET v_msg = CASE v_conflict
        WHEN 'BOOKING_CONFLICT' THEN 'BOOKING_CONFLICT: This resource is already booked for an overlapping time slot'
        WHEN 'MAINTENANCE'      THEN 'MAINTENANCE: This resource is under maintenance during the requested time'
        WHEN 'CLASS_SCHEDULE'   THEN 'CLASS_SCHEDULE: A scheduled class occupies this resource during the requested time'
        WHEN 'RETIRED'          THEN 'RESOURCE_RETIRED: This resource is no longer available for booking'
        ELSE 'NOT_FOUND: Resource does not exist' END;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- 2. BEFORE UPDATE on bookings: state machine + re-check overlap when the
--    window / resource of an active booking changes.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_bookings_bu BEFORE UPDATE ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_lock INT UNSIGNED;
  DECLARE v_conflict VARCHAR(20);
  DECLARE v_msg VARCHAR(200);

  IF OLD.status IN ('rejected','cancelled','completed') AND NEW.status IN ('pending','approved') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_STATE: A closed booking cannot be re-opened';
  END IF;

  IF NEW.status IN ('pending','approved')
     AND (NEW.start_time <> OLD.start_time OR NEW.end_time <> OLD.end_time OR NEW.resource_id <> OLD.resource_id) THEN
    SELECT id INTO v_lock FROM resources WHERE id = NEW.resource_id FOR UPDATE;
    SET v_conflict = fn_slot_conflict(NEW.resource_id, NEW.start_time, NEW.end_time, OLD.id);
    IF v_conflict <> 'OK' THEN
      SET v_msg = CASE v_conflict
        WHEN 'BOOKING_CONFLICT' THEN 'BOOKING_CONFLICT: This resource is already booked for an overlapping time slot'
        WHEN 'MAINTENANCE'      THEN 'MAINTENANCE: This resource is under maintenance during the requested time'
        WHEN 'CLASS_SCHEDULE'   THEN 'CLASS_SCHEDULE: A scheduled class occupies this resource during the requested time'
        ELSE 'RESOURCE_RETIRED: This resource is no longer available for booking' END;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- 3. AFTER INSERT on bookings: status history + notifications
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_bookings_ai AFTER INSERT ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_res VARCHAR(120);
  DECLARE v_user VARCHAR(120);
  DECLARE v_when VARCHAR(80);

  IF COALESCE(@sc_seeding, 0) = 0 THEN
    SELECT name INTO v_res FROM resources WHERE id = NEW.resource_id;
    SELECT full_name INTO v_user FROM users WHERE id = NEW.user_id;
    SET v_when = CONCAT(DATE_FORMAT(NEW.start_time, '%d %b %Y, %h:%i %p'), ' - ', DATE_FORMAT(NEW.end_time, '%h:%i %p'));

    INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, COALESCE(@sc_actor, NEW.user_id));

    INSERT INTO notifications (user_id, type, title, message, booking_id)
    VALUES (NEW.user_id,
            IF(NEW.status = 'approved', 'booking_approved', 'booking_created'),
            IF(NEW.status = 'approved', 'Booking confirmed', 'Booking request received'),
            IF(NEW.status = 'approved',
               CONCAT(v_res, ' is confirmed for ', v_when, '.'),
               CONCAT('Your request for ', v_res, ' on ', v_when, ' is awaiting administrator approval.')),
            NEW.id);

    IF NEW.status = 'pending' THEN
      INSERT INTO notifications (user_id, type, title, message, booking_id)
      SELECT u.id, 'booking_created', 'New booking awaiting approval',
             CONCAT(v_user, ' requested ', v_res, ' on ', v_when, '.'), NEW.id
        FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.status = 'active' AND u.id <> NEW.user_id;
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- 4. AFTER UPDATE on bookings: status history + user notification
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_bookings_au AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_res VARCHAR(120);
  DECLARE v_when VARCHAR(80);
  DECLARE v_remarks VARCHAR(255);

  IF COALESCE(@sc_seeding, 0) = 0 AND NEW.status <> OLD.status THEN
    SELECT name INTO v_res FROM resources WHERE id = NEW.resource_id;
    SET v_when = CONCAT(DATE_FORMAT(NEW.start_time, '%d %b %Y, %h:%i %p'), ' - ', DATE_FORMAT(NEW.end_time, '%h:%i %p'));

    INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, @sc_actor);

    IF NEW.status IN ('approved','rejected') THEN
      SELECT remarks INTO v_remarks FROM booking_approvals WHERE booking_id = NEW.id;
      INSERT INTO notifications (user_id, type, title, message, booking_id)
      VALUES (NEW.user_id,
              IF(NEW.status = 'approved', 'booking_approved', 'booking_rejected'),
              IF(NEW.status = 'approved', 'Booking approved', 'Booking rejected'),
              CONCAT(v_res, ' on ', v_when, IF(NEW.status = 'approved', ' was approved.', ' was rejected.'),
                     IF(v_remarks IS NULL OR v_remarks = '', '', CONCAT(' Remarks: ', v_remarks))),
              NEW.id);
    ELSEIF NEW.status = 'cancelled' THEN
      INSERT INTO notifications (user_id, type, title, message, booking_id)
      VALUES (NEW.user_id, 'booking_cancelled', 'Booking cancelled',
              CONCAT(v_res, ' on ', v_when, ' was cancelled.',
                     IF(NEW.cancel_reason IS NULL, '', CONCAT(' Reason: ', NEW.cancel_reason))),
              NEW.id);
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- 5. Maintenance: keep resources.status in sync + notify
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_maintenance_ai AFTER INSERT ON maintenance_requests
FOR EACH ROW
BEGIN
  DECLARE v_res VARCHAR(120);

  UPDATE resources r
     SET r.status = IF(EXISTS(
           SELECT 1 FROM maintenance_requests m
            WHERE m.resource_id = r.id AND m.status IN ('open','in_progress')
              AND m.starts_at <= NOW() AND (m.expected_end IS NULL OR m.expected_end > NOW())),
         'maintenance', 'available')
   WHERE r.id = NEW.resource_id AND r.status <> 'retired';

  IF COALESCE(@sc_seeding, 0) = 0 THEN
    SELECT name INTO v_res FROM resources WHERE id = NEW.resource_id;
    INSERT INTO notifications (user_id, type, title, message, maintenance_id)
    SELECT u.id, 'maintenance_update',
           IF(NEW.status = 'reported', 'New maintenance report', 'Maintenance scheduled'),
           CONCAT(v_res, ': ', NEW.title, ' (priority ', NEW.priority, ').'), NEW.id
      FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'admin' AND u.status = 'active';
  END IF;
END$$

CREATE TRIGGER trg_maintenance_au AFTER UPDATE ON maintenance_requests
FOR EACH ROW
BEGIN
  DECLARE v_res VARCHAR(120);

  UPDATE resources r
     SET r.status = IF(EXISTS(
           SELECT 1 FROM maintenance_requests m
            WHERE m.resource_id = r.id AND m.status IN ('open','in_progress')
              AND m.starts_at <= NOW() AND (m.expected_end IS NULL OR m.expected_end > NOW())),
         'maintenance', 'available')
   WHERE r.id IN (NEW.resource_id, OLD.resource_id) AND r.status <> 'retired';

  IF COALESCE(@sc_seeding, 0) = 0 AND NEW.status <> OLD.status AND NEW.reported_by IS NOT NULL THEN
    SELECT name INTO v_res FROM resources WHERE id = NEW.resource_id;
    INSERT INTO notifications (user_id, type, title, message, maintenance_id)
    VALUES (NEW.reported_by, 'maintenance_update', 'Maintenance update',
            CONCAT('Your report "', NEW.title, '" for ', v_res, ' is now ', REPLACE(NEW.status, '_', ' '), '.'),
            NEW.id);
  END IF;
END$$

DELIMITER ;
