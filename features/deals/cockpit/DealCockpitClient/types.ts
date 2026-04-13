import { QuickScript, ScriptCategory } from '@/lib/supabase/quickScripts';
export type Tab = 'chat' | 'notas' | 'scripts' | 'arquivos';

// Performance: reuse Intl formatter instances (avoid creating them per call).
export const PT_BR_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
export const PT_BR_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

export type StageTone = 'blue' | 'violet' | 'amber' | 'green' | 'slate';

export type Stage = {
  id: string;
  label: string;
  tone: StageTone;
  rawColor?: string;
};

export type TimelineItem = {
  id: string;
  at: string;
  kind: 'status' | 'call' | 'note' | 'system';
  title: string;
  subtitle?: string;
  tone?: 'success' | 'danger' | 'neutral';
};

export type ToastTone = 'neutral' | 'success' | 'danger';
export type ToastState = { id: string; message: string; tone: ToastTone };

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TemplatePickerMode = 'WHATSAPP' | 'EMAIL';

export type MessageLogContext = {
  source: 'template' | 'generated' | 'manual';
  origin: 'nextBestAction' | 'quickAction';
  template?: { id: string; title: string };
  aiSuggested?: boolean;
  aiActionType?: string;
};