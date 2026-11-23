import { Schema, model } from 'mongoose';

/** Every notable user action (login, create resource, export report ...). Append-only. */
const activityLogSchema = new Schema(
  {
    userId: { type: Number, index: true },
    userEmail: String,
    userName: String,
    role: String,
    action: { type: String, required: true, index: true },        // e.g. "auth.login"
    category: { type: String, required: true, index: true },      // auth | booking | resource | user | maintenance | system
    description: String,
    entityType: String,
    entityId: String,
    metadata: Schema.Types.Mixed,
    success: { type: Boolean, default: true },
    ip: String,
    userAgent: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: 'activity_logs' },
);
activityLogSchema.index({ category: 1, createdAt: -1 });

export const ActivityLog = model('ActivityLog', activityLogSchema);
