-- =====================================================================
-- QuadBook | Demo 03 | Aggregates, GROUP BY/HAVING, views, CTEs, window functions
-- =====================================================================

-- 1. Aggregates + GROUP BY: bookings and hours per category
SELECT c.name AS category, COUNT(*) AS bookings, ROUND(SUM(fn_booking_hours(b.start_time, b.end_time)), 1) AS hours
  FROM bookings b JOIN resources r ON r.id = b.resource_id JOIN resource_categories c ON c.id = r.category_id
 WHERE b.status IN ('approved','completed')
 GROUP BY c.name ORDER BY bookings DESC;

-- 2. HAVING: users with 15+ bookings
SELECT u.full_name, COUNT(*) AS bookings
  FROM bookings b JOIN users u ON u.id = b.user_id
 GROUP BY u.id, u.full_name HAVING COUNT(*) >= 15 ORDER BY bookings DESC;

-- 3. Conditional aggregation: approval rate by resource
SELECT r.name, COUNT(*) AS decided,
       ROUND(100 * SUM(b.status IN ('approved','completed')) / COUNT(*), 1) AS approval_pct
  FROM bookings b JOIN resources r ON r.id = b.resource_id
 WHERE b.status IN ('approved','completed','rejected')
 GROUP BY r.id, r.name HAVING COUNT(*) >= 10 ORDER BY approval_pct;

-- 4. Views (defined in migration 006)
SELECT * FROM v_booking_details ORDER BY start_time DESC LIMIT 5;
SELECT * FROM v_popular_resources WHERE popularity_rank <= 5 ORDER BY popularity_rank;
SELECT * FROM v_monthly_booking_trends ORDER BY month_key;
SELECT * FROM v_user_booking_stats ORDER BY total_bookings DESC LIMIT 5;
SELECT category_name, COUNT(*) AS resources, SUM(equipment_count) AS equipment FROM v_resource_catalog GROUP BY category_name;

-- 5. CTE: department booking share
WITH dept_bookings AS (
  SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*) AS bookings
    FROM bookings b JOIN users u ON u.id = b.user_id LEFT JOIN departments d ON d.id = u.department_id
   WHERE b.status IN ('approved','completed') GROUP BY d.name
)
SELECT department, bookings, ROUND(100 * bookings / SUM(bookings) OVER (), 1) AS share_pct
  FROM dept_bookings ORDER BY bookings DESC;

-- 6. Recursive CTE: calendar of the last 14 days with booking counts (gaps shown as 0)
WITH RECURSIVE days AS (
  SELECT CURDATE() - INTERVAL 13 DAY AS d
  UNION ALL SELECT d + INTERVAL 1 DAY FROM days WHERE d < CURDATE()
)
SELECT days.d, DAYNAME(days.d) AS weekday, COUNT(b.id) AS bookings
  FROM days LEFT JOIN bookings b ON DATE(b.start_time) = days.d AND b.status IN ('approved','completed')
 GROUP BY days.d ORDER BY days.d;

-- 7. Window: RANK + DENSE_RANK of resources by hours within their category
SELECT category, name, hours,
       RANK()       OVER (PARTITION BY category ORDER BY hours DESC) AS rank_in_category,
       DENSE_RANK() OVER (ORDER BY hours DESC)                       AS overall_dense_rank
  FROM (
    SELECT c.name AS category, r.name, COALESCE(SUM(fn_booking_hours(b.start_time, b.end_time)), 0) AS hours
      FROM resources r JOIN resource_categories c ON c.id = r.category_id
      LEFT JOIN bookings b ON b.resource_id = r.id AND b.status IN ('approved','completed')
     GROUP BY c.name, r.id, r.name) x
 ORDER BY category, rank_in_category LIMIT 15;

-- 8. Window: running total and month-over-month change
SELECT month_key, total,
       SUM(total) OVER (ORDER BY month_key)                  AS running_total,
       total - LAG(total) OVER (ORDER BY month_key)          AS change_vs_prev_month
  FROM v_monthly_booking_trends ORDER BY month_key;

-- 9. Window: previous booking of the same user (LAG) to find the gap between requests
SELECT user_id, booking_code, start_time,
       LAG(start_time) OVER (PARTITION BY user_id ORDER BY start_time) AS previous_start,
       ROW_NUMBER()    OVER (PARTITION BY user_id ORDER BY start_time) AS nth_booking
  FROM bookings WHERE user_id IN (SELECT MIN(id) FROM users WHERE role_id = 3) ORDER BY start_time LIMIT 10;

-- 10. NTILE: split resources into usage quartiles
SELECT name, total_bookings, NTILE(4) OVER (ORDER BY total_bookings DESC) AS usage_quartile FROM v_popular_resources;
