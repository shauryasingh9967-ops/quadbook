import type { CSSProperties } from 'react';

export const C = { primary: 'var(--primary)', amber: 'var(--amber)', ok: 'var(--ok)', bad: 'var(--bad)', info: 'var(--info)', muted: 'var(--muted)', line: 'var(--line)', cls: 'var(--ribbon-class)' };
export const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false, axisLine: false } as const;
export const tooltipStyle: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 13, color: 'var(--ink)', boxShadow: 'none' };
export const tooltipProps = { contentStyle: tooltipStyle, labelStyle: { color: 'var(--ink)', fontWeight: 600 }, itemStyle: { color: 'var(--ink)' }, cursor: { fill: 'color-mix(in srgb, var(--primary) 8%, transparent)' } };
