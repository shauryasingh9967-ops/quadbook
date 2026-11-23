import { Schema, model } from 'mongoose';

/** Permanent archive of every notification generated in MySQL (copied by the outbox sync). */
const notificationHistorySchema = new Schema(
  {
    mysqlId: { type: Number, required: true, unique: true },
    userId: { type: Number, required: true, index: true },
    type: String,
    title: String,
    message: String,
    bookingId: Number,
    maintenanceId: Number,
    channel: { type: String, default: 'in-app' },
    createdAtSource: { type: Date, index: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'notification_history' },
);

export const NotificationHistory = model('NotificationHistory', notificationHistorySchema);
