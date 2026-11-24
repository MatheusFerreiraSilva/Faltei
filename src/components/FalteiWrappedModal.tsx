import React, { useMemo } from 'react';
import { Award, Flame, ShieldCheck, Sparkles, X } from 'lucide-react';
import { MateriaStats, SemestreConfig, UserFalta } from '../types/domain';
import { formatNumberClean, getEffectiveFaltaHoras } from '../utils/attendance';

interface FalteiWrappedModalProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  semestreConfig: SemestreConfig;
  statsList: MateriaStats[];
  faltas: UserFalta[];
}

export const FalteiWrappedModal: React.FC<FalteiWrappedModalProps> = ({
  open,
  onClose,
  displayName,
  semestreConfig,
  statsList,
  faltas,
}) => {
  const summary = useMemo(() => {
    const ocorridas = faltas.filter((f) => f.tipo === 'falta');
    const programadas = faltas.filter((f) => f.tipo === 'programada');
    const semAula = faltas.filter((f) => f.tipo === 'sem_aula');

    const totalHorasFaltadas = ocorridas.reduce((acc, f) => acc + getEffectiveFaltaHoras(f), 0);
    const totalHorasPoupadas = semAula.reduce((acc, f) => acc + getEffectiveFaltaHoras(f), 0);
    const maisFolgada = [...statsList].sort(
      (a, b) => a.percentualConsumido - b.percentualConsumido
    )[0];
    const maisRisco = [...statsList].sort(
      (a, b) => b.percentualConsumido - a.percentualConsumido
    )[0];

    const titulo =
      ocorridas.length === 0
        ? 'Patrimônio da Primeira Fileira'
        : statsList.some((s) => s.status === 'ESTOURADO')
        ? 'Sobrevivente em Modo Hardcore'
        : statsList.some((s) => s.zonaAmarela)
        ? 'Estrategista na Zona Amarela'
        : 'Mestre da Gestão de Faltas';

    return {
      ocorridasCount: ocorridas.length,
      programadasCount: programadas.length,
      semAulaCount: semAula.length,
      totalHorasFaltadas,
      totalHorasPoupadas,
      maisFolgada,
      maisRisco,
      titulo,
    };
  }, [faltas, statsList]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#09113B]/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wrapped-modal-title"
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#0E1A59] text-white rounded-t-3xl sm:rounded-3xl border-[1.5px] border-indigo-400/30 shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EC1580] text-white text-[10px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              faltei. Wrapped · {semestreConfig.id}
            </span>
            <h2 id="wrapped-modal-title" className="text-xl font-black tracking-tight">
              Resumo de {displayName}
            </h2>
            <p className="text-xs text-indigo-200 font-semibold">{summary.titulo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar resumo Wrapped"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 border border-white/15 p-4 space-y-1">
            <p className="text-[11px] font-bold text-indigo-200">Faltas registradas</p>
            <p className="text-2xl font-black font-mono tabular-nums">
              {summary.ocorridasCount}
            </p>
            <p className="text-[11px] font-mono tabular-nums text-indigo-200">
              {formatNumberClean(summary.totalHorasFaltadas)}h utilizadas
            </p>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/15 p-4 space-y-1">
            <p className="text-[11px] font-bold text-indigo-200">Cota poupada (Sem Aula)</p>
            <p className="text-2xl font-black font-mono tabular-nums text-[#DCFCE7]">
              {summary.semAulaCount}
            </p>
            <p className="text-[11px] font-mono tabular-nums text-indigo-200">
              +{formatNumberClean(summary.totalHorasPoupadas)}h preservadas
            </p>
          </div>
        </div>

        {summary.maisRisco && (
          <div className="rounded-2xl bg-[#EC1580]/20 border border-[#EC1580]/50 p-4 flex items-start gap-3">
            <Flame className="w-5 h-5 text-[#EC1580] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-pink-200">
                Maior adrenalina do semestre
              </p>
              <p className="text-sm font-black truncate">{summary.maisRisco.materia.nome}</p>
              <p className="text-xs text-pink-100 font-mono tabular-nums">
                {Math.round(summary.maisRisco.percentualConsumido)}% da cota usada ·{' '}
                {formatNumberClean(summary.maisRisco.restanteLivre)}
                {summary.maisRisco.unidade === 'h' ? 'h' : ' enc.'} restantes
              </p>
            </div>
          </div>
        )}

        {summary.maisFolgada && (
          <div className="rounded-2xl bg-white/10 border border-white/15 p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-200">
                Saldo mais tranquilo
              </p>
              <p className="text-sm font-black truncate">{summary.maisFolgada.materia.nome}</p>
              <p className="text-xs text-indigo-100 font-mono tabular-nums">
                {Math.round(summary.maisFolgada.percentualConsumido)}% da cota usada ·{' '}
                {summary.programadasCount} folga(s) programada(s)
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-white/15 text-xs text-indigo-200">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Award className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
            {statsList.length} disciplina(s) monitorada(s)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 rounded-xl bg-white text-[#0E1A59] font-extrabold hover:bg-indigo-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default FalteiWrappedModal;
