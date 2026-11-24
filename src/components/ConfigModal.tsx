import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudUpload,
  Download,
  Layers,
  LogIn,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  PeriodoId,
  SemestreConfig,
  UserEvento,
  UserFalta,
  UserMateria,
  UserProfile,
} from '../types/domain';
import { getPeriodoStyle } from '../utils/attendance';
import { sanitizeAuthorDisplayName } from '../utils/disciplinaKey';

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  isPreviewMode: boolean;
  isAdmin: boolean;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  hasLocalPreviewToMigrate: boolean;
  onSavePreferences: (updates: {
    displayName?: string;
    periodoAtual?: PeriodoId;
    percentualPadrao?: number;
  }) => Promise<void>;
  onApplyPercentualAll: (percentual: number) => Promise<number>;
  onImportPreviewToCloud: () => Promise<{
    importedMaterias: number;
    importedFaltas: number;
    importedEventos: number;
  }>;
  onDismissMigrationBanner: () => void;
  onAuthAction: () => void;
  onOpenGrade: () => void;
}

const PERIODOS: PeriodoId[] = ['1', '2', '3', '4', '5', '6', '7', '8', 'optativa'];

export const ConfigModal: React.FC<ConfigModalProps> = ({
  open,
  onClose,
  userProfile,
  isPreviewMode,
  isAdmin,
  semestreConfig,
  materias,
  faltas,
  eventos,
  hasLocalPreviewToMigrate,
  onSavePreferences,
  onApplyPercentualAll,
  onImportPreviewToCloud,
  onDismissMigrationBanner,
  onAuthAction,
  onOpenGrade,
}) => {
  const [displayName, setDisplayName] = useState(userProfile?.displayName || 'Estudante');
  const [periodoAtual, setPeriodoAtual] = useState<PeriodoId>(
    userProfile?.periodoAtual || '4'
  );
  const [percentualPadrao, setPercentualPadrao] = useState<number>(
    userProfile?.percentualPadrao ?? 25
  );
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(userProfile?.displayName || 'Estudante');
    setPeriodoAtual(userProfile?.periodoAtual || '4');
    setPercentualPadrao(userProfile?.percentualPadrao ?? 25);
    setFeedback(null);
    setErrorMsg(null);
  }, [open, userProfile?.displayName, userProfile?.percentualPadrao, userProfile?.periodoAtual]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const previewAuthorName = sanitizeAuthorDisplayName(displayName, userProfile?.email);

  const handleSubmitPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onSavePreferences({
        displayName: previewAuthorName,
        periodoAtual,
        percentualPadrao,
      });
      setDisplayName(previewAuthorName);
      setFeedback(
        isPreviewMode
          ? 'Nome e preferências salvos localmente neste navegador.'
          : 'Nome e preferências sincronizados com seu e-mail e avisos coletivos!'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar preferências.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleApplyAllClick = async () => {
    setApplyingAll(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const clamped = Math.max(1, Math.min(99, Math.round(percentualPadrao || 25)));
      const updatedCount = await onApplyPercentualAll(clamped);
      await onSavePreferences({ percentualPadrao: clamped });
      setFeedback(
        updatedCount > 0
          ? `Limite de ${clamped}% aplicado em todas as ${updatedCount} disciplina(s) da sua grade.`
          : 'Nenhuma disciplina cadastrada ainda para atualizar.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar limites.');
    } finally {
      setApplyingAll(false);
    }
  };

  const handleMigrateClick = async () => {
    setMigrating(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await onImportPreviewToCloud();
      setFeedback(
        `Sincronização concluída: ${res.importedMaterias} matéria(s), ${res.importedFaltas} registro(s) e ${res.importedEventos} evento(s) enviados para sua conta.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao importar dados do preview.');
    } finally {
      setMigrating(false);
    }
  };

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      semestre: semestreConfig,
      profile: {
        displayName: previewAuthorName,
        email: userProfile?.email || '',
        periodoAtual,
        percentualPadrao,
      },
      materias,
      faltas,
      eventos,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faltei-backup-${semestreConfig.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setFeedback('Backup JSON exportado para o seu dispositivo.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#09113B]/55 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-modal-title"
        className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl border-[1.5px] border-[#CBD5E1] shadow-2xl p-5 sm:p-6 space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0E1A59] text-white flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="config-modal-title"
                className="text-lg font-black text-[#0E1A59] leading-tight"
              >
                Configurações e Sincronização
              </h2>
              <p className="text-xs font-semibold text-[#475569]">
                Nome público nos avisos, vínculo de e-mail e preferências da grade
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="min-h-[40px] min-w-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#0E1A59] hover:border-[#0E1A59] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Account & Email Sync Card */}
        <section className="rounded-2xl bg-[#E6E9F0]/65 border-[1.5px] border-[#CBD5E1] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-4 h-4 text-[#0E1A59] shrink-0" aria-hidden="true" />
              <span className="text-xs font-extrabold text-[#0E1A59] truncate">
                {userProfile?.email || 'Preview local (sem e-mail)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isAdmin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FCE7F3] text-[#BE185D] text-[10px] font-extrabold">
                  <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                  Admin
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isPreviewMode
                    ? 'bg-[#FEF3C7] text-[#B45309]'
                    : 'bg-[#DCFCE7] text-[#15803D]'
                }`}
              >
                <Cloud className="w-3 h-3" aria-hidden="true" />
                {isPreviewMode ? 'Preview local' : 'Sincronizado na nuvem'}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#475569] leading-relaxed">
            {isPreviewMode
              ? 'Você está testando em modo preview local. Entre com seu e-mail ou Google para acessar suas faltas, calendário e nome em qualquer celular ou computador.'
              : 'Tudo o que você marca no Dashboard, Calendário e Grade é sincronizado em tempo real com sua conta de e-mail para acesso em qualquer dispositivo.'}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onAuthAction();
              }}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors ${
                isPreviewMode
                  ? 'bg-[#EC1580] text-white hover:bg-[#d11170]'
                  : 'bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] hover:border-[#0E1A59]'
              }`}
            >
              {isPreviewMode ? (
                <>
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Entrar ou criar conta com e-mail</span>
                </>
              ) : (
                <>
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Trocar conta / Sair</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Optional Preview -> Cloud Migration Banner */}
        {!isPreviewMode && hasLocalPreviewToMigrate && (
          <section className="rounded-2xl bg-[#FCE7F3]/65 border-[1.5px] border-[#EC1580]/40 p-4 space-y-2.5">
            <div className="flex items-start gap-2">
              <CloudUpload className="w-4 h-4 text-[#EC1580] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-xs font-extrabold text-[#0E1A59]">
                  Encontramos dados salvos no preview local deste dispositivo
                </p>
                <p className="text-[11px] text-[#475569]">
                  Você pode importar suas matérias, faltas e provas do preview diretamente para a
                  sua conta sincronizada na nuvem.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={migrating}
                onClick={handleMigrateClick}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170] disabled:opacity-60"
              >
                {migrating ? 'Importando...' : 'Importar dados do preview local para minha conta'}
              </button>
              <button
                type="button"
                onClick={onDismissMigrationBanner}
                className="min-h-[38px] px-3 rounded-xl bg-white border border-[#CBD5E1] text-xs font-bold text-[#475569] hover:text-[#0E1A59]"
              >
                Ignorar
              </button>
            </div>
          </section>
        )}

        {/* Display Name & Preferences Form */}
        <form onSubmit={handleSubmitPrefs} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="cfg-display-name"
              className="block text-xs font-extrabold text-[#0E1A59]"
            >
              Seu nome sincronizado (aparece nos avisos coletivos)
            </label>
            <div className="relative">
              <User
                className="w-4 h-4 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="cfg-display-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex.: Matheus Henrique"
                className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white pl-10 pr-3.5 text-sm font-bold text-[#0E1A59] focus:border-[#0E1A59]"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#E6E9F0]/70 px-3 py-1.5 text-[11px] font-semibold text-[#475569]">
              <Sparkles className="w-3.5 h-3.5 text-[#EC1580] shrink-0" aria-hidden="true" />
              <span>
                Nos avisos coletivos aparecerá:{' '}
                <strong className="text-[#0E1A59] font-extrabold">
                  Enviado por {previewAuthorName}
                </strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cfg-periodo-atual"
                className="block text-xs font-extrabold text-[#0E1A59] mb-1"
              >
                Período padrão na Grade
              </label>
              <select
                id="cfg-periodo-atual"
                value={periodoAtual}
                onChange={(e) => setPeriodoAtual(e.target.value as PeriodoId)}
                className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-extrabold text-[#0E1A59]"
              >
                {PERIODOS.map((p) => (
                  <option key={p} value={p}>
                    {getPeriodoStyle(p).label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cfg-percentual-padrao"
                className="block text-xs font-extrabold text-[#0E1A59] mb-1"
              >
                Limite padrão de faltas (%)
              </label>
              <input
                id="cfg-percentual-padrao"
                type="number"
                min={1}
                max={99}
                value={percentualPadrao}
                onChange={(e) => setPercentualPadrao(Number(e.target.value))}
                className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-sm font-mono tabular-nums font-bold text-[#0E1A59]"
              />
            </div>
          </div>

          {feedback && (
            <p className="flex items-start gap-2 text-xs font-bold text-[#15803D] bg-[#DCFCE7] rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{feedback}</span>
            </p>
          )}

          {errorMsg && (
            <p role="alert" className="text-xs font-bold text-[#EC1580] bg-[#FCE7F3] rounded-xl p-3">
              {errorMsg}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={savingPrefs || previewAuthorName.length < 2}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] disabled:opacity-60 transition-colors"
            >
              {savingPrefs ? 'Sincronizando...' : 'Salvar nome e preferências'}
            </button>
            {materias.length > 0 && (
              <button
                type="button"
                disabled={applyingAll}
                onClick={handleApplyAllClick}
                className="min-h-[44px] px-3.5 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] transition-colors whitespace-nowrap"
              >
                {applyingAll
                  ? 'Aplicando...'
                  : `Aplicar ${Math.max(1, Math.min(99, Math.round(percentualPadrao || 25)))}% em ${materias.length} matéria(s)`}
              </button>
            )}
          </div>
        </form>

        {/* Grade & Backup Footer Actions */}
        <div className="pt-3 border-t-[1.5px] border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenGrade();
            }}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#E6E9F0] text-[#0E1A59] text-xs font-extrabold inline-flex items-center gap-1.5 hover:bg-[#CBD5E1]/70 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Configurar grade e matérias</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[40px] px-3.5 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#0E1A59] hover:border-[#0E1A59] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exportar backup JSON</span>
          </button>
        </div>
      </div>
    </div>
  );
};
