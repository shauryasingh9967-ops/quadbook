import { KeyRound, Pencil, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../../components/hooks';
import { Avatar, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, Table, Td } from '../../components/ui';
import { del, errMsg, get, patch, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { useConfirm, useToast } from '../../lib/feedback';
import type { User } from '../../lib/types';

const PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
const blank = { fullName: '', email: '', password: '', role: 'student', memberId: '', departmentId: '', phone: '' };

export default function UsersAdmin() {
  const toast = useToast(); const confirm = useConfirm(); const { user: me } = useAuth();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const depts = useLoad(async () => (await get<Array<{ id: number; name: string }>>('/public/departments')).data, []);
  const { data, loading, error, reload } = useLoad(() => get<User[]>('/admin/users', { q: q || undefined, role: role || undefined, status: status || undefined, page, limit: 10 }), [q, role, status, page]);
  const [edit, setEdit] = useState<{ id: number | null } | null>(null); const [f, setF] = useState(blank); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState<User | null>(null); const [newPw, setNewPw] = useState('');
  const set = (p: Partial<typeof blank>) => setF((s) => ({ ...s, ...p }));
  const open = (u?: User) => { setErrs({}); setF(u ? { fullName: u.fullName, email: u.email, password: '', role: u.role, memberId: u.memberId, departmentId: u.departmentId ? String(u.departmentId) : '', phone: u.phone ?? '' } : blank); setEdit({ id: u?.id ?? null }); };

  const save = async () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().length < 2) e.fullName = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email';
    if (f.memberId.trim().length < 3) e.memberId = 'At least 3 characters';
    if (edit!.id === null && !PW.test(f.password)) e.password = '8+ characters with upper, lower case and a number';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    const body: Record<string, unknown> = { fullName: f.fullName.trim(), email: f.email.trim(), role: f.role, memberId: f.memberId.trim(), departmentId: f.departmentId ? Number(f.departmentId) : null, phone: f.phone.trim() || null };
    try {
      if (edit!.id === null) await post('/admin/users', { ...body, password: f.password }); else await patch(`/admin/users/${edit!.id}`, body);
      toast.success(edit!.id === null ? 'User created' : 'Changes saved'); setEdit(null); reload();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const toggle = async (u: User) => {
    const suspend = u.status === 'active';
    if (suspend && !(await confirm({ title: `Suspend ${u.fullName}?`, message: 'They are signed out and cannot log in until reactivated.', confirmLabel: 'Suspend', tone: 'danger' }))) return;
    try { await patch(`/admin/users/${u.id}`, { status: suspend ? 'suspended' : 'active' }); toast.success(suspend ? 'User suspended' : 'User reactivated'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (u: User) => {
    if (!(await confirm({ title: `Delete ${u.fullName}?`, message: 'Users with booking history are suspended instead, so records stay intact.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    try { const r = await del<{ suspended: boolean }>(`/admin/users/${u.id}`); toast.success(r.suspended ? 'Has booking history, so the account was suspended instead' : 'User deleted'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const doReset = async () => {
    if (!PW.test(newPw)) { toast.error('Use 8+ characters with upper, lower case and a number'); return; }
    setBusy(true);
    try { await post(`/admin/users/${reset!.id}/reset-password`, { password: newPw }); toast.success('Password reset'); setReset(null); setNewPw(''); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const rows = data?.data ?? []; const meta = data?.meta;
  return (
    <div>
      <PageHeader title="Users" subtitle="Accounts for students, faculty and administrators." actions={<Button onClick={() => open()}><Plus className="size-4" />Add user</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, email or ID" className="min-w-[220px] flex-1" />
        <Select aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="!w-auto"><option value="">All roles</option><option value="student">Students</option><option value="faculty">Faculty</option><option value="admin">Admins</option></Select>
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
      </div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : rows.length === 0 ? <EmptyState title="No users match" /> : (
          <Table head={['User', 'Role', 'Department', 'Bookings', 'Status', 'Joined', <span key="a" className="sr-only">Actions</span>]}>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <Td><div className="flex items-center gap-3"><Avatar name={u.fullName} /><div className="min-w-0"><p className="truncate font-semibold">{u.fullName}</p><p className="truncate text-xs text-muted">{u.email} · {u.memberId}</p></div></div></Td>
                <Td><StatusBadge status={u.role} /></Td><Td className="text-muted">{u.departmentName ?? 'None'}</Td><Td className="tabular-nums">{u.bookingCount ?? 0}</Td><Td><StatusBadge status={u.status} /></Td><Td className="text-muted">{fmtDate(u.createdAt)}</Td>
                <Td><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${u.fullName}`} onClick={() => open(u)}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Reset password for ${u.fullName}`} onClick={() => { setReset(u); setNewPw(''); }}><KeyRound className="size-4" /></Button>
                  {u.id !== me?.id && <><Button size="sm" variant="ghost" aria-label={u.status === 'active' ? 'Suspend' : 'Reactivate'} onClick={() => toggle(u)}>{u.status === 'active' ? <UserX className="size-4" /> : <UserCheck className="size-4" />}</Button><Button size="sm" variant="ghost" aria-label={`Delete ${u.fullName}`} onClick={() => remove(u)}><Trash2 className="size-4 text-bad" /></Button></>}
                </div></Td>
              </tr>))}
          </Table>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id === null ? 'Add user' : 'Edit user'} size="lg" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>{edit?.id === null ? 'Create user' : 'Save changes'}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="u-name" error={errs.fullName}><Input id="u-name" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} invalid={!!errs.fullName} /></Field>
          <Field label="Email" htmlFor="u-email" error={errs.email}><Input id="u-email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} invalid={!!errs.email} /></Field>
          <Field label="Member ID" htmlFor="u-mid" error={errs.memberId}><Input id="u-mid" value={f.memberId} onChange={(e) => set({ memberId: e.target.value })} invalid={!!errs.memberId} /></Field>
          <Field label="Role" htmlFor="u-role"><Select id="u-role" value={f.role} onChange={(e) => set({ role: e.target.value })}><option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option></Select></Field>
          <Field label="Department" htmlFor="u-dept"><Select id="u-dept" value={f.departmentId} onChange={(e) => set({ departmentId: e.target.value })}><option value="">None</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Phone" htmlFor="u-phone"><Input id="u-phone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          {edit?.id === null && <div className="sm:col-span-2"><Field label="Temporary password" htmlFor="u-pw" error={errs.password}><Input id="u-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set({ password: e.target.value })} invalid={!!errs.password} /></Field></div>}
        </div>
      </Modal>
      <Modal open={!!reset} onClose={() => setReset(null)} title="Reset password" size="sm" footer={<><Button variant="ghost" onClick={() => setReset(null)}>Cancel</Button><Button loading={busy} onClick={doReset}>Reset password</Button></>}>
        <p className="mb-4 text-sm text-muted">Set a new password for {reset?.fullName}. Share it with them securely.</p>
        <Field label="New password" htmlFor="rp"><Input id="rp" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
