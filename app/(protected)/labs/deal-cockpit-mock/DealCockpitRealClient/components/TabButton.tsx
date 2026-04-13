import React from 'react';

export function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void; }) {
  return (
    <button type="button" onClick={onClick} className={active ? 'text-slate-100 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent'}>
      <span className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">{children}</span>
    </button>
  );
}
