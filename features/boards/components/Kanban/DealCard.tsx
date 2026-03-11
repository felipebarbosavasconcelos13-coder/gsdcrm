import React, { useState } from 'react';
import Image from 'next/image';
import { DealView } from '@/types';
import { Building2, Hourglass, MessageCircle, Trophy, XCircle } from 'lucide-react';
import { ActivityStatusIcon } from './ActivityStatusIcon';
import { priorityAriaLabelPtBr } from '@/lib/utils/priority';
import { toWhatsAppPhone } from '@/lib/phone';

interface DealCardProps {
  deal: DealView;
  contactPhoneOverride?: string;
  isRotting: boolean;
  activityStatus: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string, title: string) => void;
  onSelect: (dealId: string) => void;
  isMenuOpen: boolean;
  setOpenMenuId: (id: string | null) => void;
  onQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  onOpenWhatsAppChat?: (input: {
    dealId: string;
    dealTitle: string;
    contactName: string;
    contactPhone: string;
  }) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  onMoveToStage?: (dealId: string) => void;
}

const isDealClosed = (deal: DealView) => deal.isWon || deal.isLost;
const getPriorityLabel = (priority: string | undefined) => priorityAriaLabelPtBr(priority);

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const buildWhatsAppUrl = (phoneRaw?: string, contactName?: string) => {
  const phone = toWhatsAppPhone(phoneRaw || '');
  if (!phone) return null;

  const greeting = contactName ? `Oi, ${contactName}! ` : 'Oi! ';
  const text = encodeURIComponent(`${greeting}Tudo bem?`);
  return `https://wa.me/${phone}?text=${text}`;
};

const DealCardComponent: React.FC<DealCardProps> = ({
  deal,
  contactPhoneOverride,
  isRotting,
  activityStatus,
  isDragging,
  onDragStart,
  onSelect,
  isMenuOpen,
  setOpenMenuId,
  onQuickAddActivity,
  onOpenWhatsAppChat,
  setLastMouseDownDealId,
  onMoveToStage,
}) => {
  const [localDragging, setLocalDragging] = useState(false);
  const isClosed = isDealClosed(deal);

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(isMenuOpen ? null : deal.id);
  };

  const handleQuickAdd = (type: 'CALL' | 'MEETING' | 'EMAIL') => {
    onQuickAddActivity(deal.id, type, deal.title);
  };

  const resolvedPhone = deal.contactPhone || contactPhoneOverride || '';
  const whatsappUrl = buildWhatsAppUrl(resolvedPhone, deal.contactName);

  const handleOpenWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!whatsappUrl) return;

    if (onOpenWhatsAppChat) {
      onOpenWhatsAppChat({
        dealId: deal.id,
        dealTitle: deal.title || '',
        contactName: deal.contactName || 'Contato',
        contactPhone: resolvedPhone,
      });
      return;
    }

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDragStart = (e: React.DragEvent) => {
    setLocalDragging(true);
    e.dataTransfer.setData('dealId', deal.id);
    e.dataTransfer.setData('dealTitle', deal.title || '');
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(e, deal.id, deal.title || '');
  };

  const handleDragEnd = () => {
    setLocalDragging(false);
  };

  const getCardClasses = () => {
    const baseClasses = `
      p-3 rounded-lg border-l-4 border-y border-r
      shadow-sm cursor-grab active:cursor-grabbing group hover:shadow-md transition-all relative select-none
    `;

    if (deal.isWon) {
      return `${baseClasses}
        bg-green-50 dark:bg-green-900/20
        border-green-200 dark:border-green-700/50
        ${localDragging || isDragging ? 'opacity-50 rotate-2 scale-95' : ''}`;
    }

    if (deal.isLost) {
      return `${baseClasses}
        bg-red-50 dark:bg-red-900/20
        border-red-200 dark:border-red-700/50
        ${localDragging || isDragging ? 'opacity-50 rotate-2 scale-95' : 'opacity-70'}`;
    }

    return `${baseClasses}
      border-slate-200 dark:border-slate-700/50
      ${localDragging || isDragging ? 'bg-green-100 dark:bg-green-900 opacity-50 rotate-2 scale-95' : 'bg-white dark:bg-slate-800 opacity-100'}
      ${isRotting ? 'opacity-80 saturate-50 border-dashed' : ''}
    `;
  };

  const getBorderLeftClass = () => {
    if (deal.isWon) return '!border-l-green-500';
    if (deal.isLost) return '!border-l-red-500';
    if (deal.priority === 'high') return '!border-l-red-500';
    if (deal.priority === 'medium') return '!border-l-amber-500';
    return '!border-l-blue-500';
  };

  const getAriaLabel = () => {
    const parts: string[] = [];

    if (deal.isWon) parts.push('ganho');
    if (deal.isLost) parts.push('perdido');

    const shownTags = deal.tags.slice(0, isClosed ? 1 : 2);
    if (shownTags.length > 0) {
      parts.push(...shownTags);
    }

    parts.push(deal.title);
    if (deal.companyName) parts.push(deal.companyName);
    parts.push(`$${deal.value.toLocaleString()}`);

    const priority = getPriorityLabel(deal.priority);
    if (priority) parts.push(priority);
    if (isRotting && !isClosed) parts.push('estagnado');

    return parts.join(', ');
  };

  return (
    <div
      data-deal-id={deal.id}
      draggable={!deal.id.startsWith('temp-')}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseDown={() => setLastMouseDownDealId(deal.id)}
      onClick={e => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect(deal.id);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!(e.target as HTMLElement).closest('button')) {
            onSelect(deal.id);
          }
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={getAriaLabel()}
      className={`${getCardClasses()} ${getBorderLeftClass()}`}
    >
      {deal.isWon && (
        <div
          className="absolute -top-2 -right-2 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 p-1 rounded-full shadow-sm z-10 flex items-center gap-0.5"
          aria-label="Negocio ganho"
        >
          <Trophy size={12} aria-hidden="true" />
        </div>
      )}

      {deal.isLost && (
        <div
          className="absolute -top-2 -right-2 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 p-1 rounded-full shadow-sm z-10 flex items-center gap-0.5"
          aria-label={deal.lossReason ? `Perdido: ${deal.lossReason}` : 'Negocio perdido'}
        >
          <XCircle size={12} aria-hidden="true" />
        </div>
      )}

      {isRotting && !isClosed && (
        <div
          className="absolute -top-2 -right-2 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 p-1 rounded-full shadow-sm z-10"
          aria-label="Negocio estagnado"
        >
          <Hourglass size={12} aria-hidden="true" />
        </div>
      )}

      <div className="flex gap-1 mb-2 flex-wrap">
        {deal.isWon && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-800/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
            GANHO
          </span>
        )}
        {deal.isLost && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
            PERDIDO
          </span>
        )}
        {deal.tags.slice(0, isClosed ? 1 : 2).map((tag, index) => (
          <span
            key={`${deal.id}-tag-${index}`}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5"
          >
            {tag}
          </span>
        ))}
      </div>

      <h4
        className={`text-sm font-bold font-display leading-snug mb-0.5 ${isRotting ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}
      >
        {deal.title}
      </h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
        <Building2 size={10} aria-hidden="true" /> {deal.companyName}
      </p>

      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          {deal.owner && deal.owner.name !== 'Sem Dono' && (
            deal.owner.avatar ? (
              <Image
                src={deal.owner.avatar}
                alt={`Responsavel: ${deal.owner.name}`}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full ring-1 ring-white dark:ring-slate-800"
                title={`Responsavel: ${deal.owner.name}`}
                unoptimized
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 flex items-center justify-center text-[9px] font-bold ring-1 ring-white dark:ring-slate-800"
                title={`Responsavel: ${deal.owner.name}`}
              >
                {getInitials(deal.owner.name)}
              </div>
            )
          )}
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 font-mono">
            ${deal.value.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            disabled={!whatsappUrl}
            title={whatsappUrl ? 'Abrir chat WhatsApp' : 'Contato sem telefone para WhatsApp'}
            aria-label={whatsappUrl ? `Abrir chat WhatsApp para ${deal.contactName}` : 'Contato sem telefone para WhatsApp'}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <MessageCircle size={16} />
          </button>
          <ActivityStatusIcon
            status={activityStatus}
            type={deal.nextActivity?.type}
            dealId={deal.id}
            dealTitle={deal.title}
            isOpen={isMenuOpen}
            onToggle={handleToggleMenu}
            onQuickAdd={handleQuickAdd}
            onRequestClose={() => setOpenMenuId(null)}
            onMoveToStage={onMoveToStage ? () => onMoveToStage(deal.id) : undefined}
          />
        </div>
      </div>
    </div>
  );
};

export const DealCard = React.memo(DealCardComponent);
