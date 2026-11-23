import { Database, Save, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLoad } from '../../components/hooks';
import { Badge, Button, Card, ErrorState, Field, Input, PageHeader, Skeleton, Toggle } from '../../components/ui';
import { errMsg, get, put } from '../../lib/api';
import { useToast } from '../../lib/feedback';
import { invalidateHours } from '../../lib/slots';

interface Setting { key: string; value: string; description: string }
interface Health { status: string; uptimeSeconds: number; mysql: { role: string; connected: boolean }; mongodb: { role: string; connected: boolean } }
const LABEL: Record<string, string> = { max_hours_student: 'Student booking limit (hours)', max_hours_faculty: 'Faculty booking limit (hours)', booking_window_days: 'Booking window (days ahead)', day_start_hour: 'Opening hour (0 to 23)', day_end_hour: 'Closing hour (1 to 24)', institution_name: 'Institution name', support_email: 'Support email' };
const NUM = new Set(['max_hours_student', 'max_hours_faculty', 'booking_window_days', 'day_start_hour', 'day_end_hour']);

export default function SettingsPage() {
  const toast = useToast();
  const s = useLoad(async () => (await get<Setting[]>('/admin/settings')).data, []);
  const hl = useLoad(async () => (await get<Health>('/admin/health')).data, []);
  const [v, setV] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => { if (s.data) setV(Object.fromEntries(s.data.map((x) => [x.key, x.value]))); }, [s.data]);
  const save = async () => {
    const e: Record<string, string> = {};
    for (const k of NUM) if (v[k] !== undefined && !/^\d+$/.test(v[k])) e[k] = 'Enter a whole number';
    if (!e.day_start_hour && !e.day_end_hour && Number(v.day_end_hour) <= Number(v.day_start_hour)) e.day_end_hour = 'Must be later than the opening hour';
    if (v.support_email && !/^\S+@\S+\.\S+$/.test(v.support_email)) e.support_email = 'Enter a valid email';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { await put('/admin/settings', v); invalidateHours(); toast.success('Settings saved'); s.reload(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  if (s.error) return <Card><ErrorState message={s.error} onRetry={s.reload} /></Card>;
  const hd = (x: Health['mysql'] | undefined) => x ? <Badge tone={x.connected ? 'ok' : 'bad'}>{x.connected ? 'Connected' : 'Offline'}</Badge> : <Skeleton className="h-5 w-20" />;
  return (
    <div>
      <PageHeader title="System settings" subtitle="Booking rules and campus details. Changes apply to new bookings immediately." actions={<Button loading={busy} onClick={save}><Save className="size-4" />Save settings</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          {!s.data ? <Skeleton className="h-72" /> : (
            <div className="grid gap-5 sm:grid-cols-2">
              {s.data.filter((x) => x.key !== 'allow_registration').map((x) => (
                <Field key={x.key} label={LABEL[x.key] ?? x.key} htmlFor={x.key} error={errs[x.key]} hint={errs[x.key] ? undefined : x.description}>
                  <Input id={x.key} value={v[x.key] ?? ''} inputMode={NUM.has(x.key) ? 'numeric' : undefined} onChange={(e) => setV({ ...v, [x.key]: e.target.value })} invalid={!!errs[x.key]} /></Field>))}
              <div className="sm:col-span-2"><Toggle checked={v.allow_registration === '1'} onChange={(c) => setV({ ...v, allow_registration: c ? '1' : '0' })} label="Allow public self-registration" /></div>
            </div>)}
        </Card>
        <Card className="h-fit p-6">
          <h2 className="mb-4 text-xl">System health</h2>
          <ul className="space-y-4 text-sm">
            <li className="flex items-start gap-3"><Database className="mt-0.5 size-5 text-primary" /><div className="flex-1"><p className="font-semibold">MySQL</p><p className="text-muted">{hl.data?.mysql.role ?? 'Primary database'}</p></div>{hd(hl.data?.mysql)}</li>
            <li className="flex items-start gap-3"><Server className="mt-0.5 size-5 text-primary" /><div className="flex-1"><p className="font-semibold">MongoDB</p><p className="text-muted">{hl.data?.mongodb.role ?? 'Audit and activity logs'}</p></div>{hd(hl.data?.mongodb)}</li>
          </ul>
          {hl.data && <p className="mt-5 text-xs text-muted">API uptime {Math.floor(hl.data.uptimeSeconds / 60)} min</p>}
          <Button variant="secondary" size="sm" className="mt-4" onClick={hl.reload}>Refresh</Button>
        </Card>
      </div>
    </div>
  );
}
