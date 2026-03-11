import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { toWhatsAppPhone } from '@/lib/phone';
import { useOptionalToast } from '@/context/ToastContext';

type WhatsAppMessage = {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: 'in' | 'out';
  message: string;
  provider: string;
  external_message_id: string | null;
  created_at: string;
};

type Props = {
  isOpen: boolean;
  contactName: string;
  phone: string;
  dealTitle?: string;
  onClose: () => void;
};

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function WhatsAppChatPanel({ isOpen, contactName, phone, dealTitle, onClose }: Props) {
  const { addToast } = useOptionalToast();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);

  const normalizedPhone = useMemo(() => {
    const digits = toWhatsAppPhone(phone);
    return digits ? `+${digits}` : '';
  }, [phone]);

  const loadMessages = useCallback(async () => {
    if (!normalizedPhone || !isOpen) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/integrations/whatsapp/evolution/messages?phone=${encodeURIComponent(normalizedPhone)}`,
        { cache: 'no-store' }
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        const error = json && typeof json.error === 'string' ? json.error : 'Falha ao carregar chat.';
        addToast(error, 'error');
        return;
      }

      setMessages(Array.isArray(json?.messages) ? json.messages : []);
      setIsConfigured(Boolean(json?.configured ?? false));
    } catch {
      addToast('Falha ao carregar chat.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, isOpen, normalizedPhone]);

  useEffect(() => {
    if (!isOpen || !normalizedPhone) return;
    loadMessages();
    const id = window.setInterval(loadMessages, 4000);
    return () => window.clearInterval(id);
  }, [isOpen, normalizedPhone, loadMessages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !normalizedPhone) return;

    setSending(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/evolution/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          message: text,
          contactName,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const error = json && typeof json.error === 'string' ? json.error : 'Falha ao enviar mensagem.';
        addToast(error, 'error');
        return;
      }

      setDraft('');
      await loadMessages();
    } catch {
      addToast('Falha ao enviar mensagem.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(460px,calc(100vw-1rem))] h-[min(78vh,700px)] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900 dark:text-white truncate">{contactName}</div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
            {normalizedPhone || 'Sem telefone'}
            {dealTitle ? ` - ${dealTitle}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Fechar chat"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-100/60 dark:bg-slate-950/70">
        {loading && messages.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Carregando mensagens...</div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <MessageCircle className="h-8 w-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Ainda sem mensagens neste chat.</p>
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
              m.direction === 'out'
                ? 'ml-auto bg-blue-600 text-white'
                : 'mr-auto bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/10'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">{m.message}</div>
            <div
              className={`mt-1 text-[11px] ${m.direction === 'out' ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}
            >
              {formatTime(m.created_at)}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900">
        {!isConfigured ? (
          <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            Evolution API nao configurada para esta organizacao.
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={normalizedPhone ? 'Digite uma mensagem...' : 'Contato sem telefone'}
            disabled={!normalizedPhone || sending || !isConfigured}
            rows={2}
            className="min-h-[44px] max-h-28 flex-1 resize-none rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sending || !normalizedPhone || !isConfigured}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Enviar mensagem"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
