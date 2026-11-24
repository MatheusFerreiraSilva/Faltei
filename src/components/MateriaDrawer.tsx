import React, { useState } from 'react';
import { Check, Clock, Plus, RotateCcw, Trash2, Users, X } from 'lucide-react';
import {
  DiaSemana,
  DisciplinaComunidade,
  FaltaTipo,
  MateriaStats,
  RegraModo,
  UserFalta,
  UserMateria,
} from '../types/domain';
import {
  DIA_SEMANA_LABELS,
  formatDatePtBr,
  formatNumberClean,
  getDiaSemanaFromIso,
  getPeriodoStyle,
} from '../utils/attendance';
import { getEnrolledCountForMateria, resolveDisciplinaKey } from '../utils/disciplinaKey';

interface MateriaDrawerProps {
  stats: MateriaStats | null;
  faltas: UserFalta[];
  comunidadeMap: Record<string, DisciplinaComunidade>;
  todayStr: string;
  onClose: () => void;
  onUpdateFaltaTipo: (faltaId: string, tipo: FaltaTipo) => Promise<void>;
  onDeleteFalta: (faltaId: string) => Promise<void>;
  onRecordFalta: (params: {
    materiaId: string;
    data: string;
    diaSemana: DiaSemana;
    horas: number;
    tipo: FaltaTipo;
  }) => Promise<void>;
  onUpdateMateria: (materiaId: string, updates: Partial<UserMateria>) => Promise<void>;
  onDeleteMateria: (materiaId: string) => Promise<void>;
}

export const MateriaDrawer: React.FC<MateriaDrawerProps> = ({
  stats,
  faltas,
  comunidadeMap,
  todayStr,
  onClose,
  onUpdateFaltaTipo,
  onDeleteFalta,
  onRecordFalta,
  onUpdateMateria,
  onDeleteMateria,
}) => {
  const [editingRule, setEditingRule] = useState(false);
  const [regraModo, setRegraModo] = useState<RegraModo>(stats?.materia.regraModo || 'horas_totais');
  const [cargaTotal, setCargaTotal] = useState<number>(stats?.materia.cargaHorariaTotal || 64);
  const [pctLimite, setPctLimite] = useState<number>(stats?.materia.percentualLimite || 25);
  const [cotaIsolada, setCotaIsolada] = useState<boolean>(
    stats?.materia.cotaIsoladaPorDia || false
  );
  const [encontrosTotais, setEncontrosTotais] = useState<number>(
    stats?.materia.encontrosTotaisSemestre || 30
  );
  const [manualDate, setManualDate] = useState<string>(todayStr);
  const [manualTipo, setManualTipo] = useState<FaltaTipo>('falta');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!stats) return null;

  const { materia } = stats;
  const pStyle = getPeriodoStyle(materia.periodo);
  const logs = faltas
    .filter((f) => f.materiaId === materia.id)
    .sort((a, b) => b.data.localeCompare(a.data));

  const openRuleEditor = () => {
    setRegraModo(materia.regraModo);
    setCargaTotal(materia.cargaHorariaTotal);
    setPctLimite(materia.percentualLimite);
    setCotaIsolada(materia.cotaIsoladaPorDia);
    setEncontrosTotais(materia.encontrosTotaisSemestre || 30);
    setEditingRule(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdateMateria(materia.id, {
        regraModo,
        cargaHorariaTotal: cargaTotal,
        percentualLimite: pctLimite,
        cotaIsoladaPorDia: cotaIsolada,
        encontrosTotaisSemestre: encontrosTotais,
      });
      setEditingRule(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddManualDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDate) return;
    const rawDow = getDiaSemanaFromIso(manualDate);
    const dow = (rawDow >= 1 && rawDow <= 6 ? rawDow : materia.horarios[0]?.diaSemana || 1) as DiaSemana;
    const matchedHorario = materia.horarios.find((h) => h.diaSemana === dow);
    const horas = matchedHorario?.horas || materia.horarios[0]?.horas || 2;

    setSaving(true);
    try {
      await onRecordFalta({
        materiaId: materia.id,
        data: manualDate,
        diaSemana: dow,
        horas,
        tipo: manualTipo,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMateria = async () => {
    setSaving(true);
    try {
      await onDeleteMateria(materia.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-[#09113B]/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-materia-title"
    >
      <div className="w-full sm:max-w-lg h-[90vh] sm:h-full bg-white rounded-t-3xl sm:rounded-none sm:rounded-l-3xl shadow-2xl border-l-[1.5px] border-[#CBD5E1] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          style={{ borderLeftColor: pStyle.borderColor }}
          className="p-6 bg-white border-b-[1.5px] border-[#CBD5E1] border-l-4 flex items-start justify-between gap-4"
        >
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                style={{ backgroundColor: pStyle.badgeBg, color: pStyle.badgeText }}
                className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold"
              >
                {pStyle.label}
              </span>
              {getEnrolledCountForMateria(materia, comunidadeMap) > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E6E9F0] text-[#0E1A59] text-[10px] font-extrabold font-mono tabular-nums">
                  <Users className="w-3 h-3" aria-hidden="true" />
                  {getEnrolledCountForMateria(materia, comunidadeMap)} inscritos
                </span>
              )}
            </div>
            <h2 id="drawer-materia-title" className="text-lg font-black text-[#0E1A59]">
              {materia.nome}
            </h2>
            <p className="text-xs font-semibold text-[#475569]">
              {materia.local || 'Local não informado'} · Limite {materia.percentualLimite}%
              {!materia.catalogoId && (
                <span className="ml-1.5 font-mono text-[11px] text-[#0E1A59]">
                  · chave: {resolveDisciplinaKey(materia)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes da matéria"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] flex items-center justify-center text-[#0E1A59] hover:border-[#94A3B8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Summary */}
          <div className="rounded-2xl bg-[#E6E9F0]/60 border-[1.5px] border-[#CBD5E1] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="font-bold text-[#0E1A59]">
                {formatNumberClean(stats.consumidoTotal)}
                {stats.unidade === 'h' ? 'h' : ' enc.'} de {formatNumberClean(stats.limiteTotal)}
                {stats.unidade === 'h' ? 'h' : ' enc.'}
              </span>
              <span
                className={`font-extrabold ${
                  stats.zonaCriticaTerracota ? 'text-[#EC1580]' : 'text-[#0E1A59]'
                }`}
              >
                {stats.status} ({Math.round(stats.percentualConsumido)}%)
              </span>
            </div>
            <p className="text-xs font-bold text-[#0E1A59]">{stats.traducaoHumana}</p>
            <p className="text-xs text-[#475569]">{stats.fraseComica}</p>
          </div>

          {/* Subcotas isoladas se aplicável */}
          {stats.subCotasPorDia.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-[#0E1A59]">
                Distribuição por dia {materia.cotaIsoladaPorDia ? '(cota isolada)' : '(cota unificada)'}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {stats.subCotasPorDia.map((sub) => (
                  <div
                    key={sub.diaSemana}
                    className="rounded-xl border-[1.5px] border-[#CBD5E1] p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold text-[#0E1A59]">
                      <span>{sub.label}</span>
                      <span className="font-mono tabular-nums">{sub.horasPorEncontro}h/aula</span>
                    </div>
                    <p className="font-mono tabular-nums text-[#475569]">
                      Restam {formatNumberClean(sub.restantesHoras)}h de {formatNumberClean(sub.limiteHoras)}h
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regra de cálculo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0E1A59]">Regra de cálculo</h3>
              {!editingRule && (
                <button
                  type="button"
                  onClick={openRuleEditor}
                  className="min-h-[36px] px-3 py-1 rounded-xl border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#94A3B8]"
                >
                  Editar regra
                </button>
              )}
            </div>

            {editingRule ? (
              <form
                onSubmit={handleSaveRule}
                className="rounded-2xl border-[1.5px] border-[#CBD5E1] p-4 space-y-3"
              >
                <div>
                  <label htmlFor="drawer-modo" className="block text-xs font-bold text-[#475569] mb-1">
                    Modo de cálculo
                  </label>
                  <select
                    id="drawer-modo"
                    value={regraModo}
                    onChange={(e) => setRegraModo(e.target.value as RegraModo)}
                    className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-bold text-[#0E1A59]"
                  >
                    <option value="horas_totais">Modo 1 — Horas Totais</option>
                    <option value="diferente_por_dia">Modo 2 — Diferente por Dia</option>
                    <option value="por_encontros">Modo 3 — Por % de Encontros/Dias</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {regraModo === 'por_encontros' ? (
                    <div>
                      <label htmlFor="drawer-enc" className="block text-xs font-bold text-[#475569] mb-1">
                        Total de encontros
                      </label>
                      <input
                        id="drawer-enc"
                        type="number"
                        min={1}
                        max={400}
                        value={encontrosTotais}
                        onChange={(e) => setEncontrosTotais(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono tabular-nums"
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="drawer-ch" className="block text-xs font-bold text-[#475569] mb-1">
                        Carga horária (h)
                      </label>
                      <input
                        id="drawer-ch"
                        type="number"
                        min={1}
                        max={1000}
                        value={cargaTotal}
                        onChange={(e) => setCargaTotal(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono tabular-nums"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="drawer-pct" className="block text-xs font-bold text-[#475569] mb-1">
                      Limite de falta (%)
                    </label>
                    <input
                      id="drawer-pct"
                      type="number"
                      min={1}
                      max={99}
                      value={pctLimite}
                      onChange={(e) => setPctLimite(Number(e.target.value))}
                      className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>

                {regraModo === 'diferente_por_dia' && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#0E1A59] cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={cotaIsolada}
                      onChange={(e) => setCotaIsolada(e.target.checked)}
                    />
                    <span>Cota isolada por dia/modalidade (reprova separado por turno)</span>
                  </label>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[40px] px-4 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold"
                  >
                    Salvar regra
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRule(false)}
                    className="min-h-[40px] px-4 rounded-xl border-[1.5px] border-[#CBD5E1] text-xs font-bold text-[#475569]"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs font-semibold text-[#475569]">
                {materia.regraModo === 'horas_totais' &&
                  `Horas Totais (${materia.cargaHorariaTotal}h · limite ${materia.percentualLimite}%)`}
                {materia.regraModo === 'diferente_por_dia' &&
                  `Diferente por Dia (${materia.cotaIsoladaPorDia ? 'cota isolada' : 'cota unificada'} · ${materia.cargaHorariaTotal}h)`}
                {materia.regraModo === 'por_encontros' &&
                  `Por Encontros (${materia.encontrosTotaisSemestre || 30} encontros · limite ${materia.percentualLimite}%)`}
              </p>
            )}
          </div>

          {/* Lançamento manual rápido */}
          <form onSubmit={handleAddManualDate} className="space-y-2.5">
            <h3 className="text-sm font-extrabold text-[#0E1A59]">Registrar data no histórico</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="date"
                aria-label="Data do registro"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="min-h-[42px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono tabular-nums"
              />
              <select
                aria-label="Tipo de registro"
                value={manualTipo}
                onChange={(e) => setManualTipo(e.target.value as FaltaTipo)}
                className="min-h-[42px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-bold text-[#0E1A59]"
              >
                <option value="falta">Faltei</option>
                <option value="programada">Programar falta</option>
                <option value="sem_aula">Sem aula</option>
              </select>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 hover:bg-[#14267D]"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Lançar
              </button>
            </div>
          </form>

          {/* Histórico de Datas */}
          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-[#0E1A59]">
              Histórico de datas ({logs.length})
            </h3>
            {logs.length === 0 ? (
              <p className="text-xs text-[#475569] rounded-2xl bg-[#E6E9F0]/60 p-4">
                Nenhuma falta ou aula cancelada registrada até o momento. Ficha limpa.
              </p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border-[1.5px] border-[#CBD5E1] p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono tabular-nums font-bold text-[#0E1A59]">
                          {formatDatePtBr(log.data)} ({DIA_SEMANA_LABELS[log.diaSemana]?.short || 'Dia'})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[#475569]">
                          {formatNumberClean(log.horas)}h
                        </span>
                      </div>
                      <p
                        className={`text-xs font-bold ${
                          log.tipo === 'programada'
                            ? 'text-[#EC1580]'
                            : log.tipo === 'falta'
                            ? 'text-[#0E1A59]'
                            : 'text-[#475569]'
                        }`}
                      >
                        {log.tipo === 'falta' && 'Falta confirmada'}
                        {log.tipo === 'programada' && 'Falta programada'}
                        {log.tipo === 'sem_aula' && 'Sem aula (cancelada)'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {log.tipo === 'programada' && (
                        <button
                          type="button"
                          onClick={() => onUpdateFaltaTipo(log.id, 'falta')}
                          title="Converter falta programada em falta confirmada"
                          className="min-h-[36px] px-2.5 rounded-xl bg-[#0E1A59] text-white text-[11px] font-extrabold inline-flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                          Confirmar
                        </button>
                      )}
                      {log.tipo === 'falta' && (
                        <button
                          type="button"
                          onClick={() => onUpdateFaltaTipo(log.id, 'programada')}
                          title="Marcar como programada"
                          className="min-h-[36px] px-2.5 rounded-xl border-[1.5px] border-[#CBD5E1] text-[#EC1580] text-[11px] font-extrabold inline-flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          Programar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteFalta(log.id)}
                        aria-label={`Desfazer registro de ${formatDatePtBr(log.data)}`}
                        className="min-h-[36px] px-2.5 rounded-xl border-[1.5px] border-[#CBD5E1] text-xs font-bold text-[#475569] hover:text-[#0E1A59] inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        Desfazer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Delete Subject */}
        <div className="p-4 border-t-[1.5px] border-[#CBD5E1] bg-[#E6E9F0]/50 flex items-center justify-between gap-3">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[40px] px-3 rounded-xl text-xs font-extrabold text-[#EC1580] hover:bg-[#FCE7F3] inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Remover matéria da grade
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full justify-between">
              <span className="text-xs font-extrabold text-[#EC1580]">Confirmar remoção?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[36px] px-3 rounded-xl border-[1.5px] border-[#CBD5E1] bg-white text-xs font-bold text-[#0E1A59]"
                >
                  Não
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRemoveMateria}
                  className="min-h-[36px] px-3 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold"
                >
                  Sim, remover
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
