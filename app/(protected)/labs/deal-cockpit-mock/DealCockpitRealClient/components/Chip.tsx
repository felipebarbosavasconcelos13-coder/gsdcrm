import React from 'react';

export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'danger'; }) {
  const cls = tone === 'success' ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/20' : tone === 'danger' ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/20' : 'bg-white/5 text-slate-200 ring-1 ring-white/10';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>
  );
}
