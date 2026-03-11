import React, { useCallback, useMemo, useState } from 'react';
import { DealView, BoardStage } from '@/types';
import { DealCard } from './DealCard';
import { WhatsAppChatPanel } from './WhatsAppChatPanel';
import { isDealRotting, getActivityStatus } from '@/features/boards/hooks/useBoardsController';
import { MoveToStageModal } from '../Modals/MoveToStageModal';
import { useCRM } from '@/context/CRMContext';

function dropHighlightClasses(stageBgClass?: string): string {
  const c = (stageBgClass ?? '').toLowerCase();

  if (c.includes('blue') || c.includes('sky') || c.includes('cyan')) {
    return 'border-blue-500 bg-blue-100/20 dark:bg-blue-900/30 shadow-xl shadow-blue-500/30';
  }
  if (c.includes('green') || c.includes('emerald')) {
    return 'border-emerald-500 bg-emerald-100/20 dark:bg-emerald-900/30 shadow-xl shadow-emerald-500/30';
  }
  if (c.includes('yellow') || c.includes('amber')) {
    return 'border-amber-500 bg-amber-100/20 dark:bg-amber-900/30 shadow-xl shadow-amber-500/30';
  }
  if (c.includes('orange')) {
    return 'border-orange-500 bg-orange-100/20 dark:bg-orange-900/30 shadow-xl shadow-orange-500/30';
  }
  if (c.includes('red')) {
    return 'border-red-500 bg-red-100/20 dark:bg-red-900/30 shadow-xl shadow-red-500/30';
  }
  if (c.includes('violet') || c.includes('purple')) {
    return 'border-violet-500 bg-violet-100/20 dark:bg-violet-900/30 shadow-xl shadow-violet-500/30';
  }
  if (c.includes('pink') || c.includes('rose')) {
    return 'border-pink-500 bg-pink-100/20 dark:bg-pink-900/30 shadow-xl shadow-pink-500/30';
  }
  if (c.includes('indigo')) {
    return 'border-indigo-500 bg-indigo-100/20 dark:bg-indigo-900/30 shadow-xl shadow-indigo-500/30';
  }
  if (c.includes('teal')) {
    return 'border-teal-500 bg-teal-100/20 dark:bg-teal-900/30 shadow-xl shadow-teal-500/30';
  }

  return 'border-emerald-500 bg-emerald-100/20 dark:bg-emerald-900/30 shadow-xl shadow-emerald-500/30';
}

interface KanbanBoardProps {
  stages: BoardStage[];
  filteredDeals: DealView[];
  draggingId: string | null;
  handleDragStart: (e: React.DragEvent, id: string, title: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, stageId: string) => void;
  setSelectedDealId: (id: string | null) => void;
  openActivityMenuId: string | null;
  setOpenActivityMenuId: (id: string | null) => void;
  handleQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  onMoveDealToStage?: (dealId: string, newStageId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  stages,
  filteredDeals,
  draggingId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  onMoveDealToStage,
}) => {
  const { lifecycleStages, contacts } = useCRM();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [chatSession, setChatSession] = useState<{
    dealId: string;
    dealTitle: string;
    contactName: string;
    contactPhone: string;
  } | null>(null);

  const contactPhoneById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c?.id) map.set(c.id, c.phone || '');
    }
    return map;
  }, [contacts]);

  const contactPhoneByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts ?? []) {
      const email = (c?.email || '').trim().toLowerCase();
      if (email && c?.phone) map.set(email, c.phone);
    }
    return map;
  }, [contacts]);

  const contactPhoneByUniqueName = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    for (const c of contacts ?? []) {
      const name = (c?.name || '').trim().toLowerCase();
      const phone = (c?.phone || '').trim();
      if (!name || !phone) continue;
      if (!grouped.has(name)) grouped.set(name, new Set<string>());
      grouped.get(name)?.add(phone);
    }

    const map = new Map<string, string>();
    for (const [name, phones] of grouped.entries()) {
      if (phones.size === 1) {
        map.set(name, Array.from(phones)[0]);
      }
    }
    return map;
  }, [contacts]);

  const [moveToStageModal, setMoveToStageModal] = useState<{
    isOpen: boolean;
    deal: DealView;
    currentStageId: string;
  } | null>(null);

  const dealsByStageId = useMemo(() => {
    const map = new Map<string, DealView[]>();
    const totals = new Map<string, number>();
    for (const deal of filteredDeals) {
      const list = map.get(deal.status);
      if (list) list.push(deal);
      else map.set(deal.status, [deal]);

      totals.set(deal.status, (totals.get(deal.status) ?? 0) + (deal.value ?? 0));
    }
    return { map, totals };
  }, [filteredDeals]);

  const lifecycleStageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ls of lifecycleStages ?? []) {
      if (ls?.id && ls?.name) map.set(ls.id, ls.name);
    }
    return map;
  }, [lifecycleStages]);

  const dealsById = useMemo(() => new Map(filteredDeals.map((d) => [d.id, d])), [filteredDeals]);

  const handleSelectDeal = useCallback(
    (dealId: string) => {
      setSelectedDealId(dealId);
    },
    [setSelectedDealId]
  );

  const handleOpenMoveToStage = useCallback(
    (dealId: string) => {
      const deal = dealsById.get(dealId);
      if (!deal) return;
      setMoveToStageModal({
        isOpen: true,
        deal,
        currentStageId: deal.status,
      });
    },
    [dealsById]
  );

  const handleConfirmMoveToStage = (dealId: string, newStageId: string) => {
    if (onMoveDealToStage) {
      onMoveDealToStage(dealId, newStageId);
    }
    setMoveToStageModal(null);
  };

  const handleOpenWhatsAppChat = useCallback(
    (input: { dealId: string; dealTitle: string; contactName: string; contactPhone: string }) => {
      setChatSession(input);
    },
    []
  );

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-2 w-full">
      {stages.map(stage => {
        const stageDeals = dealsByStageId.map.get(stage.id) ?? [];
        const stageValue = dealsByStageId.totals.get(stage.id) ?? 0;
        const isOver = dragOverStage === stage.id && draggingId !== null;

        const linkedStageName =
          stage.linkedLifecycleStage
            ? lifecycleStageNameById.get(stage.linkedLifecycleStage) ?? null
            : null;

        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              handleDragOver(e);
              setDragOverStage(stage.id);
            }}
            onDrop={(e) => {
              handleDrop(e, stage.id);
              setDragOverStage(null);
            }}
            onDragEnter={() => setDragOverStage(stage.id)}
            onDragLeave={() => setDragOverStage(null)}
            className={`min-w-[20rem] flex-1 flex flex-col rounded-xl border-2 overflow-visible h-full max-h-full transition-all duration-200
              ${isOver ? `${dropHighlightClasses(stage.color)} scale-[1.02]` : 'border-slate-200/50 dark:border-white/10 glass'}
            `}
          >
            <div className={`h-1.5 w-full ${stage.color}`}></div>

            <div className="p-3 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 shrink-0">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-200 font-display text-sm tracking-wide uppercase">
                  {stage.label}
                </span>
                <span className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                  {stageDeals.length}
                </span>
              </div>

              <div className="mb-2 flex items-center gap-1.5 min-h-[22px]">
                {linkedStageName ? (
                  <span className="text-[10px] uppercase font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-1.5 py-0.5 rounded border border-primary-100 dark:border-primary-800/50 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-primary-500 animate-pulse"></span>
                    Promove para: {linkedStageName}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 opacity-0 select-none">Placeholder</span>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium text-right">
                Total: <span className="text-slate-900 dark:text-white font-mono">${stageValue.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex-1 p-2 overflow-y-auto space-y-2 bg-slate-100/50 dark:bg-black/20 scrollbar-thin min-h-[100px]">
              {stageDeals.length === 0 && !draggingId && (
                <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm py-8">
                  Sem negocios
                </div>
              )}
              {isOver && stageDeals.length === 0 && (
                <div className="h-full flex items-center justify-center text-green-500 dark:text-green-400 text-sm py-8 font-bold animate-pulse pointer-events-none">
                  Solte aqui!
                </div>
              )}

              {stageDeals.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  contactPhoneOverride={
                    deal.contactId
                      ? (contactPhoneById.get(deal.contactId) || '')
                      : (deal.contactEmail
                          ? (contactPhoneByEmail.get((deal.contactEmail || '').trim().toLowerCase()) || '')
                          : (deal.contactName && deal.contactName !== 'Sem Contato'
                              ? (contactPhoneByUniqueName.get((deal.contactName || '').trim().toLowerCase()) || '')
                              : ''))
                  }
                  isRotting={isDealRotting(deal) && !deal.isWon && !deal.isLost}
                  activityStatus={getActivityStatus(deal)}
                  isDragging={draggingId === deal.id}
                  onDragStart={handleDragStart}
                  onSelect={handleSelectDeal}
                  isMenuOpen={openActivityMenuId === deal.id}
                  setOpenMenuId={setOpenActivityMenuId}
                  onQuickAddActivity={handleQuickAddActivity}
                  onOpenWhatsAppChat={handleOpenWhatsAppChat}
                  setLastMouseDownDealId={setLastMouseDownDealId}
                  onMoveToStage={onMoveDealToStage ? handleOpenMoveToStage : undefined}
                />
              ))}
            </div>
          </div>
        );
      })}

      {moveToStageModal && (
        <MoveToStageModal
          isOpen={moveToStageModal.isOpen}
          onClose={() => setMoveToStageModal(null)}
          onMove={handleConfirmMoveToStage}
          deal={moveToStageModal.deal}
          stages={stages}
          currentStageId={moveToStageModal.currentStageId}
        />
      )}

      {chatSession && (
        <WhatsAppChatPanel
          isOpen
          contactName={chatSession.contactName}
          phone={chatSession.contactPhone}
          dealTitle={chatSession.dealTitle}
          onClose={() => setChatSession(null)}
        />
      )}
    </div>
  );
};
