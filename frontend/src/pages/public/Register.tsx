import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input, Select } from '../../components/ui';
import { errMsg, get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/feedback';
import { homeFor } from '../../layouts/guards';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name'),
  email: z.string().min(1, 'Enter your email').email('Enter a valid email'),
  role: z.enum(['student', 'faculty']),
  memberId: z.string().trim().min(3, 'At least 3 characters'),
  departmentId: z.string().min(1, 'Choose your department'),
  password: z.string().min(8, 'At least 8 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/[0-9]/, 'Add a number'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type F = z.infer<typeof schema>;

export default function Register() {
  const { register: signUp } = useAuth();
  const nav = useNavigate(); const toast = useToast();
  const [depts, setDepts] = useState<Array<{ id: number; name: string }>>([]);
  const [allowed, setAllowed] = useState(true);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { role: 'student' } });
  const role = watch('role');
  useEffect(() => {
    get<Array<{ id: number; name: string }>>('/public/departments').then((r) => setDepts(r.data)).catch(() => undefined);
    get<Record<string, string>>('/public/settings').then((r) => setAllowed(r.data.allow_registration !== '0')).catch(() => undefined);
  }, []);

  const onSubmit = async (v: F) => {
    setFormError('');
    try {
      const u = await signUp({ fullName: v.fullName, email: v.email, role: v.role, memberId: v.memberId, departmentId: Number(v.departmentId), password: v.password });
      toast.success('Account created. Welcome to QuadBook.'); nav(homeFor(u.role), { replace: true });
    } catch (e) { setFormError(errMsg(e)); }
  };

  return (
    <AuthShell title="Create your account" subtitle="Students and faculty can book resources straight away." footer={<>Already registered? <Link className="font-semibold text-primary hover:underline" to="/login">Sign in</Link></>}>
      {!allowed && <div role="alert" className="mb-5 rounded-lg border border-amber/60 bg-amber-soft px-3.5 py-2.5 text-sm">Self-registration is switched off right now. Ask the administrator office to create your account.</div>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{formError}</div>}
        <Field label="I am a" htmlFor="role"><Select id="role" {...register('role')}><option value="student">Student</option><option value="faculty">Faculty member</option></Select></Field>
        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}><Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} /></Field>
        <Field label="University email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={role === 'faculty' ? 'Employee ID' : 'Enrollment number'} htmlFor="memberId" error={errors.memberId?.message}><Input id="memberId" invalid={!!errors.memberId} {...register('memberId')} /></Field>
          <Field label="Department" htmlFor="departmentId" error={errors.departmentId?.message}>
            <Select id="departmentId" invalid={!!errors.departmentId} {...register('departmentId')}><option value="">Choose…</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          </Field>
        </div>
        <Field label="Password" htmlFor="password" error={errors.password?.message} hint="8+ characters with upper-case, lower-case and a number."><Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}><Input id="confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!allowed}>Create account</Button>
      </form>
    </AuthShell>
  );
}
