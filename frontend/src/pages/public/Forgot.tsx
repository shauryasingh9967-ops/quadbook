import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input } from '../../components/ui';
import { errMsg, post } from '../../lib/api';

const schema = z.object({ email: z.string().min(1, 'Enter your email').email('Enter a valid email') });

export default function Forgot() {
  const [done, setDone] = useState<{ token?: string } | null>(null);
  const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: z.infer<typeof schema>) => {
    setErr('');
    try { const r = await post<{ devResetToken?: string }>('/auth/forgot-password', v); setDone({ token: r.devResetToken }); } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will generate a reset link." footer={<Link className="font-semibold text-primary hover:underline" to="/login">Back to sign in</Link>}>
      {done ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4 text-sm"><p className="font-semibold">Check your email</p><p className="mt-1 text-muted">If an account exists for that address, a reset link is on its way. It stays valid for 30 minutes.</p></div>
          {done.token && (
            <div className="rounded-lg border border-dashed border-amber p-4 text-sm">
              <p className="font-semibold">Development mode</p>
              <p className="mb-3 mt-1 text-muted">No mail server is configured in this project, so the link is shown here instead of being emailed.</p>
              <Link to={`/reset-password?token=${done.token}`}><Button size="sm">Open reset link</Button></Link>
            </div>)}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {err && <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{err}</div>}
          <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" invalid={!!errors.email} {...register('email')} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Send reset link</Button>
        </form>)}
    </AuthShell>
  );
}
