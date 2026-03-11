import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, List, MessageCircle, MessageSquare, Shield, UserRound, Users, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { SettingsSection } from './SettingsSection';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils/cn';

type ConfigTab = 'auth' | 'intervals' | 'settings';
type ListType = 'buttons' | 'numeric';

type EvolutionConfig = {
  connectionName: string;
  instanceUrl: string;
  instanceName: string;
  apiKey: string;
  typingEnabled: boolean;
  typingIntervalMinSeconds: number;
  typingIntervalMaxSeconds: number;
  listenGroups: boolean;
  listType: ListType;
  restoreEnabled: boolean;
  restoreFrom: string;
  restoreTo: string;
};

const DEFAULT_CONFIG: EvolutionConfig = {
  connectionName: '',
  instanceUrl: '',
  instanceName: '',
  apiKey: '',
  typingEnabled: false,
  typingIntervalMinSeconds: 0,
  typingIntervalMaxSeconds: 2,
  listenGroups: false,
  listType: 'buttons',
  restoreEnabled: false,
  restoreFrom: '',
  restoreTo: '',
};

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
        checked ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-1'
        )}
      />
    </button>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900/50 px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus-visible-ring';

export const WhatsAppChannelsSection: React.FC = () => {
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigTab>('auth');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EvolutionConfig>(DEFAULT_CONFIG);

  const hasBasicConfig = useMemo(() => {
    return Boolean(config.instanceUrl && config.instanceName && config.apiKey);
  }, [config.instanceUrl, config.instanceName, config.apiKey]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/integrations/whatsapp/evolution/config', { cache: 'no-store' });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error((json && typeof json.error === 'string' && json.error) || 'Falha ao carregar configuracao.');
        }

        if (!cancelled && json && typeof json === 'object') {
          setConfig({
            connectionName: String((json as any).connectionName ?? ''),
            instanceUrl: String((json as any).instanceUrl ?? ''),
            instanceName: String((json as any).instanceName ?? ''),
            apiKey: String((json as any).apiKey ?? ''),
            typingEnabled: Boolean((json as any).typingEnabled ?? false),
            typingIntervalMinSeconds: Number((json as any).typingIntervalMinSeconds ?? 0),
            typingIntervalMaxSeconds: Number((json as any).typingIntervalMaxSeconds ?? 2),
            listenGroups: Boolean((json as any).listenGroups ?? false),
            listType: ((json as any).listType === 'numeric' ? 'numeric' : 'buttons') as ListType,
            restoreEnabled: Boolean((json as any).restoreEnabled ?? false),
            restoreFrom: String((json as any).restoreFrom ?? ''),
            restoreTo: String((json as any).restoreTo ?? ''),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nao foi possivel carregar configuracao.';
        addToast(message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, addToast]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/evolution/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((json && typeof json.error === 'string' && json.error) || 'Falha ao salvar configuracao.');
      }

      addToast('Conexao da Evolution salva com sucesso.', 'success');
      setIsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel salvar configuracao.';
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const channels = [
    { id: 'whatsapp', label: 'Whatsapp', active: true },
    { id: 'instagram', label: 'Instagram', active: false },
    { id: 'messenger', label: 'Messenger', active: false },
  ] as const;

  return (
    <SettingsSection
      title="Canais de Mensagem"
      icon={MessageCircle}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Configure o canal WhatsApp (Evolution API) com uma experiencia guiada para o usuario.</p>
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Canal WhatsApp</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {hasBasicConfig ? 'Conexao pronta para envio com Evolution API.' : 'Conexao ainda nao configurada.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveTab('auth');
            setIsOpen(true);
          }}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          {hasBasicConfig ? 'Editar conexao' : 'Cadastrar conexao'}
        </button>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title=" "
        size="xl"
        className="max-w-5xl w-[96vw] p-0 [&>div:first-child]:hidden"
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-1 md:grid-cols-[170px,1fr] min-h-[640px]">
          <aside className="border-r border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 p-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                disabled={!channel.active}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg text-lg font-semibold transition-colors mb-1',
                  channel.id === 'whatsapp'
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10',
                  !channel.active && 'opacity-80'
                )}
              >
                {channel.label}
              </button>
            ))}
          </aside>

          <div className="p-6 relative">
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setIsOpen(false)}
              className="absolute right-5 top-5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              <X size={24} />
            </button>

            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300 mb-1">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span className="text-lg">Evolution API</span>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">Cadastrar conexao</h2>

            <div className="mb-6">
              <label className="block text-sm md:text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">Nome da conexao</label>
              <input
                value={config.connectionName}
                onChange={(e) => setConfig((prev) => ({ ...prev, connectionName: e.target.value }))}
                placeholder="Nome da conexao"
                className={inputClass}
              />
            </div>

            <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 mb-6">
              {([
                { id: 'auth', label: 'Autenticacao' },
                { id: 'intervals', label: 'Intervalos' },
                { id: 'settings', label: 'Configuracoes' },
              ] as const).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'px-4 py-2 text-sm md:text-base font-medium border-b-2 transition-colors',
                      isActive
                        ? 'border-blue-500 text-slate-900 dark:text-white'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="min-h-[320px] max-h-[360px] overflow-y-auto pr-1">
              {activeTab === 'auth' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm md:text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">URL da instancia</label>
                    <input
                      value={config.instanceUrl}
                      onChange={(e) => setConfig((prev) => ({ ...prev, instanceUrl: e.target.value }))}
                      placeholder="URL da instancia do Evolution API"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm md:text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">Nome da instancia</label>
                    <input
                      value={config.instanceName}
                      onChange={(e) => setConfig((prev) => ({ ...prev, instanceName: e.target.value }))}
                      placeholder="Nome da instancia do Evolution API"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm md:text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">Chave de API</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Acesse o Evolution Manager para obter a chave de API.</p>
                    <div className="relative">
                      <input
                        value={config.apiKey}
                        onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="Token de seguranca da Evolution API"
                        className={cn(inputClass, 'pr-10')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        title={showApiKey ? 'Ocultar chave' : 'Mostrar chave'}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'intervals' && (
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <MessageSquare size={18} /> Intervalo da animacao de "Digitando..."
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <span>Entre</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={config.typingIntervalMinSeconds}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, typingIntervalMinSeconds: Number(e.target.value || 0) }))
                          }
                          className="w-20 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900/40 px-3 py-1.5"
                        />
                        <span>e</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={config.typingIntervalMaxSeconds}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, typingIntervalMaxSeconds: Number(e.target.value || 0) }))
                          }
                          className="w-20 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900/40 px-3 py-1.5"
                        />
                        <span>segundos</span>
                      </div>
                    </div>
                    <Switch
                      checked={config.typingEnabled}
                      onChange={(next) => setConfig((prev) => ({ ...prev, typingEnabled: next }))}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Users size={18} /> Ouvir grupos
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">Receber mensagens enviadas em grupos</p>
                      </div>
                      <Switch
                        checked={config.listenGroups}
                        onChange={(next) => setConfig((prev) => ({ ...prev, listenGroups: next }))}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                    <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                      <List size={18} /> Tipo de lista
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 mb-3">Configure como as listas de opcoes serao enviadas</p>

                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, listType: 'buttons' }))}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 mb-2 transition-colors',
                        config.listType === 'buttons'
                          ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-slate-300 dark:border-white/10'
                      )}
                    >
                      <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <UserRound size={16} /> Botoes Interativos
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">Mensagem com botoes clicaveis</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, listType: 'numeric' }))}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 transition-colors',
                        config.listType === 'numeric'
                          ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-slate-300 dark:border-white/10'
                      )}
                    >
                      <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <List size={16} /> Lista Numerica
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">Opcoes numeradas (1, 2, 3...)</p>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                    <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white mb-1">Restaurar mensagens</p>
                    <p className="text-slate-500 dark:text-slate-400 mb-3">Recuperar mensagens anteriores a conexao</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                      <input
                        type="date"
                        value={config.restoreFrom}
                        onChange={(e) => setConfig((prev) => ({ ...prev, restoreFrom: e.target.value }))}
                        className={inputClass}
                      />
                      <input
                        type="date"
                        value={config.restoreTo}
                        onChange={(e) => setConfig((prev) => ({ ...prev, restoreTo: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Switch
                        checked={config.restoreEnabled}
                        onChange={(next) => setConfig((prev) => ({ ...prev, restoreEnabled: next }))}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({ ...prev, restoreEnabled: true }));
                          addToast('Periodo de restauracao preparado. Salve para aplicar.', 'info');
                        }}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                      >
                        Restaurar Mensagens
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Shield size={14} /> Ao continuar, voce concorda com nossos <span className="text-blue-600">Termos de Uso</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={saving || loading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold"
                >
                  {saving ? 'Salvando...' : 'Finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </SettingsSection>
  );
};