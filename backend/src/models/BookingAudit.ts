import { Schema, model } from 'mongoose';

/** Immutable lifecycle events for every booking, with a snapshot of the data at that moment. */
const bookingAuditSchema = new Schema(
  {
    bookingId: { type: Number, index: true },
    bookingCode: String,
    event: {
      type: String, required: true, index: true,
      enum: ['created', 'updated', 'approved', 'rejected', 'cancelled', 'conflict_blocked', 'auto_cancelled'],
    },
    actorId: Number,
    actorName: String,
    actorRole: String,
    resourceId: Number,
    resourceName: String,
    snapshot: Schema.Types.Mixed,
    note: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: 'booking_audit' },
);

export const BookingAudit = model('BookingAudit', bookingAuditSchema);
