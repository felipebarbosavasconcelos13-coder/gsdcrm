import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  FileText,
  ImageIcon,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  Square,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { toWhatsAppPhone } from '@/lib/phone';
import { useOptionalToast } from '@/context/ToastContext';

type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'unknown';

type WhatsAppMessage = {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: 'in' | 'out';
  message: string;
  provider: string;
  external_message_id: string | null;
  created_at: string;
  message_type?: WhatsAppMessageType | null;
  caption?: string | null;
  media_url?: string | null;
  media_base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  media_seconds?: number | null;
  media_width?: number | null;
  media_height?: number | null;
};

type PendingAttachment = {
  messageType: 'image' | 'video' | 'audio' | 'document';
  media: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

type Props = {
  isOpen: boolean;
  contactName: string;
  phone: string;
  contactAvatar?: string;
  dealTitle?: string;
  onClose: () => void;
};

const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File) {
  return readBlobAsDataUrl(file);
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Falha ao ler arquivo.'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(blob);
  });
}

function getRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

function messageTypeFromMime(mimeType: string): PendingAttachment['messageType'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function getMediaSrc(message: WhatsAppMessage) {
  // Preferir base64 tocavel: WhatsApp entrega midia recebida como URL `.enc`
  // criptografada da CDN, que o navegador nao consegue reproduzir.
  const value = message.media_base64;
  if (value) {
    if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return value;
    return `data:${message.mime_type || 'application/octet-stream'};base64,${value}`;
  }
  const url = message.media_url;
  if (url && /^https?:\/\//i.test(url) && !/\.enc(\?|$)/i.test(url)) return url;
  return '';
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'C';
}

function MediaIcon({ type }: { type: WhatsAppMessageType }) {
  if (type === 'image' || type === 'sticker') return <ImageIcon size={16} />;
  if (type === 'video') return <Video size={16} />;
  if (type === 'audio') return <Mic size={16} />;
  return <FileText size={16} />;
}

export function WhatsAppChatPanel({ isOpen, contactName, phone, contactAvatar, dealTitle, onClose }: Props) {
  const { addToast } = useOptionalToast();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const normalizedPhone = useMemo(() => {
    const digits = toWhatsAppPhone(phone);
    return digits ? `+${digits}` : '';
  }, [phone]);

  const avatarUrl = contactAvatar?.trim() || '';
  const showAvatar = Boolean(avatarUrl && !avatarFailed);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

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

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      addToast('Arquivo acima de 12 MB. Escolha um arquivo menor.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const mimeType = file.type || 'application/octet-stream';
      const media = await readFileAsDataUrl(file);
      setAttachment({
        messageType: messageTypeFromMime(mimeType),
        media,
        mimeType,
        fileName: file.name || 'arquivo',
        fileSize: file.size,
      });
    } catch {
      addToast('Falha ao preparar anexo.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const finishRecording = async () => {
    const recorder = mediaRecorderRef.current;
    const mimeType = recorder?.mimeType || getRecordingMimeType() || 'audio/webm';
    const blob = new Blob(recordingChunksRef.current, { type: mimeType });

    recordingChunksRef.current = [];
    mediaRecorderRef.current = null;
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
    setRecordingSeconds(0);

    if (!blob.size) {
      addToast('Audio vazio. Tente gravar novamente.', 'error');
      return;
    }

    if (blob.size > MAX_ATTACHMENT_BYTES) {
      addToast('Audio acima de 12 MB. Grave uma mensagem menor.', 'error');
      return;
    }

    try {
      const media = await readBlobAsDataUrl(blob);
      setAttachment({
        messageType: 'audio',
        media,
        mimeType,
        fileName: `audio-${Date.now()}.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`,
        fileSize: blob.size,
      });
    } catch {
      addToast('Falha ao preparar audio.', 'error');
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      addToast('Gravacao de audio nao suportada neste navegador.', 'error');
      return;
    }

    try {
      setAttachment(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording();
      };
      recorder.onerror = () => {
        addToast('Falha durante a gravacao de audio.', 'error');
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
    } catch {
      addToast('Nao foi possivel acessar o microfone.', 'error');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !attachment) || !normalizedPhone) return;

    setSending(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/evolution/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          message: text,
          contactName,
          messageType: attachment?.messageType ?? 'text',
          media: attachment?.media,
          mimeType: attachment?.mimeType,
          fileName: attachment?.fileName,
          fileSize: attachment?.fileSize,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const error = json && typeof json.error === 'string' ? json.error : 'Falha ao enviar mensagem.';
        addToast(error, 'error');
        return;
      }

      setDraft('');
      setAttachment(null);
      await loadMessages();
    } catch {
      addToast('Falha ao enviar mensagem.', 'error');
    } finally {
      setSending(false);
    }
  };

  const renderMessageMedia = (message: WhatsAppMessage) => {
    const type = message.message_type || 'text';
    if (type === 'text') return null;

    const src = getMediaSrc(message);
    const fileName = message.file_name || message.caption || 'Arquivo';

    if ((type === 'image' || type === 'sticker') && src) {
      return (
        <Image
          src={src}
          alt={fileName}
          width={320}
          height={240}
          unoptimized
          className="mb-2 max-h-64 w-full rounded-lg object-cover"
        />
      );
    }

    if (type === 'video' && src) {
      return <video src={src} controls className="mb-2 max-h-64 w-full rounded-lg bg-black" />;
    }

    if (type === 'audio' && src) {
      return <audio src={src} controls className="mb-2 w-full min-w-56" />;
    }

    return (
      <a
        href={src || undefined}
        download={message.file_name || undefined}
        target={src ? '_blank' : undefined}
        rel={src ? 'noreferrer' : undefined}
        className="mb-2 flex items-center gap-2 rounded-lg border border-current/15 bg-black/5 px-3 py-2 text-xs hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <MediaIcon type={type} />
        <span className="min-w-0 flex-1 truncate">{fileName}</span>
        {message.file_size ? <span className="shrink-0 opacity-70">{formatFileSize(message.file_size)}</span> : null}
      </a>
    );
  };

  if (!isOpen) return null;

  const canSend = Boolean((draft.trim() || attachment) && normalizedPhone && isConfigured && !sending && !isRecording);

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex h-[min(78vh,700px)] w-[min(460px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-500/15 text-sm font-bold text-cyan-100 ring-1 ring-cyan-500/25">
            {showAvatar ? (
              <Image
                src={avatarUrl}
                alt={contactName ? `Foto de ${contactName}` : 'Foto do contato'}
                width={40}
                height={40}
                className="h-full w-full object-cover"
                unoptimized
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              getInitials(contactName)
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900 dark:text-white">{contactName}</div>
            <div className="truncate text-xs text-emerald-600 dark:text-emerald-400">
              {normalizedPhone || 'Sem telefone'}
              {dealTitle ? ` - ${dealTitle}` : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Fechar chat"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-100/60 p-3 dark:bg-slate-950/70">
        {loading && messages.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Carregando mensagens...</div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <MessageCircle className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Ainda sem mensagens neste chat.</p>
          </div>
        ) : null}

        {messages.map((message) => {
          const text = message.message || message.caption || '';

          return (
            <div
              key={message.id}
              className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                message.direction === 'out'
                  ? 'ml-auto bg-blue-600 text-white'
                  : 'mr-auto border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {renderMessageMedia(message)}
              {text ? <div className="whitespace-pre-wrap break-words">{text}</div> : null}
              <div
                className={`mt-1 text-[11px] ${
                  message.direction === 'out' ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {formatTime(message.created_at)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
        {!isConfigured ? (
          <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            Evolution API nao configurada para esta organizacao.
          </div>
        ) : null}

        {attachment ? (
          <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
            <div className="flex items-center gap-2">
              <MediaIcon type={attachment.messageType} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{attachment.fileName}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {attachment.messageType} {formatFileSize(attachment.fileSize)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Remover anexo"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {attachment.messageType === 'audio' ? <audio src={attachment.media} controls className="mt-2 w-full" /> : null}
          </div>
        ) : null}

        {isRecording ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="font-medium">Gravando audio</span>
            <span className="text-xs opacity-80">{recordingSeconds}s</span>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          onChange={(event) => void handleFileSelected(event.target.files?.[0] ?? null)}
        />

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!normalizedPhone || sending || !isConfigured || isRecording}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
            aria-label="Anexar arquivo"
            title="Anexar arquivo"
          >
            <Paperclip size={17} />
          </button>
          <button
            type="button"
            onClick={() => (isRecording ? stopRecording() : void startRecording())}
            disabled={!normalizedPhone || sending || !isConfigured}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border disabled:cursor-not-allowed disabled:opacity-50 ${
              isRecording
                ? 'border-red-500 bg-red-600 text-white hover:bg-red-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10'
            }`}
            aria-label={isRecording ? 'Parar gravacao' : 'Gravar audio'}
            title={isRecording ? 'Parar gravacao' : 'Gravar audio'}
          >
            {isRecording ? <Square size={15} /> : <Mic size={17} />}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              normalizedPhone
                ? isRecording
                  ? 'Gravando audio...'
                  : attachment
                  ? 'Legenda opcional...'
                  : 'Digite uma mensagem...'
                : 'Contato sem telefone'
            }
            disabled={!normalizedPhone || sending || !isConfigured || isRecording}
            rows={2}
            className="min-h-[44px] max-h-28 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Enviar mensagem"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
