-- =====================================================================
-- QuadBook  |  Migration 001  |  Core relational schema (DDL)
-- MySQL 8.0+  (InnoDB, utf8mb4).  CHECK constraints require 8.0.16+.
-- =====================================================================

-- ---------- Reference / lookup tables ---------------------------------
CREATE TABLE roles (
  id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(20)  NOT NULL,
  description VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE departments (
  id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(10)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  contact_email VARCHAR(120) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_code (code),
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE buildings (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(10)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  total_floors TINYINT UNSIGNED NOT NULL DEFAULT 1,
  description  VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_buildings_code (code),
  CONSTRAINT chk_buildings_floors CHECK (total_floors >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rooms (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_id SMALLINT UNSIGNED NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  floor_no    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  capacity    SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_building_number (building_id, room_number),
  CONSTRAINT fk_rooms_building FOREIGN KEY (building_id) REFERENCES buildings(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_rooms_capacity CHECK (capacity >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resource_categories (
  id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60) NOT NULL,
  kind        ENUM('lab','classroom','hall','equipment','other') NOT NULL,
  icon        VARCHAR(30) NOT NULL DEFAULT 'box',
  description VARCHAR(200) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Users -------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id       TINYINT UNSIGNED NOT NULL,
  department_id SMALLINT UNSIGNED NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  member_id     VARCHAR(30)  NOT NULL COMMENT 'Enrollment no. (student) / employee id (faculty, admin)',
  phone         VARCHAR(20)  NULL,
  status        ENUM('active','suspended') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_member_id (member_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%.__%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Resources ---------------------------------------------------
CREATE TABLE resources (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(20)  NOT NULL,
  name              VARCHAR(120) NOT NULL,
  category_id       TINYINT UNSIGNED NOT NULL,
  room_id           INT UNSIGNED NOT NULL,
  department_id     SMALLINT UNSIGNED NULL,
  capacity          SMALLINT UNSIGNED NOT NULL,
  description       TEXT NULL,
  status            ENUM('available','maintenance','retired') NOT NULL DEFAULT 'available',
  requires_approval TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resources_code (code),
  CONSTRAINT fk_resources_category FOREIGN KEY (category_id) REFERENCES resource_categories(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_resources_room FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_resources_department FOREIGN KEY (department_id) REFERENCES departments(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_resources_capacity CHECK (capacity >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE equipment (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  resource_id    INT UNSIGNED NOT NULL,
  name           VARCHAR(120) NOT NULL,
  asset_tag      VARCHAR(30)  NOT NULL,
  quantity_total SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status         ENUM('operational','under_repair','retired') NOT NULL DEFAULT 'operational',
  bookable_addon TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = can be requested together with a booking',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_equipment_asset_tag (asset_tag),
  CONSTRAINT fk_equipment_resource FOREIGN KEY (resource_id) REFERENCES resources(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_equipment_qty CHECK (quantity_total >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Timetable (recurring classes block ad-hoc bookings) ---------
CREATE TABLE academic_schedules (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  resource_id INT UNSIGNED NOT NULL,
  faculty_id  INT UNSIGNED NULL,
  course_code VARCHAR(20)  NOT NULL,
  course_name VARCHAR(120) NOT NULL,
  semester    VARCHAR(20)  NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Monday ... 6=Sunday (MySQL WEEKDAY())',
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  valid_from  DATE NOT NULL,
  valid_to    DATE NOT NULL,
  PRIMARY KEY (id),
  KEY idx_schedules_resource_day (resource_id, day_of_week, start_time),
  CONSTRAINT fk_schedules_resource FOREIGN KEY (resource_id) REFERENCES resources(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_schedules_faculty FOREIGN KEY (faculty_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_schedules_dow CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_schedules_time CHECK (end_time > start_time),
  CONSTRAINT chk_schedules_dates CHECK (valid_to >= valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Bookings ----------------------------------------------------
CREATE TABLE bookings (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_code VARCHAR(20) NOT NULL,
  resource_id  INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  start_time   DATETIME NOT NULL,
  end_time     DATETIME NOT NULL,
  purpose      VARCHAR(255) NOT NULL,
  attendees    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status       ENUM('pending','approved','rejected','cancelled','completed') NOT NULL DEFAULT 'pending',
  cancel_reason VARCHAR(255) NULL,
  cancelled_at DATETIME NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_code (booking_code),
  CONSTRAINT fk_bookings_resource FOREIGN KEY (resource_id) REFERENCES resources(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_bookings_interval CHECK (end_time > start_time),
  CONSTRAINT chk_bookings_same_day CHECK (DATE(start_time) = DATE(end_time)),
  CONSTRAINT chk_bookings_attendees CHECK (attendees >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE booking_equipment (
  booking_id   BIGINT UNSIGNED NOT NULL,
  equipment_id INT UNSIGNED NOT NULL,
  quantity     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (booking_id, equipment_id),
  CONSTRAINT fk_be_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_be_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_be_qty CHECK (quantity >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE booking_approvals (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  admin_id   INT UNSIGNED NULL COMMENT 'NULL = automatic approval by the system',
  decision   ENUM('approved','rejected','auto_approved') NOT NULL,
  remarks    VARCHAR(255) NULL,
  decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_approvals_booking (booking_id),
  CONSTRAINT fk_approvals_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_approvals_admin FOREIGN KEY (admin_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE booking_status_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  BIGINT UNSIGNED NOT NULL,
  old_status  VARCHAR(20) NULL,
  new_status  VARCHAR(20) NOT NULL,
  changed_by  INT UNSIGNED NULL,
  changed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_booking (booking_id, changed_at),
  CONSTRAINT fk_history_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Maintenance -------------------------------------------------
CREATE TABLE maintenance_requests (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  resource_id  INT UNSIGNED NOT NULL,
  reported_by  INT UNSIGNED NULL,
  assigned_to  INT UNSIGNED NULL,
  title        VARCHAR(150) NOT NULL,
  description  TEXT NULL,
  priority     ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status       ENUM('reported','open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  starts_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_end DATETIME NULL,
  resolved_at  DATETIME NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_maint_resource FOREIGN KEY (resource_id) REFERENCES resources(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_maint_reporter FOREIGN KEY (reported_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_maint_assignee FOREIGN KEY (assigned_to) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_maint_window CHECK (expected_end IS NULL OR expected_end > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Notifications ----------------------------------------------
CREATE TABLE notifications (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  type           ENUM('booking_created','booking_approved','booking_rejected','booking_cancelled',
                      'booking_completed','maintenance_update','system') NOT NULL,
  title          VARCHAR(150) NOT NULL,
  message        VARCHAR(500) NOT NULL,
  booking_id     BIGINT UNSIGNED NULL,
  maintenance_id INT UNSIGNED NULL,
  is_read        TINYINT(1) NOT NULL DEFAULT 0,
  mongo_synced   TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'outbox flag: copied to MongoDB notification history',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_notif_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_notif_maint FOREIGN KEY (maintenance_id) REFERENCES maintenance_requests(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- System ------------------------------------------------------
CREATE TABLE system_settings (
  setting_key   VARCHAR(60)  NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  description   VARCHAR(200) NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE password_reset_tokens (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL COMMENT 'SHA-256 of the emailed token; the raw token is never stored',
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token (token_hash),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE revoked_tokens (
  jti        CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jti),
  KEY idx_revoked_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
