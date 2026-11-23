-- =====================================================================
-- QuadBook  |  Migration 002  |  Secondary indexes
-- Each index is justified by a concrete query in the application.
-- =====================================================================

-- Overlap detection: WHERE resource_id = ? AND start_time < ? AND end_time > ?
CREATE INDEX idx_bookings_resource_time ON bookings (resource_id, start_time, end_time);

-- "My bookings" screens: WHERE user_id = ? [AND status = ?] ORDER BY start_time DESC
CREATE INDEX idx_bookings_user_status ON bookings (user_id, status, start_time);

-- Admin approval queue + monthly analytics: WHERE status = ? ORDER BY start_time
CREATE INDEX idx_bookings_status_start ON bookings (status, start_time);

-- Notification bell: WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC
CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read, created_at);

-- Outbox sweep to MongoDB: WHERE mongo_synced = 0
CREATE INDEX idx_notifications_outbox ON notifications (mongo_synced, id);

-- Catalogue filters: WHERE category_id = ? AND status = ?
CREATE INDEX idx_resources_category_status ON resources (category_id, status);

-- Maintenance window lookup inside fn_slot_conflict()
CREATE INDEX idx_maintenance_resource_status ON maintenance_requests (resource_id, status, starts_at);

-- Admin user directory: WHERE role_id = ? AND status = ?
CREATE INDEX idx_users_role_status ON users (role_id, status);

-- Text search on the catalogue
CREATE FULLTEXT INDEX ftx_resources_search ON resources (name, description);
