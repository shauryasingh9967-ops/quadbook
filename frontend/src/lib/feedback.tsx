import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Modal } from '../components/ui';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ConfirmOpts { title: string; message: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary' }

const ToastCtx = createContext<{ push: (k: ToastKind, m: string) => void }>({ push: () => undefined });
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export const useToast = () => {
  const { push } = useContext(ToastCtx);
  return { success: (m: string) => push('success', m), error: (m: string) => push('error', m), info: (m: string) => push('info', m) };
};
export const useConfirm = () => useContext(ConfirmCtx);

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const tone = { success: 'text-ok', error: 'text-bad', info: 'text-info' };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), []);
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null); };

  return (
    <ToastCtx.Provider value={{ push }}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
          <AnimatePresence>
            {toasts.map((t) => {
              const Icon = icons[t.kind];
              return (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.18 }} role={t.kind === 'error' ? 'alert' : 'status'}
                  className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line-strong bg-surface p-3.5 pr-2.5 shadow-lg">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${tone[t.kind]}`} />
                  <p className="flex-1 text-sm">{t.message}</p>
                  <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="rounded p-1 text-muted hover:text-ink"><X className="size-4" /></button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <Modal open={Boolean(dlg)} onClose={() => close(false)} title={dlg?.title ?? ''} size="sm"
          footer={<><Button variant="ghost" onClick={() => close(false)}>Keep as is</Button>
            <Button variant={dlg?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>{dlg?.confirmLabel ?? 'Confirm'}</Button></>}>
          <div className="flex gap-3">
            {dlg?.tone === 'danger' && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />}
            <div className="text-sm text-muted">{dlg?.message}</div>
          </div>
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
