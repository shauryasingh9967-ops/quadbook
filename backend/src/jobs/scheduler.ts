import { runHousekeeping } from '../services/bookingService';
import { syncNotificationHistory } from '../services/notificationService';
import { logger } from '../utils/logger';

const timers: NodeJS.Timeout[] = [];

export function startJobs() {
  const hk = async () => {
    try {
      const r = await runHousekeeping();
      if (r.completed_bookings || r.expired_bookings) logger.info(`Housekeeping: ${r.completed_bookings} completed, ${r.expired_bookings} expired`);
      await syncNotificationHistory();
    } catch (e) { logger.warn(`Housekeeping failed: ${(e as Error).message}`); }
  };
  void hk();
  timers.push(setInterval(hk, 60_000));
  timers.push(setInterval(() => { void syncNotificationHistory(); }, 15_000));
  timers.forEach((t) => t.unref());
}
export const stopJobs = () => timers.forEach(clearInterval);
