import React from 'react';

export function Panel({ title, icon, right, children, className, bodyClassName }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; }) {
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
