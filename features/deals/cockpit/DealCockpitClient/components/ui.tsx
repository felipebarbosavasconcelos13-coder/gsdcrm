
import React from 'react';

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const cls =
    tone === 'success'
      ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/20'
      : tone === 'danger'
        ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/20'
        : 'bg-white/5 text-slate-200 ring-1 ring-white/10';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>
  );
}

export function Panel({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/3 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          {icon}
          <span className="uppercase tracking-wide text-slate-400">{title}</span>
        </div>
        {right}
      </div>
      <div className={`p-4 ${bodyClassName ?? ''}`}>{children}</div>
    </div>
  );
}

export function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'text-slate-100 border-b-2 border-cyan-400'
          : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
      }
    >
      <span className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">{children}</span>
    </button>
  );
}
