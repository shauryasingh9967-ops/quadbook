import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../../components/hooks';
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, Table, Tabs, Td, Textarea } from '../../components/ui';
import { del, errMsg, get, patch, post } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useConfirm, useToast } from '../../lib/feedback';
import type { Maintenance, Resource } from '../../lib/types';

const blank = { resourceId: '', title: '', description: '', priority: 'medium', status: 'open', startsAt: '', expectedEnd: '', assignedTo: '' };
const nowLocal = () => { const d = new Date(); d.setMinutes(0, 0, 0); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; };

export default function MaintenanceAdmin() {
  const toast = useToast(); const confirm = useConfirm();
  const [tab, setTab] = useState('all'); const [q, setQ] = useState(''); const [prio, setPrio] = useState(''); const [page, setPage] = useState(1);
  const resources = useLoad(async () => (await get<Resource[]>('/resources', { limit: 100, sort: 'name' })).data, []);
  const staff = useLoad(async () => (await get<Array<{ id: number; fullName: string }>>('/maintenance/staff')).data, []);
  const { data, loading, error, reload } = useLoad(() => get<Maintenance[]>('/maintenance', { status: tab === 'all' ? undefined : tab, priority: prio || undefined, q: q || undefined, page, limit: 10 }), [tab, prio, q, page]);
  const [edit, setEdit] = useState<{ id: number | null } | null>(null); const [f, setF] = useState(blank); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof blank>) => setF((s) => ({ ...s, ...p }));
  const open = (m?: Maintenance) => { setErrs({}); setF(m ? { resourceId: String(m.resourceId), title: m.title, description: m.description ?? '', priority: m.priority, status: m.status, startsAt: m.startsAt.slice(0, 16), expectedEnd: m.expectedEnd?.slice(0, 16) ?? '', assignedTo: m.assignedTo ? String(m.assignedTo) : '' } : { ...blank, startsAt: nowLocal() }); setEdit({ id: m?.id ?? null }); };
  const save = async () => {
    const er: Record<string, string> = {};
    if (edit!.id === null && !f.resourceId) er.resourceId = 'Choose a resource'; if (f.title.trim().length < 3) er.title = 'At least 3 characters';
    if (f.expectedEnd && f.startsAt && f.expectedEnd <= f.startsAt) er.expectedEnd = 'Must be after the start';
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true);
    const body = { title: f.title.trim(), description: f.description.trim() || null, priority: f.priority, status: f.status, startsAt: f.startsAt || undefined, expectedEnd: f.expectedEnd || null, assignedTo: f.assignedTo ? Number(f.assignedTo) : null };
    try {
      if (edit!.id === null) { const r = await post<{ cancelledBookings?: number }>('/maintenance', { ...body, resourceId: Number(f.resourceId) }); toast.success(r?.cancelledBookings ? `Scheduled. ${r.cancelledBookings} overlapping booking(s) were cancelled and the users notified.` : 'Maintenance scheduled'); }
      else { const r = await patch<{ cancelledBookings?: number }>(`/maintenance/${edit!.id}`, body); toast.success(r?.cancelledBookings ? `Saved. ${r.cancelledBookings} overlapping booking(s) were cancelled.` : 'Changes saved'); }
      setEdit(null); reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const quick = async (m: Maintenance, status: string) => { try { await patch(`/maintenance/${m.id}`, { status }); toast.success(status === 'resolved' ? 'Marked as resolved. The resource is open for booking again.' : 'Status updated'); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const remove = async (m: Maintenance) => {
    if (!(await confirm({ title: 'Delete this record?', message: `"${m.title}" will be removed.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try { await del(`/maintenance/${m.id}`); toast.success('Record deleted'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const rows = data?.data ?? []; const meta = data?.meta;
  return (
    <div>
      <PageHeader title="Maintenance" subtitle="An open or in-progress job blocks bookings in its window and cancels overlapping ones." actions={<Button onClick={() => open()}><Plus className="size-4" />Schedule maintenance</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'all', label: 'All' }, { value: 'reported', label: 'Reported' }, { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'resolved', label: 'Resolved' }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search title or resource" className="min-w-[200px] flex-1" />
        <Select aria-label="Priority" value={prio} onChange={(e) => { setPrio(e.target.value); setPage(1); }} className="!w-auto"><option value="">Any priority</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
      </div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> : rows.length === 0 ? <EmptyState icon={<Wrench className="size-6" />} title="No maintenance records" body="Reports from students and faculty appear here." /> : (
          <Table head={['Issue', 'Window', 'Priority', 'Status', 'Assigned', <span key="a" className="sr-only">Actions</span>]}>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <Td><p className="font-semibold">{m.title}</p><p className="text-xs text-muted">{m.resourceName}{m.reportedByName ? ` · reported by ${m.reportedByName}` : ''}</p></Td>
                <Td className="text-[13px] text-muted">{fmtDateTime(m.startsAt)}<br />{m.expectedEnd ? `to ${fmtDateTime(m.expectedEnd)}` : 'no end date'}</Td>
                <Td><StatusBadge status={m.priority} /></Td><Td><StatusBadge status={m.status} /></Td><Td className="text-muted">{m.assignedToName ?? 'Unassigned'}</Td>
                <Td><div className="flex justify-end gap-1">
                  {m.status === 'reported' && <Button size="sm" variant="secondary" onClick={() => quick(m, 'open')}>Start job</Button>}
                  {['open', 'in_progress'].includes(m.status) && <Button size="sm" variant="secondary" onClick={() => quick(m, 'resolved')}>Resolve</Button>}
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => open(m)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(m)}><Trash2 className="size-4 text-bad" /></Button></div></Td>
              </tr>))}
          </Table>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? 'Schedule maintenance' : 'Edit maintenance'} size="lg" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>{edit?.id === null ? 'Schedule' : 'Save changes'}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {edit?.id === null && <div className="sm:col-span-2"><Field label="Resource" htmlFor="m-res" error={errs.resourceId}><Select id="m-res" value={f.resourceId} onChange={(e) => set({ resourceId: e.target.value })} invalid={!!errs.resourceId}><option value="">Choose a resource</option>{resources.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field></div>}
          <div className="sm:col-span-2"><Field label="Title" htmlFor="m-title" error={errs.title}><Input id="m-title" value={f.title} onChange={(e) => set({ title: e.target.value })} invalid={!!errs.title} /></Field></div>
          <Field label="Starts" htmlFor="m-start"><Input id="m-start" type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
          <Field label="Expected end" htmlFor="m-end" error={errs.expectedEnd} hint="Leave empty if unknown"><Input id="m-end" type="datetime-local" value={f.expectedEnd} onChange={(e) => set({ expectedEnd: e.target.value })} invalid={!!errs.expectedEnd} /></Field>
          <Field label="Priority" htmlFor="m-prio"><Select id="m-prio" value={f.priority} onChange={(e) => set({ priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></Select></Field>
          <Field label="Status" htmlFor="m-status"><Select id="m-status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="reported">Reported</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select></Field>
          <div className="sm:col-span-2"><Field label="Assigned to" htmlFor="m-asg"><Select id="m-asg" value={f.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })}><option value="">Unassigned</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></Field></div>
          <div className="sm:col-span-2"><Field label="Details" htmlFor="m-desc"><Textarea id="m-desc" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field></div>
        </div>
      </Modal>
    </div>
  );
}
