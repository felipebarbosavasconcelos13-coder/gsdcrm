
import { QuickScript, ScriptCategory } from '@/lib/supabase/quickScripts';
import { BoardStage, Contact, DealView } from '@/types';
import { MessageChannel } from '@/features/inbox/components/MessageComposerModal';
import { TemplatePickerMode, MessageLogContext, StageTone } from './types';

export const PT_BR_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
export const PT_BR_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

export function hashString(input: string): string {
  // Djb2-ish hash para dedupe leve (não criptográfico)
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

export function humanizeTestLabel(input: string | null | undefined) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';

  // Remove sufixos de dados de teste gerados automaticamente (ex.: "next-ai_<uuid>")
  return raw.replace(/\s*next-ai[_-][0-9a-f-]{8,}\s*$/i, '').trim();
}

export function buildExecutionHeader(opts: {
  channel: 'WHATSAPP' | 'EMAIL';
  context?: MessageLogContext | null;
  outsideCRM?: boolean;
}) {
  const lines: string[] = [];
  lines.push('Fonte: Cockpit');
  lines.push(`Canal: ${opts.channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}`);

  if (opts.outsideCRM) {
    lines.push('Fora do CRM: sim');
  }

  const ctx = opts.context;
  if (ctx) {
    const originLabel = ctx.origin === 'nextBestAction' ? 'Próxima ação' : 'Ação rápida';
    lines.push(`Origem: ${originLabel}`);
    lines.push(`Geração: ${ctx.source === 'template' ? 'Template' : ctx.source === 'generated' ? 'Gerado' : 'Manual'}`);
    if (ctx.template) {
      lines.push(`Template: ${ctx.template.title} (${ctx.template.id})`);
    }
    if (typeof ctx.aiSuggested === 'boolean') {
      lines.push(`Sugerido por IA: ${ctx.aiSuggested ? 'sim' : 'não'}`);
    }
    if (ctx.aiActionType) {
      lines.push(`Tipo IA: ${ctx.aiActionType}`);
    }
  }

  return lines.join('\n');
}

export function pickEmailPrefill(applied: string, fallbackSubject: string): { subject: string; body: string } {
  const lines = applied.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*(assunto|subject)\s*:\s*/i.test(l));

  if (idx >= 0) {
    const raw = lines[idx] ?? '';
    const subject = raw.replace(/^\s*(assunto|subject)\s*:\s*/i, '').trim() || fallbackSubject;
    const body = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n').trim();
    return { subject, body };
  }

  return { subject: fallbackSubject, body: applied.trim() };
}

export function scriptCategoryChipClass(color: string): string {
  // Mantém classes estáticas (Tailwind) e evita template strings dinâmicas.
  switch (color) {
    case 'blue':
      return 'bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/20';
    case 'orange':
      return 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/20';
    case 'green':
      return 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/20';
    case 'purple':
      return 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/20';
    case 'yellow':
      return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/20';
    default:
      return 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/20';
  }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function formatAtISO(iso: string): string {
  const d = new Date(iso);
  const dd = PT_BR_DATE_FORMATTER.format(d);
  const tt = PT_BR_TIME_FORMATTER.format(d);
  return `${dd} · ${tt}`;
}

export function formatCurrencyBRL(value: number): string {
  try {
    return BRL_CURRENCY_FORMATTER.format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

export function stageToneFromBoardColor(color?: string): StageTone {
  const c = (color ?? '').toLowerCase();
  if (c.includes('emerald') || c.includes('green')) return 'green';
  if (c.includes('violet') || c.includes('purple')) return 'violet';
  if (c.includes('amber') || c.includes('yellow') || c.includes('orange')) return 'amber';
  if (c.includes('blue') || c.includes('sky') || c.includes('cyan')) return 'blue';
  return 'slate';
}

export function toneToBg(tone: StageTone): string {
  switch (tone) {
    case 'blue':
      return 'bg-sky-500';
    case 'violet':
      return 'bg-violet-500';
    case 'amber':
      return 'bg-amber-500';
    case 'green':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-600';
  }
}

export function normalizeReason(raw?: string) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s*-\s*Sugerido por IA\s*$/i, '').trim();
}

export function formatSlot(d: Date) {
  const day = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

export function proposeTwoSlots() {
  const a = new Date();
  a.setDate(a.getDate() + 1);
  a.setHours(10, 0, 0, 0);

  const b = new Date();
  b.setDate(b.getDate() + 2);
  b.setHours(15, 0, 0, 0);

  return { a, b };
}

export function buildSuggestedWhatsAppMessage(opts: {
  contact?: Contact;
  deal?: DealView;
  actionType: string;
  action: string;
  reason?: string;
}) {
  const { contact, deal, actionType, action, reason } = opts;

  const firstName = contact?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Oi ${firstName}, tudo bem?` : 'Oi, tudo bem?';
  const r = normalizeReason(reason);
  const dealTitle = deal?.title?.trim();
  const dealCtx = dealTitle ? ` sobre ${dealTitle}` : '';

  const { a, b } = proposeTwoSlots();
  const reasonSentence = r ? `\n\nPensei nisso porque ${r.charAt(0).toLowerCase()}${r.slice(1)}.` : '';

  if (actionType === 'MEETING') {
    return (
      `${greeting}` +
      `\n\nQueria marcar um papo rápido (15 min)${dealCtx} pra alinharmos os próximos passos.` +
      `${reasonSentence}` +
      `\n\nVocê consegue ${formatSlot(a)} ou ${formatSlot(b)}? Se preferir, me diga um horário bom pra você.`
    );
  }

  if (actionType === 'CALL') {
    return (
      `${greeting}` +
      `\n\nPodemos fazer uma ligação rapidinha${dealCtx}?` +
      `${reasonSentence}` +
      `\n\nVocê prefere ${formatSlot(a)} ou ${formatSlot(b)}?`
    );
  }

  if (actionType === 'TASK') {
    return (
      `${greeting}` +
      `\n\nSó pra alinharmos${dealCtx}: ${action.trim()}.` +
      `${reasonSentence}` +
      `\n\nPode me confirmar quando conseguir?`
    );
  }

  const cleanAction = action?.trim();
  const actionLine = cleanAction ? `\n\n${cleanAction}${dealTitle ? ` (${dealTitle})` : ''}.` : '';
  return `${greeting}${actionLine}${reasonSentence}`;
}

export function buildSuggestedEmailBody(opts: {
  contact?: Contact;
  deal?: DealView;
  actionType: string;
  action: string;
  reason?: string;
}) {
  const { contact, deal, actionType, action, reason } = opts;

  const firstName = contact?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Olá ${firstName},` : 'Olá,';
  const r = normalizeReason(reason);
  const dealTitle = deal?.title?.trim();
  const { a, b } = proposeTwoSlots();

  const reasonSentence = r ? `\n\nMotivo: ${r}.` : '';
  const dealSentence = dealTitle ? `\n\nAssunto: ${dealTitle}.` : '';

  if (actionType === 'MEETING') {
    return (
      `${greeting}` +
      `\n\nQueria marcar uma conversa rápida (15 min) para alinharmos próximos passos.` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nVocê teria disponibilidade em ${formatSlot(a)} ou ${formatSlot(b)}?` +
      `\n\nAbs,`
    );
  }

  if (actionType === 'CALL') {
    return (
      `${greeting}` +
      `\n\nPodemos falar rapidamente por telefone?` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nSugestões de horário: ${formatSlot(a)} ou ${formatSlot(b)}.` +
      `\n\nAbs,`
    );
  }

  if (actionType === 'TASK') {
    return (
      `${greeting}` +
      `\n\n${action.trim()}.` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nAbs,`
    );
  }

  return (
    `${greeting}` +
    `\n\n${action.trim()}.` +
    `${dealSentence}` +
    `${reasonSentence}` +
    `\n\nAbs,`
  );
}
