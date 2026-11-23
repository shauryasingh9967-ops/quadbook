import { KeyRound, Moon, Sun, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../../components/hooks';
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';
import { errMsg, get, patch, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cap, fmtDateTime } from '../../lib/format';
import { useToast } from '../../lib/feedback';
import { useTheme } from '../../lib/theme';
import type { User } from '../../lib/types';

const PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export default function Profile() {
  const { user, setUser } = useAuth(); const toast = useToast(); const theme = useTheme();
  const depts = useLoad(async () => (await get<Array<{ id: number; name: string }>>('/public/departments')).data, []);
  const [f, setF] = useState({ fullName: user!.fullName, phone: user!.phone ?? '', departmentId: user!.departmentId ? String(user!.departmentId) : '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false); const [busyPw, setBusyPw] = useState(false); const [pwErr, setPwErr] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.fullName.trim().length < 2) { toast.error('Enter your full name'); return; }
    setBusy(true);
    try { const u = await patch<User>('/auth/profile', { fullName: f.fullName, phone: f.phone || null, departmentId: f.departmentId ? Number(f.departmentId) : null }); setUser(u); toast.success('Profile saved'); }
    catch (e2) { toast.error(errMsg(e2)); } finally { setBusy(false); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwErr('');
    if (!PW.test(pw.newPassword)) { setPwErr('Use 8+ characters with an uppercase letter, a lowercase letter and a number.'); return; }
    if (pw.newPassword !== pw.confirm) { setPwErr('The new passwords do not match.'); return; }
    setBusyPw(true);
    try { await post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }); toast.success('Password changed'); setPw({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (e2) { setPwErr(errMsg(e2)); } finally { setBusyPw(false); }
  };
  return (
    <div>
      <PageHeader title="Profile and settings" subtitle="Your details, password and appearance." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="mb-6 flex items-center gap-4"><Avatar name={user!.fullName} size={56} /><div><p className="text-lg font-semibold">{user!.fullName}</p><p className="text-sm text-muted">{user!.email}</p><div className="mt-1.5 flex gap-2"><Badge tone="primary" dot={false}>{cap(user!.role)}</Badge><span className="text-xs text-muted">ID {user!.memberId}</span></div></div></div>
            <form onSubmit={save} className="space-y-4" noValidate>
              <Field label="Full name" htmlFor="p-name"><Input id="p-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
              <Field label="Phone" htmlFor="p-phone"><Input id="p-phone" value={f.phone} maxLength={20} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Department" htmlFor="p-dept"><Select id="p-dept" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">None</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
              <Button type="submit" loading={busy}><UserRound className="size-4" />Save changes</Button>
            </form>
            <p className="mt-4 text-xs text-muted">Last sign-in {user!.lastLoginAt ? fmtDateTime(user!.lastLoginAt) : 'this session'}</p>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-xl">Change password</h2>
            <form onSubmit={changePw} className="space-y-4" noValidate>
              <Field label="Current password" htmlFor="pw0"><Input id="pw0" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
              <Field label="New password" htmlFor="pw1"><Input id="pw1" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
              <Field label="Confirm new password" htmlFor="pw2"><Input id="pw2" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
              {pwErr && <p role="alert" className="text-sm font-medium text-bad">{pwErr}</p>}
              <Button type="submit" loading={busyPw} disabled={!pw.currentPassword}><KeyRound className="size-4" />Update password</Button>
            </form>
          </Card>
          <Card className="p-6">
            <h2 className="mb-1 text-xl">Appearance</h2><p className="mb-4 text-sm text-muted">Applies on this device.</p>
            <div className="flex gap-2">
              {([['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([k, l, I]) => (
                <Button key={k} variant={theme.theme === k ? 'primary' : 'secondary'} onClick={() => theme.theme !== k && theme.toggle()}><I className="size-4" />{l}</Button>))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
