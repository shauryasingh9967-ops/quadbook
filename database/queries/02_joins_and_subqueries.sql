-- =====================================================================
-- QuadBook | Demo 02 | Joins and subqueries
-- =====================================================================

-- 1. INNER JOIN (5 tables): booking with requester, resource and location
SELECT b.booking_code, u.full_name, r.name AS resource, bl.name AS building, b.start_time, b.status
  FROM bookings b
  JOIN users u      ON u.id = b.user_id
  JOIN resources r  ON r.id = b.resource_id
  JOIN rooms rm     ON rm.id = r.room_id
  JOIN buildings bl ON bl.id = rm.building_id
 ORDER BY b.start_time DESC LIMIT 10;

-- 2. LEFT JOIN: resources that were never booked
SELECT r.code, r.name
  FROM resources r LEFT JOIN bookings b ON b.resource_id = r.id
 WHERE b.id IS NULL;

-- 3. LEFT JOIN + aggregate: every department with its number of users (including zero)
SELECT d.name, COUNT(u.id) AS users
  FROM departments d LEFT JOIN users u ON u.department_id = d.id
 GROUP BY d.id, d.name ORDER BY users DESC;

-- 4. SELF JOIN: pairs of bookings on the same resource that start on the same day (never overlapping)
SELECT a.booking_code AS first_booking, c.booking_code AS second_booking, a.resource_id, DATE(a.start_time) AS day
  FROM bookings a
  JOIN bookings c ON c.resource_id = a.resource_id AND DATE(c.start_time) = DATE(a.start_time) AND c.id > a.id
 WHERE a.status IN ('approved','pending') AND c.status IN ('approved','pending')
 LIMIT 10;

-- 5. Proof that no two active bookings overlap (must return 0 rows)
SELECT a.id, c.id
  FROM bookings a JOIN bookings c
    ON c.resource_id = a.resource_id AND c.id > a.id AND a.start_time < c.end_time AND a.end_time > c.start_time
 WHERE a.status IN ('pending','approved') AND c.status IN ('pending','approved');

-- 6. Scalar subquery: bookings longer than the average booking
SELECT booking_code, TIMESTAMPDIFF(MINUTE, start_time, end_time) AS minutes
  FROM bookings
 WHERE TIMESTAMPDIFF(MINUTE, start_time, end_time) >
       (SELECT AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) FROM bookings)
 LIMIT 10;

-- 7. IN subquery: users who have at least one rejected booking
SELECT full_name, email FROM users
 WHERE id IN (SELECT user_id FROM bookings WHERE status = 'rejected') LIMIT 10;

-- 8. NOT EXISTS: faculty who never booked anything
SELECT u.full_name FROM users u JOIN roles r ON r.id = u.role_id
 WHERE r.name = 'faculty' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = u.id);

-- 9. Correlated subquery: each resource's latest booking
SELECT r.name,
       (SELECT MAX(b.start_time) FROM bookings b WHERE b.resource_id = r.id AND b.status IN ('approved','completed')) AS last_booked
  FROM resources r ORDER BY last_booked DESC LIMIT 10;

-- 10. Derived table: busiest hour of day
SELECT hr, bookings FROM (
  SELECT HOUR(start_time) AS hr, COUNT(*) AS bookings FROM bookings GROUP BY HOUR(start_time)
) t ORDER BY bookings DESC LIMIT 3;

-- 11. Full-text search on the resource catalogue
SELECT name, MATCH(name, description) AGAINST('laboratory computers' IN NATURAL LANGUAGE MODE) AS score
  FROM resources WHERE MATCH(name, description) AGAINST('laboratory computers' IN NATURAL LANGUAGE MODE)
 ORDER BY score DESC LIMIT 5;
