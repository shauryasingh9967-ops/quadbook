-- =====================================================================
-- QuadBook | Demo 01 | DDL, DML, DCL and TCL
-- Run against a COPY of the database (it creates and drops scratch objects):
--   mysql -u root -p smart_campus < 01_ddl_dml_dcl_tcl.sql   (needs a user with CREATE USER + GRANT OPTION)
-- =====================================================================

-- ---------------------------- DDL -----------------------------------
CREATE TABLE demo_feedback (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  BIGINT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  comment_txt VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_demo_feedback_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT chk_demo_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

ALTER TABLE demo_feedback ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER comment_txt;
CREATE INDEX idx_demo_feedback_rating ON demo_feedback (rating);
SHOW CREATE TABLE demo_feedback\G

-- ---------------------------- DML -----------------------------------
INSERT INTO demo_feedback (booking_id, rating, comment_txt)
SELECT id, 5, 'Projector and AC worked perfectly'
  FROM bookings WHERE status = 'completed' ORDER BY id LIMIT 3;

UPDATE demo_feedback SET is_public = 1 WHERE rating >= 4;
SELECT * FROM demo_feedback;
DELETE FROM demo_feedback WHERE id = (SELECT MIN(id) FROM (SELECT id FROM demo_feedback) t);
SELECT COUNT(*) AS rows_left FROM demo_feedback;

-- ---------------------------- CHECK constraint rejects bad data -----
-- Expected: ERROR 3819 (chk_demo_rating violated)
-- INSERT INTO demo_feedback (booking_id, rating) VALUES (1, 9);

TRUNCATE TABLE demo_feedback;
DROP TABLE demo_feedback;

-- ---------------------------- DCL -----------------------------------
-- Least-privilege accounts: one for the API, one read-only for reporting.
CREATE USER IF NOT EXISTS 'sc_demo_report'@'localhost' IDENTIFIED BY 'Report#Demo123';
GRANT SELECT ON smart_campus.v_booking_details    TO 'sc_demo_report'@'localhost';
GRANT SELECT ON smart_campus.v_popular_resources  TO 'sc_demo_report'@'localhost';
GRANT SELECT ON smart_campus.v_monthly_booking_trends TO 'sc_demo_report'@'localhost';
SHOW GRANTS FOR 'sc_demo_report'@'localhost';
REVOKE SELECT ON smart_campus.v_booking_details FROM 'sc_demo_report'@'localhost';
SHOW GRANTS FOR 'sc_demo_report'@'localhost';
DROP USER 'sc_demo_report'@'localhost';

-- ---------------------------- TCL -----------------------------------
-- COMMIT, ROLLBACK and SAVEPOINT in one transaction
START TRANSACTION;
  UPDATE system_settings SET setting_value = '4' WHERE setting_key = 'max_hours_student';
  SAVEPOINT after_student_limit;
  UPDATE system_settings SET setting_value = '8' WHERE setting_key = 'max_hours_faculty';
  SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'max_hours%';
  ROLLBACK TO SAVEPOINT after_student_limit;      -- undo only the faculty change
  SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'max_hours%';
ROLLBACK;                                          -- undo everything
SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'max_hours%';
