import React, { useState, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { QuickScript, ScriptCategory } from '@/lib/supabase/quickScripts';
import { scriptCategoryChipClass } from '../utils';
import type { TemplatePickerMode } from '../types';

export function TemplatePickerModal({
  isOpen, onClose, mode, scripts, isLoading, variables, applyVariables, getCategoryInfo, onPick
}: {
  isOpen: boolean;
  onClose: () => void;
  mode: TemplatePickerMode;
  scripts: QuickScript[];
  isLoading: boolean;
  variables: Record<string, string>;
  applyVariables: (template: string, vars: Record<string, string>) => string;
  getCategoryInfo: (cat: ScriptCategory) => { label: string; color: string };
  onPick: (script: QuickScript) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ScriptCategory>('all');

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('all');
  }, [isOpen, mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = category === 'all' ? scripts : scripts.filter((s) => s.category === category);
    if (!q) return base;
    return base.filter((s) => {
      const hay = `${s.title}\n${s.template}`.toLowerCase();
      return hay.includes(q);
    });
  }, [category, query, scripts]);

  const title = mode === 'WHATSAPP' ? 'Templates · WhatsApp' : 'Templates · E-mail';

  if (!isOpen) return null;

  const categories: Array<{ key: 'all' | ScriptCategory; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'followup', label: 'Follow-up' },
    { key: 'intro', label: 'Apresentação' },
    { key: 'objection', label: 'Objeções' },
    { key: 'closing', label: 'Fechamento' },
    { key: 'rescue', label: 'Resgate' },
    { key: 'other', label: 'Outros' },
  ];

  return (
    <div className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">{title}</div>
            <div className="text-[11px] text-slate-500">Escolha um script persistido e eu preencho a mensagem com variáveis do deal/contato.</div>
          </div>
          <button type="button" className="rounded-xl border border-white/10 bg-white/3 p-2 text-slate-300 hover:bg-white/5" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título ou texto…" className="w-full rounded-xl border border-white/10 bg-white/3 px-9 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button key={c.key} type="button" onClick={() => setCategory(c.key)} className={category === c.key ? 'rounded-full bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold' : 'rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10'}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-slate-500">
              Variáveis: <span className="font-mono">{'{nome}'}</span>, <span className="font-mono">{'{empresa}'}</span>, <span className="font-mono">{'{valor}'}</span>, <span className="font-mono">{'{produto}'}</span>
            </div>
            <div className="h-105 overflow-auto rounded-2xl border border-white/10 bg-white/2">
              {isLoading ? (
                <div className="p-4 text-sm text-slate-400">Carregando scripts…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">Nenhum template encontrado.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filtered.map((s) => {
                    const info = getCategoryInfo(s.category);
                    const preview = applyVariables(s.template, variables);
                    return (
                      <button key={s.id} type="button" className="w-full text-left p-4 hover:bg-white/5 transition-colors" onClick={() => onPick(s)}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${scriptCategoryChipClass(info.color)}`}>{info.label}</span>
                              <span className="truncate text-sm font-semibold text-slate-100">{s.title}</span>
                              {s.is_system ? <span className="text-[10px] text-slate-500">Sistema</span> : null}
                            </div>
                            <div className="mt-2 text-xs text-slate-400 line-clamp-3 whitespace-pre-wrap">{preview}</div>
                          </div>
                          <div className="shrink-0 text-[11px] font-semibold text-cyan-200">Usar</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
