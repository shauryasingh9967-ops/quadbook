import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input } from '../../components/ui';
import { errMsg, post } from '../../lib/api';
import { useToast } from '../../lib/feedback';

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/[0-9]/, 'Add a number'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast();
  const token = sp.get('token') ?? '';
  const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: z.infer<typeof schema>) => {
    setErr('');
    try { await post('/auth/reset-password', { token, password: v.password }); toast.success('Password updated. Sign in with the new one.'); nav('/login', { replace: true }); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <AuthShell title="Choose a new password" footer={<Link className="font-semibold text-primary hover:underline" to="/login">Back to sign in</Link>}>
      {!token ? <p className="text-muted">This link is missing its token. Request a new reset link from the sign-in page.</p> : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {err && <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{err}</div>}
          <Field label="New password" htmlFor="password" error={errors.password?.message}><Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
          <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm?.message}><Input id="confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Update password</Button>
        </form>)}
    </AuthShell>
  );
}
