import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LiveBoard } from './LiveBoard';
import { Brand } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,540px)_1fr]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between"><Link to="/" aria-label="QuadBook home"><Brand /></Link><ThemeToggle /></div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[32px]">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-line bg-surface-2 p-12 lg:flex">
        <div className="w-full max-w-[520px]">
          <LiveBoard />
          <p className="mx-auto mt-6 max-w-sm text-center text-sm text-muted">Live from the campus database. What you see here is what you can book.</p>
        </div>
      </div>
    </div>
  );
}
