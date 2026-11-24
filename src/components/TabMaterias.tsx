import React, { useMemo, useState } from 'react';
import { ChevronRight, ShieldAlert, Users } from 'lucide-react';
import { DisciplinaComunidade, MateriaStats, PeriodoId } from '../types/domain';
import {
  DIA_SEMANA_LABELS,
  formatNumberClean,
  getPeriodoStyle,
  sortMateriasByUrgency,
} from '../utils/attendance';
import { getEnrolledCountForMateria } from '../utils/disciplinaKey';

interface TabMateriasProps {
  statsList: MateriaStats[];
  comunidadeMap: Record<string, DisciplinaComunidade>;
  onSelectMateria: (materiaId: string) => void;
  onOpenGrade: () => void;
}

type FilterMode = 'todas' | 'risco' | PeriodoId;

export const TabMaterias: React.FC<TabMateriasProps> = ({
  statsList,
  comunidadeMap,
  onSelectMateria,
  onOpenGrade,
}) => {
  const [filter, setFilter] = useState<FilterMode>('todas');

  const periodosPresentes = useMemo(() => {
    const set = new Set<PeriodoId>();
    for (const s of statsList) set.add(s.materia.periodo);
    return Array.from(set).sort();
  }, [statsList]);

  const sortedStats = useMemo(() => sortMateriasByUrgency(statsList), [statsList]);

  const filtered = useMemo(() => {
    if (filter === 'todas') return sortedStats;
    if (filter === 'risco') {
      return sortedStats.filter(
        (s) => s.zonaCriticaTerracota || s.status === 'ATENÇÃO'
      );
    }
    return sortedStats.filter((s) => s.materia.periodo === filter);
  }, [filter, sortedStats]);

  if (statsList.length === 0) {
    return (
      <div className="bento-card p-8 text-center space-y-4">
        <h1 className="text-xl font-black text-[#0E1A59]">Nenhuma matéria cadastrada</h1>
        <p className="text-sm text-[#475569] max-w-md mx-auto">
          Importe seu período do catálogo 2026.2 ou adicione suas disciplinas manualmente para
          acompanhar o orçamento de faltas.
        </p>
        <button
          type="button"
          onClick={onOpenGrade}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] transition-colors"
        >
          Ir para Grade e Importar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Filtros Rápidos */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#0E1A59] leading-tight">
            Orçamento por matéria
          </h1>
          <p className="text-xs font-semibold text-[#475569]">
            Ordenadas por urgência · Toque para histórico ou regra
          </p>
        </div>

        <div
          role="group"
          aria-label="Filtrar matérias"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0"
        >
          <button
            type="button"
            onClick={() => setFilter('todas')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap shrink-0 transition-colors ${
              filter === 'todas'
                ? 'bg-[#0E1A59] text-white'
                : 'bg-white border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#0E1A59] hover:border-[#94A3B8]'
            }`}
          >
            Todas ({statsList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('risco')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors ${
              filter === 'risco'
                ? 'bg-[#EC1580] text-white'
                : 'bg-white border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#0E1A59] hover:border-[#94A3B8]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            Em Risco
          </button>
          {periodosPresentes.map((p) => {
            const pStyle = getPeriodoStyle(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setFilter(p)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap shrink-0 transition-colors ${
                  filter === p
                    ? 'bg-[#0E1A59] text-white'
                    : 'bg-white border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#0E1A59] hover:border-[#94A3B8]'
                }`}
              >
                {pStyle.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bento Grid */}
      {filtered.length === 0 ? (
        <div className="bento-card p-8 text-center space-y-2">
          <p className="text-sm font-extrabold text-[#0E1A59]">Nenhuma matéria nesse filtro</p>
          <p className="text-xs text-[#475569]">
            {filter === 'risco'
              ? 'Boas notícias: todas as suas disciplinas estão com saldo confortável.'
              : 'Tente selecionar "Todas" para ver sua grade completa.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((stats) => {
            const pStyle = getPeriodoStyle(stats.materia.periodo);
            const isCritica = stats.zonaCriticaTerracota;

            const statusBadgeClass =
              stats.status === 'ESTOURADO' || stats.status === 'CRÍTICO'
                ? 'bg-[#EC1580] text-white'
                : stats.status === 'ATENÇÃO'
                ? 'bg-[#0E1A59] text-white'
                : 'bg-[#E6E9F0] text-[#0E1A59]';

            const diasResumo = stats.materia.horarios
              .map((h) => `${DIA_SEMANA_LABELS[h.diaSemana].short} ${h.horarioInicio}`)
              .join(' · ');
            const inscritos = getEnrolledCountForMateria(stats.materia, comunidadeMap);

            return (
              <button
                key={stats.materia.id}
                type="button"
                onClick={() => onSelectMateria(stats.materia.id)}
                style={{ borderLeftColor: pStyle.borderColor }}
                className="bento-card border-l-4 text-left p-5 flex flex-col justify-between gap-4 active:scale-[0.99] transition-all"
              >
                <div className="space-y-3 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      style={{ backgroundColor: pStyle.badgeBg, color: pStyle.badgeText }}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap"
                    >
                      {pStyle.label}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold tracking-tight whitespace-nowrap ${statusBadgeClass}`}
                    >
                      {stats.status}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-[15px] font-extrabold text-[#0E1A59] leading-snug line-clamp-2">
                      {stats.materia.nome}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#475569] font-mono tabular-nums">
                      <span className="truncate">{diasResumo}</span>
                      {inscritos > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#0E1A59] bg-[#E6E9F0] px-2 py-0.5 rounded-full">
                          <Users className="w-3 h-3" aria-hidden="true" />
                          {inscritos}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tradução humana */}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#0E1A59] leading-relaxed">
                      {stats.traducaoHumana}
                    </p>
                    <p className="text-[11px] text-[#475569] font-mono tabular-nums">
                      Faltam {stats.aulasRestantesSemestre} aulas para acabar o semestre
                    </p>
                  </div>
                </div>

                <div className="w-full space-y-2.5">
                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span
                        className={
                          isCritica ? 'text-[#EC1580] font-extrabold' : 'text-[#0E1A59] font-bold'
                        }
                      >
                        {formatNumberClean(stats.consumidoTotal)}
                        {stats.unidade === 'h' ? 'h' : ' enc.'} /{' '}
                        {formatNumberClean(stats.limiteTotal)}
                        {stats.unidade === 'h' ? 'h' : ' enc.'} usadas
                      </span>
                      <span className="text-[#475569] font-bold">
                        {Math.round(stats.percentualConsumido)}%
                      </span>
                    </div>

                    <div className="h-2.5 w-full rounded-full bg-[#E6E9F0] border border-[#CBD5E1] overflow-hidden flex">
                      <div
                        style={{
                          width: `${Math.min(
                            100,
                            stats.limiteTotal > 0
                              ? (stats.consumidoConfirmado / stats.limiteTotal) * 100
                              : 0
                          )}%`,
                        }}
                        className={
                          stats.percentualConsumido >= 75 || stats.status === 'ESTOURADO'
                            ? 'bg-[#EC1580] h-full'
                            : 'bg-[#0E1A59] h-full'
                        }
                      />
                      {stats.consumidoProgramado > 0 && (
                        <div
                          style={{
                            width: `${Math.min(
                              100 -
                                Math.min(
                                  100,
                                  stats.limiteTotal > 0
                                    ? (stats.consumidoConfirmado / stats.limiteTotal) * 100
                                    : 0
                                ),
                              stats.limiteTotal > 0
                                ? (stats.consumidoProgramado / stats.limiteTotal) * 100
                                : 0
                            )}%`,
                          }}
                          className="bg-[#EC1580] h-full opacity-75"
                        />
                      )}
                    </div>
                  </div>

                  {/* Comic footer */}
                  <div className="pt-2 border-t border-[#CBD5E1] flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[#475569] font-semibold leading-snug line-clamp-2">
                      {stats.fraseComica}
                    </p>
                    <ChevronRight className="w-4 h-4 text-[#0E1A59] shrink-0" aria-hidden="true" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
