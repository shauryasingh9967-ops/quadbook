import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarCheck, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { DayAvailability, useDayEvents } from '../../components/DayAvailability';
import { useLoad } from '../../components/hooks';
import { refreshCounts, useBase } from '../../components/bookingBits';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '../../components/ui';
import { errCode, errMsg, get, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { addDays, todayStr, ymd } from '../../lib/format';
import { useToast } from '../../lib/feedback';
import { label12, minutes, timeOptions, useHours } from '../../lib/slots';
import type { Resource, ResourceDetail } from '../../lib/types';

const schema = z.object({
  resourceId: z.coerce.number().int().positive('Choose a resource'),
  date: z.string().min(1, 'Choose a date'),
  start: z.string().min(1, 'Choose a start time'),
  end: z.string().min(1, 'Choose an end time'),
  attendees: z.coerce.number().int().min(1, 'At least 1 person').max(5000),
  purpose: z.string().trim().min(5, 'Describe the purpose (at least 5 characters)').max(255),
});
type Form = z.infer<typeof schema>;

export default function Book() {
  const { resourceId: id } = useParams(); const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast(); const base = useBase();
  const { user } = useAuth(); const h = useHours();
  const resources = useLoad(async () => (await get<Resource[]>('/resources', { limit: 100, sort: 'name' })).data, []);
  const [equip, setEquip] = useState<Record<number, number>>({});
  const [serverErr, setServerErr] = useState<{ code?: string; msg: string } | null>(null);
  const maxH = user?.role === 'faculty' ? h.maxFaculty : h.maxStudent;
  const startDate = sp.get('date') ?? todayStr();
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema) as never,
    defaultValues: { resourceId: Number(id) || 0, date: startDate, start: sp.get('start') ?? '', end: '', attendees: 1, purpose: '' },
  });
  const v = useWatch({ control });
  const loadedResources = resources.data;
  useEffect(() => { if (loadedResources && Number(id)) setValue('resourceId', Number(id)); }, [loadedResources, id, setValue]);
  const rid = Number(v.resourceId) || null;
  const detail = useLoad(async () => rid ? (await get<ResourceDetail>(`/resources/${rid}`)).data : null, [rid]);
  const day = useDayEvents(rid, v.date || todayStr());
  const opts = useMemo(() => timeOptions(h.start, h.end), [h.start, h.end]);
  const pick = v.start && v.end && minutes(v.end) > minutes(v.start) ? { start: `${v.date}T${v.start}:00`, end: `${v.date}T${v.end}:00` } : null;
  const hours = pick ? (minutes(v.end!) - minutes(v.start!)) / 60 : 0;
  const maxDate = ymd(addDays(new Date(), h.windowDays));
  const res = detail.data;

  const onSubmit = handleSubmit(async (f) => {
    setServerErr(null);
    if (minutes(f.end) <= minutes(f.start)) { setServerErr({ msg: 'The end time must be after the start time.' }); return; }
    if ((minutes(f.end) - minutes(f.start)) / 60 > maxH) { setServerErr({ msg: `Bookings can be at most ${maxH} hours for your role.` }); return; }
    if (res && f.attendees > res.capacity) { setServerErr({ msg: `This resource holds ${res.capacity} people at most. Reduce the number of attendees.` }); return; }
    try {
      const equipment = Object.entries(equip).filter(([, q]) => q > 0).map(([equipmentId, quantity]) => ({ equipmentId: Number(equipmentId), quantity }));
      const b = await post<{ id: number; status: string }>('/bookings', { resourceId: f.resourceId, startTime: `${f.date}T${f.start}`, endTime: `${f.date}T${f.end}`, purpose: f.purpose, attendees: f.attendees, equipment });
      refreshCounts();
      toast.success(b.status === 'approved' ? 'Booking confirmed' : 'Request sent. You will be notified once it is reviewed.');
      nav(`${base}/bookings/${b.id}`);
    } catch (e) { setServerErr({ code: errCode(e), msg: errMsg(e) }); day.reload(); }
  });

  if (resources.error) return <Card><ErrorState message={resources.error} onRetry={resources.reload} /></Card>;
  return (
    <div>
      <PageHeader title="Book a resource" subtitle="Check the day on the right, then pick your time." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <Field label="Resource" htmlFor="b-res" error={errors.resourceId?.message}>
              <Select id="b-res" {...register('resourceId')} invalid={!!errors.resourceId}>
                <option value={0}>Choose a resource</option>
                {resources.data?.filter((r) => r.status !== 'retired').map((r) => <option key={r.id} value={r.id}>{r.name} ({r.buildingCode} {r.roomNumber}, cap. {r.capacity})</option>)}
              </Select>
            </Field>
            <Field label="Date" htmlFor="b-date" error={errors.date?.message} hint={`Up to ${h.windowDays} days ahead`}>
              <Input id="b-date" type="date" min={todayStr()} max={maxDate} {...register('date')} invalid={!!errors.date} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" htmlFor="b-start" error={errors.start?.message}>
                <Select id="b-start" {...register('start')} invalid={!!errors.start}><option value="">Select</option>{opts.slice(0, -1).map((t) => <option key={t} value={t}>{label12(t)}</option>)}</Select>
              </Field>
              <Field label="Ends" htmlFor="b-end" error={errors.end?.message}>
                <Select id="b-end" {...register('end')} invalid={!!errors.end}><option value="">Select</option>{opts.slice(1).map((t) => <option key={t} value={t}>{label12(t)}</option>)}</Select>
              </Field>
            </div>
            {pick && <p className={hours > maxH ? 'text-sm font-medium text-bad' : 'text-sm text-muted'}>Length: {hours} h. Your limit is {maxH} h per booking.</p>}
            <Field label="Number of attendees" htmlFor="b-att" error={errors.attendees?.message} hint={res ? `Capacity ${res.capacity}` : undefined}>
              <Input id="b-att" type="number" min={1} {...register('attendees')} invalid={!!errors.attendees} />
            </Field>
            <Field label="Purpose" htmlFor="b-purpose" error={errors.purpose?.message}>
              <Textarea id="b-purpose" rows={3} maxLength={255} {...register('purpose')} invalid={!!errors.purpose} placeholder="For example: capstone review meeting" />
            </Field>

            {res && res.equipment.filter((e) => e.bookableAddon).length > 0 && (
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold">Add equipment (optional)</legend>
                <div className="space-y-2">
                  {res.equipment.filter((e) => e.bookableAddon && e.status === 'operational').map((e) => (
                    <label key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                      <span><span className="font-medium">{e.name}</span> <span className="text-muted">({e.quantityTotal} available)</span></span>
                      <Input type="number" min={0} max={e.quantityTotal} value={equip[e.id] ?? 0} aria-label={`Quantity of ${e.name}`} className="!w-20" onChange={(ev) => setEquip({ ...equip, [e.id]: Math.max(0, Math.min(e.quantityTotal, Number(ev.target.value) || 0)) })} />
                    </label>))}
                </div>
              </fieldset>)}

            {res && <p className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-primary" />{res.requiresApproval ? 'This resource needs administrator approval. Your slot is held while the request is pending.' : 'This resource confirms instantly if the slot is free.'}</p>}
            {serverErr && <div role="alert" className="rounded-lg border border-bad/40 bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-3 py-2.5 text-sm"><p className="font-semibold">{serverErr.code === 'BOOKING_CONFLICT' ? 'That slot was just taken' : 'Could not create the booking'}</p><p className="mt-0.5">{serverErr.msg}</p></div>}
            <div className="flex gap-3"><Button type="submit" loading={isSubmitting}><CalendarCheck className="size-4" />{res?.requiresApproval ? 'Send request' : 'Confirm booking'}</Button><Link to={`${base}/resources`}><Button type="button" variant="ghost">Cancel</Button></Link></div>
          </form>
        </Card>
        <Card className="h-fit p-6">
          <h2 className="mb-4 text-xl">{res ? res.name : 'Availability'} on {v.date ? new Date(v.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'the chosen day'}</h2>
          {!rid ? <p className="text-sm text-muted">Choose a resource to see when it is free.</p> : <DayAvailability events={day.data} loading={day.loading} pick={pick} />}
          {detail.loading && !res && rid && <Skeleton className="mt-4 h-10" />}
        </Card>
      </div>
    </div>
  );
}
