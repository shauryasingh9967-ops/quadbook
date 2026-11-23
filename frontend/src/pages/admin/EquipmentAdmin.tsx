import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../../components/hooks';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, Table, Td, Toggle } from '../../components/ui';
import { del, errMsg, get, post, put } from '../../lib/api';
import { useConfirm, useToast } from '../../lib/feedback';
import type { EquipmentRow, Resource } from '../../lib/types';

const blank = { resourceId: '', name: '', assetTag: '', quantityTotal: '1', status: 'operational', bookableAddon: false };

export default function EquipmentAdmin() {
  const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const resources = useLoad(async () => (await get<Resource[]>('/resources', { limit: 100, sort: 'name' })).data, []);
  const { data, loading, error, reload } = useLoad(() => get<EquipmentRow[]>('/equipment', { q: q || undefined, status: status || undefined, page, limit: 10 }), [q, status, page]);
  const [edit, setEdit] = useState<{ id: number | null } | null>(null); const [f, setF] = useState(blank); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof blank>) => setF((s) => ({ ...s, ...p }));
  const open = (e?: EquipmentRow) => { setErrs({}); setF(e ? { resourceId: String(e.resourceId), name: e.name, assetTag: e.assetTag, quantityTotal: String(e.quantityTotal), status: e.status, bookableAddon: e.bookableAddon } : blank); setEdit({ id: e?.id ?? null }); };
  const save = async () => {
    const er: Record<string, string> = {};
    if (!f.resourceId) er.resourceId = 'Choose where it is kept'; if (f.name.trim().length < 2) er.name = 'At least 2 characters'; if (f.assetTag.trim().length < 2) er.assetTag = 'At least 2 characters'; if (!(Number(f.quantityTotal) >= 1)) er.quantityTotal = 'At least 1';
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true);
    const body = { resourceId: Number(f.resourceId), name: f.name.trim(), assetTag: f.assetTag.trim(), quantityTotal: Number(f.quantityTotal), status: f.status, bookableAddon: f.bookableAddon };
    try { if (edit!.id === null) await post('/equipment', body); else await put(`/equipment/${edit!.id}`, body); toast.success(edit!.id === null ? 'Equipment added' : 'Changes saved'); setEdit(null); reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async (e: EquipmentRow) => {
    if (!(await confirm({ title: `Delete ${e.name}?`, message: 'This removes the item from the catalogue.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    try { await del(`/equipment/${e.id}`); toast.success('Equipment deleted'); reload(); } catch (err) { toast.error(errMsg(err)); }
  };
  const rows = data?.data ?? []; const meta = data?.meta;
  return (
    <div>
      <PageHeader title="Equipment" subtitle="Projectors, instruments and other assets, each kept in a room." actions={<Button onClick={() => open()}><Plus className="size-4" />Add equipment</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or asset tag" className="min-w-[220px] flex-1" />
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto"><option value="">Any status</option><option value="operational">Operational</option><option value="under_repair">Under repair</option><option value="retired">Retired</option></Select>
      </div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : rows.length === 0 ? <EmptyState title="No equipment found" /> : (
          <Table head={['Item', 'Kept in', 'Qty', 'Add-on', 'Status', <span key="a" className="sr-only">Actions</span>]}>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <Td><p className="font-semibold">{e.name}</p><p className="text-xs text-muted">{e.assetTag}</p></Td><Td className="text-muted">{e.resourceName}</Td><Td className="tabular-nums">{e.quantityTotal}</Td>
                <Td>{e.bookableAddon ? <Badge tone="primary" dot={false}>Requestable</Badge> : <span className="text-muted">No</span>}</Td><Td><StatusBadge status={e.status} /></Td>
                <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" aria-label={`Edit ${e.name}`} onClick={() => open(e)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label={`Delete ${e.name}`} onClick={() => remove(e)}><Trash2 className="size-4 text-bad" /></Button></div></Td>
              </tr>))}
          </Table>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? 'Add equipment' : 'Edit equipment'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>{edit?.id === null ? 'Add equipment' : 'Save changes'}</Button></>}>
        <div className="space-y-4">
          <Field label="Kept in" htmlFor="e-res" error={errs.resourceId}><Select id="e-res" value={f.resourceId} onChange={(e) => set({ resourceId: e.target.value })} invalid={!!errs.resourceId}><option value="">Choose a room or lab</option>{resources.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Name" htmlFor="e-name" error={errs.name}><Input id="e-name" value={f.name} onChange={(e) => set({ name: e.target.value })} invalid={!!errs.name} /></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Asset tag" htmlFor="e-tag" error={errs.assetTag}><Input id="e-tag" value={f.assetTag} onChange={(e) => set({ assetTag: e.target.value })} invalid={!!errs.assetTag} /></Field><Field label="Quantity" htmlFor="e-qty" error={errs.quantityTotal}><Input id="e-qty" type="number" min={1} value={f.quantityTotal} onChange={(e) => set({ quantityTotal: e.target.value })} invalid={!!errs.quantityTotal} /></Field></div>
          <Field label="Status" htmlFor="e-status"><Select id="e-status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="operational">Operational</option><option value="under_repair">Under repair</option><option value="retired">Retired</option></Select></Field>
          <Toggle checked={f.bookableAddon} onChange={(v) => set({ bookableAddon: v })} label="Can be requested with a booking" />
        </div>
      </Modal>
    </div>
  );
}
