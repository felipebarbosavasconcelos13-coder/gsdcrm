import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, SkipForward, XCircle, Clock, MessageCircle, Phone, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { SettingsSection } from './SettingsSection';

type WebhookLogEntry = {
  id: string;
  received_at: string;
  status: string;
  provider: string;
  external_event_id: string | null;
  error: string | null;
  created_contact_id: string | null;
  created_deal_id: string | null;
  payload: Record<string, unknown> | null;
};

type WhatsAppMessageEntry = {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: string;
  message: string;
  message_type: string;
  caption: string | null;
  created_at: string;
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  processed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  received: <Clock className="h-4 w-4 text-amber-400" />,
  skipped: <SkipForward className="h-4 w-4 text-slate-400" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  processed: 'Processado',
  received: 'Recebido',
  skipped: 'Ignorado',
  error: 'Erro',
};

const STATUS_BG: Record<string, string> = {
  processed: 'bg-emerald-500/10 border-emerald-500/20',
  received: 'bg-amber-500/10 border-amber-500/20',
  skipped: 'bg-slate-500/10 border-slate-500/20',
  error: 'bg-red-500/10 border-red-500/20',
};

function extractPhoneFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const remoteJid = String(
    (payload as any)?.data?.key?.remoteJid ??
    (payload as any)?.data?.remoteJid ??
    ''
  );
  if (remoteJid && remoteJid.includes('@')) return remoteJid.split('@')[0];
  const pushName = String((payload as any)?.data?.pushName ?? '');
  return pushName || null;
}

function extractMessagePreview(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const data = (payload as any)?.data;
  if (!data) return null;
  const msg = data?.message ?? data?.messages?.[0]?.message ?? {};
  if (typeof msg?.conversation === 'string') return msg.conversation.slice(0, 80);
  if (typeof msg?.extendedTextMessage?.text === 'string') return msg.extendedTextMessage.text.slice(0, 80);
  if (typeof msg?.imageMessage?.caption === 'string') return `[Imagem] ${msg.imageMessage.caption.slice(0, 60)}`;
  if (typeof msg?.videoMessage?.caption === 'string') return `[Video] ${msg.videoMessage.caption.slice(0, 60)}`;
  if (typeof msg?.audioMessage) return '[Audio]';
  if (typeof msg?.documentMessage?.caption === 'string') return `[Documento] ${msg.documentMessage.caption.slice(0, 60)}`;
  if (typeof msg?.stickerMessage) return '[Sticker]';
  return null;
}

function extractContactNameFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  return String(
    (payload as any)?.data?.pushName ??
    (payload as any)?.data?.messages?.[0]?.pushName ??
    ''
  ).trim() || null;
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatRelative(dateStr: string) {
  const now = Date.now();
  const ts = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 10) return 'agora';
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d`;
}

export const WebhookLogPanel: React.FC = () => {
  const { profile } = useAuth();
  const [events, setEvents] = useState<WebhookLogEntry[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profile?.organization_id) return;
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, messagesRes] = await Promise.allSettled([
        supabase
          .from('webhook_events_in')
          .select('id,received_at,status,provider,external_event_id,error,created_contact_id,created_deal_id,payload')
          .eq('organization_id', profile.organization_id)
          .eq('provider', 'evolution')
          .order('received_at', { ascending: false })
          .limit(50),
        supabase
          .from('whatsapp_messages')
          .select('id,phone,contact_name,direction,message,message_type,caption,created_at')
          .eq('organization_id', profile.organization_id)
          .eq('direction', 'in')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (eventsRes.status === 'fulfilled' && eventsRes.value.data) {
        setEvents(eventsRes.value.data as WebhookLogEntry[]);
      }
      if (messagesRes.status === 'fulfilled' && messagesRes.value.data) {
        setMessages(messagesRes.value.data as WhatsAppMessageEntry[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const getStatusBadge = (status: string) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BG[status] || STATUS_BG.error}`}>
      {STATUS_ICON[status] || STATUS_ICON.error}
      {STATUS_LABEL[status] || status}
    </span>
  );

  return (
    <SettingsSection title="Log de Eventos do WhatsApp" icon={Activity}>
      <div className="mt-4 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitore os eventos recebidos da Evolution API e as mensagens processadas.
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10"
              />
              Auto-refresh
            </label>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-2">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
              Processados
            </div>
            <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 mt-1">
              {events.filter((e) => e.status === 'processed').length}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              Ignorados
            </div>
            <div className="text-2xl font-bold text-amber-800 dark:text-amber-200 mt-1">
              {events.filter((e) => e.status === 'skipped').length}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-500/10 border border-slate-500/20">
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              Mensagens Inbound
            </div>
            <div className="text-2xl font-bold text-slate-700 dark:text-slate-200 mt-1">
              {messages.length}
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Eventos do Webhook
            <span className="text-[11px] font-normal text-slate-400">({events.length} recentes)</span>
          </h4>

          {loading && events.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              Carregando eventos...
            </div>
          ) : events.length === 0 ? (
            <div className="p-6 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
              <Activity className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Nenhum evento registrado</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Os eventos aparecerão aqui quando a Evolution API enviar webhooks.<br />
                Verifique se o webhook está configurado na Evolution com a URL correta.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const isExpanded = expandedEvent === event.id;
                const phone = extractPhoneFromPayload(event.payload);
                const contact = extractContactNameFromPayload(event.payload);
                const preview = extractMessagePreview(event.payload);
                return (
                  <div
                    key={event.id}
                    className={`rounded-xl border transition-colors ${STATUS_BG[event.status] || STATUS_BG.error}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {getStatusBadge(event.status)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {contact && (
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                                  {contact}
                                </span>
                              )}
                              {phone && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  {phone}
                                </span>
                              )}
                            </div>
                            {preview && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5 max-w-[400px]">
                                {preview}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400" title={formatDateTime(event.received_at)}>
                            {formatRelative(event.received_at)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {event.error && !isExpanded && (
                        <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400 truncate">
                          {event.error}
                        </div>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-inherit pt-3 space-y-3">
                        {event.error && (
                          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
                              Motivo
                            </div>
                            <div className="text-xs text-red-700 dark:text-red-300">{event.error}</div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Data:</span>{' '}
                            <span className="text-slate-700 dark:text-slate-300">{formatDateTime(event.received_at)}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Status:</span>{' '}
                            <span className="text-slate-700 dark:text-slate-300">{STATUS_LABEL[event.status] || event.status}</span>
                          </div>
                          {event.external_event_id && (
                            <div className="col-span-2">
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Event ID:</span>{' '}
                              <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px] break-all">{event.external_event_id}</span>
                            </div>
                          )}
                          {event.created_contact_id && (
                            <div>
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Contato Criado:</span>{' '}
                              <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">{event.created_contact_id.slice(0, 8)}...</span>
                            </div>
                          )}
                          {event.created_deal_id && (
                            <div>
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Deal Criado:</span>{' '}
                              <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">{event.created_deal_id.slice(0, 8)}...</span>
                            </div>
                          )}
                        </div>

                        {event.payload && (
                          <details className="text-xs">
                            <summary className="cursor-pointer font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                              Payload Completo
                            </summary>
                            <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-slate-300 text-[11px] overflow-x-auto max-h-64 overflow-y-auto border border-slate-800">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Mensagens Recebidas (Inbound)
            <span className="text-[11px] font-normal text-slate-400">({messages.length} recentes)</span>
          </h4>

          {loading && messages.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              Carregando mensagens...
            </div>
          ) : messages.length === 0 ? (
            <div className="p-6 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
              <MessageCircle className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Nenhuma mensagem recebida</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Mensagens recebidas do WhatsApp aparecerão aqui.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10"
                >
                  <div className="shrink-0 mt-0.5">
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">
                        {msg.contact_name || msg.phone}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{msg.phone}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-medium">
                        {msg.message_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                      {msg.caption || msg.message}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-400" title={formatDateTime(msg.created_at)}>
                    {formatRelative(msg.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};
