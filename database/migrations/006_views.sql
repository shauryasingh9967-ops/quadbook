-- =====================================================================
-- QuadBook  |  Migration 006  |  Views (analytics + read models)
-- =====================================================================

CREATE VIEW v_booking_details AS
SELECT b.id, b.booking_code, b.status, b.start_time, b.end_time, b.purpose, b.attendees,
       b.cancel_reason, b.cancelled_at, b.created_at, b.updated_at,
       fn_booking_hours(b.start_time, b.end_time) AS hours,
       u.id AS user_id, u.full_name AS user_name, u.email AS user_email, rl.name AS user_role,
       d.name AS department_name,
       r.id AS resource_id, r.code AS resource_code, r.name AS resource_name,
       c.name AS category_name, c.kind AS category_kind,
       rm.room_number, bl.name AS building_name, bl.code AS building_code,
       ap.decision, ap.remarks AS decision_remarks, ap.decided_at, adm.full_name AS decided_by_name
  FROM bookings b
  JOIN users u               ON u.id = b.user_id
  JOIN roles rl              ON rl.id = u.role_id
  LEFT JOIN departments d    ON d.id = u.department_id
  JOIN resources r           ON r.id = b.resource_id
  JOIN resource_categories c ON c.id = r.category_id
  JOIN rooms rm              ON rm.id = r.room_id
  JOIN buildings bl          ON bl.id = rm.building_id
  LEFT JOIN booking_approvals ap ON ap.booking_id = b.id
  LEFT JOIN users adm        ON adm.id = ap.admin_id;

CREATE VIEW v_resource_catalog AS
SELECT r.id, r.code, r.name, r.description, r.capacity, r.status, r.requires_approval,
       c.id AS category_id, c.name AS category_name, c.kind AS category_kind, c.icon AS category_icon,
       rm.id AS room_id, rm.room_number, rm.floor_no,
       bl.id AS building_id, bl.name AS building_name, bl.code AS building_code,
       d.id AS department_id, d.name AS department_name,
       (SELECT COUNT(*) FROM equipment e WHERE e.resource_id = r.id AND e.status <> 'retired') AS equipment_count,
       (SELECT COUNT(*) FROM bookings b WHERE b.resource_id = r.id AND b.status IN ('pending','approved')
                                          AND b.start_time >= NOW()) AS upcoming_bookings,
       r.created_at
  FROM resources r
  JOIN resource_categories c ON c.id = r.category_id
  JOIN rooms rm              ON rm.id = r.room_id
  JOIN buildings bl          ON bl.id = rm.building_id
  LEFT JOIN departments d    ON d.id = r.department_id;

CREATE VIEW v_monthly_booking_trends AS
SELECT DATE_FORMAT(start_time, '%Y-%m') AS month_key,
       COUNT(*) AS total,
       SUM(status IN ('approved','completed')) AS approved,
       SUM(status = 'rejected')  AS rejected,
       SUM(status = 'cancelled') AS cancelled,
       SUM(status = 'pending')   AS pending
  FROM bookings
 GROUP BY DATE_FORMAT(start_time, '%Y-%m');

-- Window function: RANK() over booking counts
CREATE VIEW v_popular_resources AS
WITH usage_stats AS (
  SELECT r.id, r.code, r.name, c.name AS category_name,
         COUNT(b.id) AS total_bookings,
         COALESCE(SUM(fn_booking_hours(b.start_time, b.end_time)), 0) AS total_hours
    FROM resources r
    JOIN resource_categories c ON c.id = r.category_id
    LEFT JOIN bookings b ON b.resource_id = r.id AND b.status IN ('approved','completed')
   GROUP BY r.id, r.code, r.name, c.name
)
SELECT id, code, name, category_name, total_bookings, total_hours,
       RANK() OVER (ORDER BY total_bookings DESC) AS popularity_rank
  FROM usage_stats;

CREATE VIEW v_user_booking_stats AS
SELECT u.id AS user_id, u.full_name, rl.name AS role_name,
       COUNT(b.id) AS total_bookings,
       SUM(b.status = 'pending')   AS pending,
       SUM(b.status = 'approved')  AS approved,
       SUM(b.status = 'completed') AS completed,
       SUM(b.status = 'rejected')  AS rejected,
       SUM(b.status = 'cancelled') AS cancelled
  FROM users u
  JOIN roles rl ON rl.id = u.role_id
  LEFT JOIN bookings b ON b.user_id = u.id
 GROUP BY u.id, u.full_name, rl.name;
