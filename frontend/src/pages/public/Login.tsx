import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input } from '../../components/ui';
import { errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/feedback';
import { homeFor } from '../../layouts/guards';

const schema = z.object({ email: z.string().min(1, 'Enter your email').email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
type F = z.infer<typeof schema>;
const DEMO = [
  { role: 'Student', email: 'aarav.sharma@smartcampus.edu', password: 'Student@12345' },
  { role: 'Faculty', email: 'meera.nair@smartcampus.edu', password: 'Faculty@12345' },
  { role: 'Admin', email: 'neha.kapoor@smartcampus.edu', password: 'Admin@12345' },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: F) => {
    setFormError('');
    try {
      const u = await login(v.email, v.password);
      toast.success(`Welcome back, ${u.fullName.split(' ')[0]}`);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from.startsWith(u.role === 'admin' ? '/admin' : '/app') ? from : homeFor(u.role), { replace: true });
    } catch (e) { setFormError(errMsg(e)); }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use your university email to continue." footer={<>New here? <Link className="font-semibold text-primary hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{formError}</div>}
        <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="username" placeholder="you@smartcampus.edu" invalid={!!errors.email} {...register('email')} /></Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-10" invalid={!!errors.password} {...register('password')} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </div>
        </Field>
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-semibold text-primary hover:underline">Forgot password?</Link></div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
      <div className="mt-8 rounded-xl border border-dashed border-line-strong p-4">
        <p className="text-sm font-semibold">Demo accounts</p>
        <p className="mb-3 mt-0.5 text-xs text-muted">For the capstone demo. Click to fill the form.</p>
        <div className="flex flex-wrap gap-2">
          {DEMO.map((d) => <Button key={d.role} type="button" size="sm" variant="secondary" onClick={() => { setValue('email', d.email, { shouldValidate: true }); setValue('password', d.password, { shouldValidate: true }); }}>{d.role}</Button>)}
        </div>
      </div>
    </AuthShell>
  );
}
