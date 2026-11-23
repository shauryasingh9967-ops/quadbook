export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <rect x="6" y="9" width="9" height="4" rx="2" fill="var(--on-primary)" />
      <rect x="11" y="14" width="15" height="4" rx="2" fill="var(--amber)" />
      <rect x="6" y="19" width="12" height="4" rx="2" fill="var(--on-primary)" opacity=".8" />
    </svg>
  );
}
export const Brand = ({ size = 32 }: { size?: number }) => (
  <span className="inline-flex items-center gap-2.5"><LogoMark size={size} /><span className="font-display text-[19px] font-semibold tracking-tight">QuadBook</span></span>
);
