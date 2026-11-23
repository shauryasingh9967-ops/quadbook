import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cap } from '../lib/format';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export { cx };

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover border-transparent',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-2',
  soft: 'bg-primary-soft text-primary border-transparent hover:brightness-95',
  danger: 'bg-bad text-white border-transparent hover:brightness-110',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button {...rest} disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-ctl) border font-semibold transition-[background-color,filter,transform] duration-150 active:scale-[0.98] disabled:opacity-55 disabled:active:scale-100',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm', variants[variant], className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Surfaces
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('rounded-(--radius-card) border border-line bg-surface', className)}>{children}</div>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Badges
type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'primary';
const toneCls: Record<Tone, string> = {
  ok: 'text-ok bg-[color-mix(in_srgb,var(--ok)_14%,transparent)]',
  warn: 'text-warn bg-[color-mix(in_srgb,var(--amber)_22%,transparent)]',
  bad: 'text-bad bg-[color-mix(in_srgb,var(--bad)_13%,transparent)]',
  info: 'text-info bg-[color-mix(in_srgb,var(--info)_14%,transparent)]',
  primary: 'text-primary bg-primary-soft',
  neutral: 'text-muted bg-surface-2 border border-line',
};
export function Badge({ tone = 'neutral', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', toneCls[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}{children}
    </span>
  );
}
const STATUS_TONE: Record<string, Tone> = {
  pending: 'warn', approved: 'ok', completed: 'info', rejected: 'bad', cancelled: 'neutral', available: 'ok', maintenance: 'warn', retired: 'neutral',
  active: 'ok', suspended: 'bad', operational: 'ok', under_repair: 'warn', reported: 'warn', open: 'info', in_progress: 'primary', resolved: 'ok', closed: 'neutral',
  low: 'neutral', medium: 'info', high: 'warn', critical: 'bad', admin: 'primary', faculty: 'info', student: 'neutral', auto_approved: 'ok',
};
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{cap(status)}</Badge>;

// ------------------------------------------------------------------ Forms
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs font-medium text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
const ctl = 'w-full rounded-(--radius-ctl) border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-surface-2 disabled:text-muted';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ invalid, className, ...p }, ref) =>
  <input ref={ref} aria-invalid={invalid || undefined} {...p} className={cx(ctl, 'h-10', invalid ? 'border-bad' : 'border-line-strong', className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ invalid, className, children, ...p }, ref) =>
  <select ref={ref} aria-invalid={invalid || undefined} {...p} className={cx(ctl, 'h-10 pr-8', invalid ? 'border-bad' : 'border-line-strong', className)}>{children}</select>);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ invalid, className, ...p }, ref) =>
  <textarea ref={ref} aria-invalid={invalid || undefined} {...p} className={cx(ctl, 'min-h-24 py-2.5', invalid ? 'border-bad' : 'border-line-strong', className)} />);

export function SearchInput({ value, onChange, placeholder = 'Search', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => { const t = setTimeout(() => local !== value && onChange(local), 300); return () => clearTimeout(t); }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className={cx(ctl, 'h-10 border-line-strong pl-9', local && 'pr-9')} />
      {local && <button type="button" aria-label="Clear search" onClick={() => { setLocal(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"><X className="size-4" /></button>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-sm">
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-line-strong')}>
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      <span>{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ Modal
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus(), 60);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
            initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18 }}
            className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl',
              size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <h2 id={titleId} className="text-xl">{title}</h2>
              <button aria-label="Close dialog" onClick={onClose} className="-mr-1.5 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"><X className="size-5" /></button>
            </div>
            <div className="scroll-thin overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3.5 sm:rounded-b-2xl">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ Feedback states
export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted"><Loader2 className="size-5 animate-spin" /><span className="text-sm">{label}…</span></div>
);
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-lg bg-line/70', className)} />;
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <h3 className="text-lg">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <h3 className="text-lg">Could not load this</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{message}</p>
      {onRetry && <Button className="mt-4" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// ------------------------------------------------------------------ Pagination / Tabs / Stat
export function Pagination({ page, totalPages, total, limit, onPage }: { page: number; totalPages: number; total: number; limit: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * limit + 1, to = Math.min(total, page * limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <span>Showing <b className="text-ink">{from}–{to}</b> of <b className="text-ink">{total}</b></span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
        <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
        <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
}
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: string; count?: number }> }) {
  return (
    <div role="tablist" className="scroll-thin flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cx('flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
            value === i.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
          {i.label}
          {i.count !== undefined && <span className={cx('rounded-full px-1.5 text-xs tabular-nums', value === i.value ? 'bg-primary-soft text-primary' : 'bg-line/70')}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-[34px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-[13px] text-muted">{hint}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ Table shell
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('scroll-thin overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead><tr className="border-b border-line bg-surface-2/70">
          {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-muted">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>;

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const ini = name.replace(/^Dr\.\s*/, '').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.38 }} className="inline-grid shrink-0 place-items-center rounded-full bg-primary-soft font-display font-semibold text-primary">{ini}</span>;
}
