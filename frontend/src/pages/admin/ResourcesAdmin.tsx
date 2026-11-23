import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLoad } from '../../components/hooks';
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, Table, Td, Textarea, Toggle } from '../../components/ui';
import { del, errMsg, get, post, put } from '../../lib/api';
import { useConfirm, useToast } from '../../lib/feedback';
import type { Lookups, Resource, ResourceDetail } from '../../lib/types';

const blank = { code: '', name: '', categoryId: '', buildingId: '', roomNumber: '', floorNo: '0', departmentId: '', capacity: '30', description: '', status: 'available', requiresApproval: true };
type Form = typeof blank;

export default function ResourcesAdmin({ mode }: { mode: 'all' | 'lab' | 'room' }) {
  const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [kind, setKind] = useState(mode === 'lab' ? 'lab' : mode === 'room' ? 'classroom' : ''); const [page, setPage] = useState(1);
  const lookups = useLoad(async () => (await get<Lookups>('/resources/lookups')).data, []);
  const k = mode === 'lab' ? 'lab' : mode === 'room' ? 'classroom' : kind;
  const { data, loading, error, reload } = useLoad(() => get<Resource[]>('/resources', { q: q || undefined, status: status || undefined, kind: k || undefined, page, limit: 10, sort: 'name' }), [q, status, k, page, mode]);
  const [edit, setEdit] = useState<{ id: number | null } | null>(null); const [f, setF] = useState<Form>(blank); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const title = mode === 'lab' ? 'Labs' : mode === 'room' ? 'Classrooms' : 'All resources';
  const noun = mode === 'lab' ? 'lab' : mode === 'room' ? 'classroom' : 'resource';

  const open = async (id: number | null) => {
    setErrs({});
    if (id === null) {
      const cat = lookups.data?.categories.find((c) => c.kind === (mode === 'lab' ? 'lab' : mode === 'room' ? 'classroom' : kind || 'lab'));
      setF({ ...blank, categoryId: cat ? String(cat.id) : '' }); setEdit({ id });
      return;
    }
    try {
      const r = (await get<ResourceDetail>(`/resources/${id}`)).data;
      setF({ code: r.code, name: r.name, categoryId: String(r.categoryId), buildingId: String(r.buildingId), roomNumber: r.roomNumber, floorNo: String(r.floorNo), departmentId: r.departmentId ? String(r.departmentId) : '', capacity: String(r.capacity), description: r.description ?? '', status: r.status, requiresApproval: r.requiresApproval });
      setEdit({ id });
    } catch (e) { toast.error(errMsg(e)); }
  };
  const validate = () => {
    const e: Record<string, string> = {};
    if (f.code.trim().length < 2) e.code = 'At least 2 characters';
    if (f.name.trim().length < 3) e.name = 'At least 3 characters';
    if (!f.categoryId) e.categoryId = 'Choose a category';
    if (!f.buildingId) e.buildingId = 'Choose a building';
    if (!f.roomNumber.trim()) e.roomNumber = 'Required';
    if (!(Number(f.capacity) >= 1)) e.capacity = 'Enter a capacity of 1 or more';
    setErrs(e); return Object.keys(e).length === 0;
  };
  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    const body = { code: f.code.trim(), name: f.name.trim(), categoryId: Number(f.categoryId), buildingId: Number(f.buildingId), roomNumber: f.roomNumber.trim(), floorNo: Number(f.floorNo) || 0, departmentId: f.departmentId ? Number(f.departmentId) : null, capacity: Number(f.capacity), description: f.description.trim() || null, status: f.status, requiresApproval: f.requiresApproval };
    try { if (edit!.id === null) await post('/resources', body); else await put(`/resources/${edit!.id}`, body); toast.success(edit!.id === null ? `${title === 'All resources' ? 'Resource' : noun} created` : 'Changes saved'); setEdit(null); reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async (r: Resource) => {
    if (!(await confirm({ title: `Remove ${r.name}?`, message: 'If it has booking history it will be retired instead of deleted, so past records stay intact.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    try { const res = await del<{ retired: boolean }>(`/resources/${r.id}`); toast.success(res.retired ? 'Retired. It has booking history, so it was kept.' : 'Resource deleted'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const set = (p: Partial<Form>) => setF((s) => ({ ...s, ...p }));
  const cats = lookups.data?.categories.filter((c) => (mode === 'lab' ? c.kind === 'lab' : mode === 'room' ? c.kind === 'classroom' : true)) ?? [];
  const rows = data?.data ?? []; const meta = data?.meta;

  return (
    <div>
      <PageHeader title={title} subtitle="Create, edit and retire bookable spaces." actions={<Button onClick={() => open(null)}><Plus className="size-4" />Add {noun}</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by name or code" className="min-w-[220px] flex-1" />
        {mode === 'all' && <Select aria-label="Type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="!w-auto"><option value="">All types</option><option value="lab">Labs</option><option value="classroom">Classrooms</option><option value="hall">Halls</option><option value="equipment">Equipment</option></Select>}
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto"><option value="">Any status</option><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></Select>
      </div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : rows.length === 0 ? <EmptyState title="No resources found" body="Change the filters or add a new one." /> : (
          <Table head={['Name', 'Location', 'Capacity', 'Approval', 'Status', <span key="a" className="sr-only">Actions</span>]}>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <Td><Link to={`/admin/resources/${r.id}`} className="font-semibold hover:text-primary hover:underline">{r.name}</Link><p className="text-xs text-muted">{r.code} · {r.categoryName}</p></Td>
                <Td className="text-muted">{r.buildingName}, {r.roomNumber}</Td>
                <Td className="tabular-nums">{r.capacity}</Td>
                <Td className="text-muted">{r.requiresApproval ? 'Required' : 'Instant'}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => open(r.id)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => remove(r)}><Trash2 className="size-4 text-bad" /></Button></div></Td>
              </tr>))}
          </Table>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? `Add ${noun}` : `Edit ${noun}`} size="lg" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>{edit?.id === null ? `Create ${noun}` : 'Save changes'}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="r-name" error={errs.name}><Input id="r-name" value={f.name} onChange={(e) => set({ name: e.target.value })} invalid={!!errs.name} /></Field>
          <Field label="Code" htmlFor="r-code" error={errs.code}><Input id="r-code" value={f.code} onChange={(e) => set({ code: e.target.value })} invalid={!!errs.code} placeholder="CS-LAB-04" /></Field>
          <Field label="Category" htmlFor="r-cat" error={errs.categoryId}><Select id="r-cat" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} invalid={!!errs.categoryId}><option value="">Choose</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Department" htmlFor="r-dept"><Select id="r-dept" value={f.departmentId} onChange={(e) => set({ departmentId: e.target.value })}><option value="">None</option>{lookups.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Building" htmlFor="r-bld" error={errs.buildingId}><Select id="r-bld" value={f.buildingId} onChange={(e) => set({ buildingId: e.target.value })} invalid={!!errs.buildingId}><option value="">Choose</option>{lookups.data?.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Room" htmlFor="r-room" error={errs.roomNumber}><Input id="r-room" value={f.roomNumber} onChange={(e) => set({ roomNumber: e.target.value })} invalid={!!errs.roomNumber} /></Field><Field label="Floor" htmlFor="r-floor"><Input id="r-floor" type="number" min={0} value={f.floorNo} onChange={(e) => set({ floorNo: e.target.value })} /></Field></div>
          <Field label="Capacity" htmlFor="r-cap" error={errs.capacity}><Input id="r-cap" type="number" min={1} value={f.capacity} onChange={(e) => set({ capacity: e.target.value })} invalid={!!errs.capacity} /></Field>
          <Field label="Status" htmlFor="r-status"><Select id="r-status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></Select></Field>
          <div className="sm:col-span-2"><Field label="Description" htmlFor="r-desc"><Textarea id="r-desc" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Toggle checked={f.requiresApproval} onChange={(v) => set({ requiresApproval: v })} label="Bookings need administrator approval" /></div>
        </div>
      </Modal>
    </div>
  );
}
