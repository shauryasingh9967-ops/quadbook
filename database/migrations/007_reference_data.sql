-- =====================================================================
-- QuadBook  |  Migration 007  |  Mandatory reference data
-- (roles + default system settings; safe to re-run thanks to IGNORE)
-- =====================================================================

INSERT IGNORE INTO roles (id, name, description) VALUES
  (1, 'admin',   'Campus administrator: manages users, resources, approvals, maintenance and reports'),
  (2, 'faculty', 'Faculty member: books labs, classrooms and halls for teaching and research'),
  (3, 'student', 'Student: requests labs, classrooms and equipment for projects and study groups');

INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
  ('max_hours_student',   '3',  'Maximum booking length (hours) for students'),
  ('max_hours_faculty',   '6',  'Maximum booking length (hours) for faculty'),
  ('booking_window_days', '30', 'How many days ahead a booking can be made'),
  ('day_start_hour',      '8',  'Campus opening hour (24h clock)'),
  ('day_end_hour',        '20', 'Campus closing hour (24h clock)'),
  ('allow_registration',  '1',  '1 = public self-registration enabled, 0 = disabled'),
  ('institution_name',    'K.R. Mangalam University', 'Name displayed in the interface'),
  ('support_email',       'support@krmangalam.edu.in', 'Contact address shown to users');
