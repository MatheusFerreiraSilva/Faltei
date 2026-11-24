import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock,
  Flame,
  Megaphone,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react';
import {
  AvisoColetivo,
  AvisoColetivoTipo,
  DiaSemana,
  DisciplinaComunidade,
  FaltaDetalheTipo,
  FaltaTipo,
  MateriaStats,
  PeriodoId,
  SemAulaConsenso,
  SemestreConfig,
  UserEvento,
  UserFalta,
  UserMateria,
} from '../types/domain';
import {
  addDaysIso,
  DIA_SEMANA_LABELS,
  formatDatePtBr,
  formatNumberClean,
  getDayAttendanceOptions,
  getDiaSemanaFromIso,
  getDynamicHeroGreeting,
  getEffectiveFaltaHoras,
  getMateriaBlocos,
  getPeriodoStyle,
  getWeekDatesIso,
  getWeeksRemaining,
  isFeriado,
} from '../utils/attendance';
import { getCalendarBadgeMeta } from '../utils/calendar';
import {
  getClassSemAulaConsensus,
  getEnrolledCountForMateria,
  resolveDisciplinaKey,
} from '../utils/disciplinaKey';
import { CumpliceIcon, CumpliceMood } from './CumpliceIcon';
import { SmartFaltaSelector } from './SmartFaltaSelector';

interface TabHojeProps {
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  statsList: MateriaStats[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  comunidadeMap: Record<string, DisciplinaComunidade>;
  semAulaConsensoMap: Record<string, SemAulaConsenso>;
  avisosColetivos: AvisoColetivo[];
  currentUserUid: string;
  userDisplayName?: string;
  isAdmin: boolean;
  heroMood: CumpliceMood;
  onRecordFalta: (params: {
    materiaId: string;
    data: string;
    diaSemana: DiaSemana;
    horas: number;
    tipo: FaltaTipo;
    tipoFalta?: FaltaDetalheTipo;
    horasAbatidas?: number;
    blocoId?: string;
  }) => Promise<void>;
  onDeleteFalta: (faltaId: string) => Promise<void>;
  onImportPeriodo: (periodo: PeriodoId) => Promise<number>;
  onPublishAviso: (params: {
    materia: UserMateria;
    data: string;
    tipo: AvisoColetivoTipo;
    mensagem: string;
  }) => Promise<void>;
  onConfirmAviso: (avisoId: string) => Promise<void>;
  onDeleteAviso: (avisoId: string) => Promise<void>;
  onOpenCalendario: () => void;
  onOpenGradeSemanal: () => void;
  onOpenCalendarioDate: (isoDate: string) => void;
  onOpenSimulador: () => void;
  onOpenGrade: () => void;
  onOpenConfig: () => void;
}

const QUICK_PERIODOS: PeriodoId[] = ['1', '2', '3', '4', '5', '6', '7', '8'];

export const TabHoje: React.FC<TabHojeProps> = ({
  todayStr,
  semestreConfig,
  materias,
  statsList,
  faltas,
  eventos,
  comunidadeMap,
  semAulaConsensoMap,
  avisosColetivos,
  currentUserUid,
  userDisplayName,
  isAdmin,
  heroMood,
  onRecordFalta,
  onDeleteFalta,
  onImportPeriodo,
  onPublishAviso,
  onConfirmAviso,
  onDeleteAviso,
  onOpenCalendario,
  onOpenGradeSemanal,
  onOpenCalendarioDate,
  onOpenSimulador,
  onOpenGrade,
  onOpenConfig,
}) => {
  const [selectedDayStr, setSelectedDayStr] = useState<string>(todayStr);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importingPeriodo, setImportingPeriodo] = useState<PeriodoId | null>(null);
  const [showAvisoForm, setShowAvisoForm] = useState(false);
  const [avisoMateriaId, setAvisoMateriaId] = useState<string>('');
  const [avisoTipo, setAvisoTipo] = useState<AvisoColetivoTipo>('sem_aula');
  const [avisoData, setAvisoData] = useState<string>(todayStr);
  const [avisoMsg, setAvisoMsg] = useState<string>('');
  const [publishingAviso, setPublishingAviso] = useState(false);

  const weekDates = useMemo(() => getWeekDatesIso(todayStr), [todayStr]);
  const weeksRemaining = useMemo(
    () => getWeeksRemaining(semestreConfig, todayStr),
    [semestreConfig, todayStr]
  );

  const greeting = useMemo(
    () => getDynamicHeroGreeting(statsList, faltas, semestreConfig, todayStr),
    [statsList, faltas, semestreConfig, todayStr]
  );

  const next7End = useMemo(() => addDaysIso(todayStr, 7), [todayStr]);
  const next14End = useMemo(() => addDaysIso(todayStr, 14), [todayStr]);

  const upcomingAcademicEvents = useMemo(() => {
    return eventos
      .filter((ev) => ev.data >= todayStr && ev.data <= next14End)
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 4);
  }, [eventos, next14End, todayStr]);

  const faltasProximos7 = useMemo(
    () => faltas.filter((f) => f.data >= todayStr && f.data <= next7End && f.tipo !== 'sem_aula'),
    [faltas, next7End, todayStr]
  );
  const faltasOcorridasTotal = useMemo(
    () => faltas.filter((f) => f.tipo === 'falta').length,
    [faltas]
  );
  const faltasProgramadasTotal = useMemo(
    () => faltas.filter((f) => f.tipo === 'programada').length,
    [faltas]
  );

  const margemMediaLivre = useMemo(() => {
    if (statsList.length === 0) return 100;
    const sumFree = statsList.reduce((acc, s) => acc + Math.max(0, 100 - s.percentualConsumido), 0);
    return Math.round(sumFree / statsList.length);
  }, [statsList]);

  const selectedDow = getDiaSemanaFromIso(selectedDayStr);
  const selectedHoliday = isFeriado(selectedDayStr, semestreConfig.feriados);

  const aulasDoDia = useMemo(() => {
    if (selectedDow === 0 || selectedHoliday) return [];
    const list: Array<{
      materia: UserMateria;
      horarioResumo: string;
      horarioInicio: string;
      horas: number;
      local?: string;
      registros: UserFalta[];
      stats?: MateriaStats;
    }> = [];

    const statsMap = new Map(statsList.map((s) => [s.materia.id, s]));
    for (const mat of materias) {
      const dayBlocos = getMateriaBlocos(mat).filter((item) => item.diaSemana === selectedDow);
      if (dayBlocos.length > 0) {
        const totalHoras = dayBlocos.reduce((s, b) => s + b.horas, 0);
        const regs = faltas.filter((f) => f.materiaId === mat.id && f.data === selectedDayStr);
        const horarioResumo = dayBlocos
          .map((b) => `${b.horarioInicio}–${b.horarioFim}`)
          .join(' · ');
        const locaisUnicos = Array.from(
          new Set(dayBlocos.map((b) => b.local || mat.local).filter(Boolean))
        ).join(' / ');
        list.push({
          materia: mat,
          horarioResumo,
          horarioInicio: dayBlocos[0].horarioInicio,
          horas: totalHoras,
          local: locaisUnicos || mat.local,
          registros: regs,
          stats: statsMap.get(mat.id),
        });
      }
    }
    return list.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
  }, [faltas, materias, selectedDayStr, selectedDow, selectedHoliday, statsList]);

  const dayMood: CumpliceMood = useMemo(() => {
    if (selectedHoliday || (selectedDayStr !== todayStr && aulasDoDia.length === 0)) {
      return 'sem_aula';
    }
    if (aulasDoDia.some((a) => a.registros.some((r) => r.tipo === 'programada'))) {
      return 'programado';
    }
    return heroMood;
  }, [aulasDoDia, heroMood, selectedDayStr, selectedHoliday, todayStr]);

  const handleQuickAction = async (
    materiaId: string,
    horas: number,
    tipo: FaltaTipo,
    tipoFalta: FaltaDetalheTipo = 'dia_completo',
    blocoId?: string
  ) => {
    if (selectedDow < 1 || selectedDow > 6) return;
    setBusyId(`${materiaId}_${tipo}`);
    try {
      await onRecordFalta({
        materiaId,
        data: selectedDayStr,
        diaSemana: selectedDow as DiaSemana,
        horas,
        tipo,
        tipoFalta,
        horasAbatidas: horas,
        ...(blocoId ? { blocoId } : {}),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickImport = async (p: PeriodoId) => {
    setImportingPeriodo(p);
    try {
      await onImportPeriodo(p);
    } finally {
      setImportingPeriodo(null);
    }
  };

  const handleAvisoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mat = materias.find((m) => m.id === avisoMateriaId) || materias[0];
    if (!mat || avisoMsg.trim().length < 2) return;
    setPublishingAviso(true);
    try {
      await onPublishAviso({
        materia: mat,
        data: avisoData || todayStr,
        tipo: avisoTipo,
        mensagem: avisoMsg.trim(),
      });
      setAvisoMsg('');
      setShowAvisoForm(false);
    } finally {
      setPublishingAviso(false);
    }
  };

  const handleApplySemAulaFromAviso = async (aviso: AvisoColetivo) => {
    const mat = materias.find((m) => resolveDisciplinaKey(m) === aviso.disciplinaKey);
    if (!mat) return;
    const summary = getDayAttendanceOptions(mat, aviso.data);
    await onRecordFalta({
      materiaId: mat.id,
      data: aviso.data,
      diaSemana: summary.diaSemana,
      horas: summary.totalHorasDia,
      tipo: 'sem_aula',
      tipoFalta: 'dia_completo',
      horasAbatidas: summary.totalHorasDia,
    });
  };

  // Empty Onboarding State
  if (materias.length === 0) {
    return (
      <div className="space-y-4">
        <section className="bento-card p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3.5">
            <CumpliceIcon mood="sem_aula" size={48} className="shrink-0" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#475569] font-mono tabular-nums">
                {semestreConfig.nome} · {formatDatePtBr(semestreConfig.dataInicio)} a{' '}
                {formatDatePtBr(semestreConfig.dataFim)}
              </p>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#0E1A59] leading-tight text-balance">
                Sua grade ainda está em branco. Qual período vamos carregar?
              </h1>
              <p className="text-sm text-[#475569] max-w-2xl">
                Importe seu período completo do catálogo oficial da Medicina UNIRIO 2026.2 em 1
                toque ou monte sua grade personalizada na aba Grade.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {QUICK_PERIODOS.map((p) => {
              const pStyle = getPeriodoStyle(p);
              return (
                <button
                  key={p}
                  type="button"
                  disabled={importingPeriodo !== null}
                  onClick={() => handleQuickImport(p)}
                  style={{ borderLeftColor: pStyle.borderColor }}
                  className="min-h-[58px] rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] border-l-4 p-3 text-left hover:border-[#94A3B8] active:scale-[0.98] transition-all flex items-center justify-between"
                >
                  <div>
                    <span
                      style={{ backgroundColor: pStyle.badgeBg, color: pStyle.badgeText }}
                      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap mb-1"
                    >
                      {p}º Período
                    </span>
                    <span className="block text-xs font-semibold text-[#475569]">
                      {importingPeriodo === p ? 'Importando...' : 'Carregar 2026.2'}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#0E1A59] shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenGrade}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] transition-colors whitespace-nowrap"
            >
              Adicionar aula manualmente ou ler print
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bento Card 1: Banner Cômico com Mascote O Cúmplice */}
      <section className="bento-card p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
          <span className="font-mono tabular-nums">
            Semestre {semestreConfig.id} · Faltam{' '}
            <strong className="text-[#0E1A59] font-extrabold">{weeksRemaining}</strong>{' '}
            {weeksRemaining === 1 ? 'semana' : 'semanas'} para o fim
          </span>
          <span className="font-mono tabular-nums font-semibold">
            {faltasOcorridasTotal} faltas ·{' '}
            <span className={faltasProgramadasTotal > 0 ? 'text-[#EC1580] font-bold' : ''}>
              {faltasProgramadasTotal} programadas
            </span>
          </span>
        </div>

        <div className="flex items-start gap-3.5 sm:gap-4">
          <CumpliceIcon mood={dayMood} size={46} className="shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#0E1A59] leading-tight text-balance">
              {greeting.headline}
            </h1>
            <p className="text-xs sm:text-sm text-[#475569]">
              {greeting.subline}{' '}
              {faltasProximos7.length > 0 && (
                <span className="font-mono tabular-nums text-[#EC1580] font-bold">
                  ({faltasProximos7.length} nos próximos 7 dias)
                </span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Bento Card 2: Aulas de Hoje (Hero Card) */}
      <section className="bento-card p-5 sm:p-7 space-y-4" aria-labelledby="aulas-hoje-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="aulas-hoje-heading" className="text-lg font-extrabold text-[#0E1A59]">
              {selectedDayStr === todayStr
                ? 'Aulas de hoje'
                : `Aulas de ${
                    selectedDow >= 1 && selectedDow <= 6
                      ? DIA_SEMANA_LABELS[selectedDow as DiaSemana].full
                      : 'Domingo'
                  }`}
            </h2>
            <p className="text-xs text-[#475569] font-mono tabular-nums">
              {formatDatePtBr(selectedDayStr)}
              {selectedDayStr !== todayStr && ' · Visualizando dia da semana'}
            </p>
          </div>
          {selectedDayStr !== todayStr && (
            <button
              type="button"
              onClick={() => setSelectedDayStr(todayStr)}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-[#E6E9F0] text-xs font-extrabold text-[#0E1A59] hover:bg-slate-300/70 transition-colors"
            >
              Voltar para hoje
            </button>
          )}
        </div>

        {selectedHoliday ? (
          <div className="rounded-2xl bg-[#E6E9F0]/60 border-[1.5px] border-[#CBD5E1] p-5 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-[#EC1580] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-extrabold text-[#0E1A59]">
                Feriado: {selectedHoliday.nome}
              </p>
              <p className="text-xs text-[#475569]">
                Sem aulas regulares no calendário acadêmico. Sua cota está intacta.
              </p>
            </div>
          </div>
        ) : aulasDoDia.length === 0 ? (
          <div className="rounded-2xl bg-[#E6E9F0]/60 border-[1.5px] border-[#CBD5E1] p-5 flex items-center gap-3">
            <CalendarX2 className="w-5 h-5 text-[#0E1A59] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-extrabold text-[#0E1A59]">Dia livre na sua grade</p>
              <p className="text-xs text-[#475569]">
                Nenhuma disciplina cadastrada acontece neste dia da semana.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {aulasDoDia.map((aula) => {
              const style = getPeriodoStyle(aula.materia.periodo);
              const regs = aula.registros;
              const primaryReg = regs[0];
              const discKey = resolveDisciplinaKey(aula.materia);
              const inscritos = getEnrolledCountForMateria(aula.materia, comunidadeMap);
              const dayAvisos = avisosColetivos.filter(
                (a) => a.disciplinaKey === discKey && a.data === selectedDayStr
              );
              const hasSemAulaAviso = dayAvisos.some((a) => a.tipo === 'sem_aula');
              const consensus = getClassSemAulaConsensus({
                semestreId: aula.materia.semestreId || semestreConfig.id,
                disciplinaKey: discKey,
                data: selectedDayStr,
                consensoMap: semAulaConsensoMap,
                avisosColetivos,
                currentUserUid,
              });

              return (
                <div
                  key={aula.materia.id}
                  style={{ borderLeftColor: style.borderColor }}
                  className="rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] border-l-4 p-4 space-y-3 hover:border-[#94A3B8] transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569]">
                        <span className="font-mono tabular-nums font-bold text-[#0E1A59] inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          {aula.horarioResumo} ({formatNumberClean(aula.horas)}h)
                        </span>
                        <span
                          style={{ backgroundColor: style.badgeBg, color: style.badgeText }}
                          className="px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap"
                        >
                          {style.label}
                        </span>
                        {inscritos > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E6E9F0] text-[#0E1A59] text-[10px] font-extrabold font-mono tabular-nums whitespace-nowrap">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            {inscritos} {inscritos === 1 ? 'inscrito' : 'inscritos'}
                          </span>
                        )}
                        {aula.local && <span className="truncate">{aula.local}</span>}
                      </div>
                      <h3 className="text-[15px] font-extrabold text-[#0E1A59] leading-snug line-clamp-2">
                        {aula.materia.nome}
                      </h3>
                    </div>

                    {aula.stats && (
                      <span
                        className={`font-mono tabular-nums text-xs font-bold whitespace-nowrap ${
                          aula.stats.zonaCriticaTerracota ? 'text-[#EC1580]' : 'text-[#475569]'
                        }`}
                      >
                        {aula.stats.restanteLivre}
                        {aula.stats.unidade === 'h' ? 'h livres' : ' enc. livres'}
                      </span>
                    )}
                  </div>

                  {dayAvisos.length > 0 && (
                    <div className="rounded-xl bg-[#FCE7F3]/70 border border-[#EC1580]/30 px-3 py-2 text-xs text-[#0E1A59] flex items-start gap-2">
                      <Megaphone className="w-3.5 h-3.5 text-[#EC1580] shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="min-w-0">
                        <span className="font-extrabold text-[#BE185D]">
                          Aviso coletivo ({dayAvisos[0].confirmacoes} conf.):
                        </span>{' '}
                        <span className="font-semibold">{dayAvisos[0].mensagem}</span>
                      </div>
                    </div>
                  )}

                  {regs.length === 0 && consensus.count > 0 && (
                    <div
                      data-testid={`hoje-consensus-${aula.materia.id}`}
                      className="rounded-xl bg-[#DCFCE7]/85 border border-[#86EFAC] p-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-extrabold text-[#15803D]">
                          {consensus.count}{' '}
                          {consensus.count === 1
                            ? 'pessoa falou que não teve aula'
                            : 'pessoas falaram que não teve aula'}
                          {consensus.autorHint ? ` · ${consensus.autorHint}` : ''}
                        </p>
                        <p className="text-[11px] font-semibold text-[#166534]">
                          Quer marcar Sem Aula também para preservar sua cota?
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleQuickAction(aula.materia.id, aula.horas, 'sem_aula')}
                        className="min-h-[36px] px-3 rounded-lg bg-[#15803D] text-white text-[11px] font-extrabold hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0"
                      >
                        Sim, marcar Sem Aula
                      </button>
                    </div>
                  )}

                  {regs.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      {regs.map((reg) => {
                        const effH = getEffectiveFaltaHoras(reg);
                        const turnoTag =
                          reg.tipoFalta === 'turno_manha'
                            ? ' · Só Manhã'
                            : reg.tipoFalta === 'turno_tarde'
                            ? ' · Só Tarde'
                            : reg.tipoFalta === 'turno_noite'
                            ? ' · Só Noite'
                            : reg.tipoFalta === 'parcial'
                            ? ' · Parcial'
                            : '';
                        return (
                          <div key={reg.id} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-2 text-xs font-extrabold">
                              {reg.tipo === 'falta' && (
                                <span className="text-[#0E1A59] inline-flex items-center gap-1.5">
                                  <Flame className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
                                  Falta registrada (−{formatNumberClean(effH)}h{turnoTag})
                                </span>
                              )}
                              {reg.tipo === 'programada' && (
                                <span className="text-[#EC1580] inline-flex items-center gap-1.5">
                                  <Clock className="w-4 h-4" aria-hidden="true" />
                                  Falta programada (−{formatNumberClean(effH)}h{turnoTag})
                                </span>
                              )}
                              {reg.tipo === 'sem_aula' && (
                                <span className="text-[#475569] inline-flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                                  Sem aula{turnoTag} (cota preservada)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {reg.tipo === 'sem_aula' && !hasSemAulaAviso && primaryReg?.id === reg.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPublishAviso({
                                      materia: aula.materia,
                                      data: selectedDayStr,
                                      tipo: 'sem_aula',
                                      mensagem: `Aula de ${aula.materia.nome} cancelada em ${formatDatePtBr(selectedDayStr)}.`,
                                    })
                                  }
                                  className="min-h-[38px] px-3 py-1 rounded-xl bg-[#FCE7F3] text-[#BE185D] text-[11px] font-extrabold hover:bg-[#fbcfe8] transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Megaphone className="w-3 h-3" aria-hidden="true" />
                                  Avisar turma
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeleteFalta(reg.id)}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#94A3B8] active:scale-95 transition-all inline-flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                Desfazer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <SmartFaltaSelector
                      materia={aula.materia}
                      isoDate={selectedDayStr}
                      busy={busyId !== null}
                      compact
                      onSubmit={onRecordFalta}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming Academic Events from Calendário */}
      {upcomingAcademicEvents.length > 0 && (
        <section className="bento-card p-5 sm:p-6 space-y-3" aria-labelledby="proximas-entregas-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
              <h2 id="proximas-entregas-heading" className="text-sm sm:text-base font-extrabold text-[#0E1A59]">
                Próximas provas e entregas (14 dias)
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenCalendario}
              className="text-xs font-extrabold text-[#0E1A59] hover:text-[#EC1580] inline-flex items-center gap-1"
            >
              <span>Ver no calendário</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {upcomingAcademicEvents.map((ev) => {
              const meta = getCalendarBadgeMeta(ev.tipo);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onOpenCalendarioDate(ev.data)}
                  className="rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] hover:border-[#0E1A59] p-3 text-left transition-all flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        style={{ backgroundColor: meta.bgColor, color: meta.textColor }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap"
                      >
                        {meta.label}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] font-bold text-[#475569]">
                        {formatDatePtBr(ev.data)}
                        {ev.horario ? ` · ${ev.horario}` : ''}
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-[#0E1A59] truncate">
                      {ev.disciplinaNome}
                    </p>
                    <p className="text-[11px] font-semibold text-[#475569] truncate">
                      {ev.titulo}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#475569] shrink-0 mt-1" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Bento Cards 3 & 4: Cota Global & Próxima Folga */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="bento-card p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#475569]">Cota global disponível</p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-[#0E1A59]">
              {margemMediaLivre}%
            </p>
          </div>
          <div className="flex items-center justify-between text-xs text-[#475569] pt-2 border-t-[1.5px] border-[#CBD5E1]">
            <span>Margem média livre</span>
            <span className="font-mono tabular-nums font-bold text-[#EC1580]">
              {faltasProgramadasTotal} programada(s)
            </span>
          </div>
        </section>

        <section className="bento-card p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#475569]">Planejador de folgas</p>
            <p className="text-base font-extrabold text-[#0E1A59] leading-snug">
              Quer emendar um feriado ou faltar amanhã?
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSimulador}
            className="min-h-[44px] w-full rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-[#14267D] active:scale-[0.98] transition-all whitespace-nowrap"
          >
            <span>Testar emenda de feriado</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </section>
      </div>

      {/* Bento Card 4.5: Avisos Coletivos da Turma (Bloco 4) */}
      <section className="bento-card p-5 sm:p-6 space-y-4" aria-labelledby="avisos-coletivos-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
            <div>
              <h2 id="avisos-coletivos-heading" className="text-sm sm:text-base font-extrabold text-[#0E1A59]">
                Avisos coletivos da turma
              </h2>
              <p className="text-[11px] font-semibold text-[#475569]">
                Sincronizados por disciplina do catálogo ou chave normalizada manual
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!avisoMateriaId && materias[0]) {
                setAvisoMateriaId(materias[0].id);
              }
              setShowAvisoForm((v) => !v);
            }}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0E1A59] text-white text-[11px] font-extrabold inline-flex items-center gap-1.5 hover:bg-[#14267D] transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showAvisoForm ? 'Fechar aviso' : 'Publicar aviso coletivo'}</span>
          </button>
        </div>

        {showAvisoForm && (
          <form
            onSubmit={handleAvisoSubmit}
            className="rounded-2xl bg-[#E6E9F0]/60 border-[1.5px] border-[#CBD5E1] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#475569]">
              <span>
                Publicando como{' '}
                <strong className="text-[#0E1A59] font-extrabold">
                  {userDisplayName || 'Estudante'}
                </strong>
              </span>
              <button
                type="button"
                onClick={onOpenConfig}
                className="inline-flex items-center gap-1 text-[#0E1A59] hover:text-[#EC1580] font-extrabold"
              >
                <Settings className="w-3 h-3" aria-hidden="true" />
                <span>Alterar meu nome</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="aviso-materia" className="block text-[11px] font-bold text-[#475569] mb-1">
                  Disciplina
                </label>
                <select
                  id="aviso-materia"
                  value={avisoMateriaId || materias[0]?.id || ''}
                  onChange={(e) => setAvisoMateriaId(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-bold text-[#0E1A59]"
                >
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {!m.catalogoId ? ` [${resolveDisciplinaKey(m)}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="aviso-tipo" className="block text-[11px] font-bold text-[#475569] mb-1">
                  Tipo do aviso
                </label>
                <select
                  id="aviso-tipo"
                  value={avisoTipo}
                  onChange={(e) => setAvisoTipo(e.target.value as AvisoColetivoTipo)}
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-bold text-[#0E1A59]"
                >
                  <option value="sem_aula">Sem aula / Cancelada</option>
                  <option value="mudanca_sala">Mudança de sala / horário</option>
                  <option value="aviso">Aviso geral da turma</option>
                </select>
              </div>
              <div>
                <label htmlFor="aviso-data" className="block text-[11px] font-bold text-[#475569] mb-1">
                  Data referente
                </label>
                <input
                  id="aviso-data"
                  type="date"
                  value={avisoData}
                  onChange={(e) => setAvisoData(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                minLength={2}
                maxLength={240}
                aria-label="Mensagem do aviso coletivo"
                value={avisoMsg}
                onChange={(e) => setAvisoMsg(e.target.value)}
                placeholder="Ex.: Professor avisou no grupo que não haverá aula hoje."
                className="flex-1 min-h-[42px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
              />
              <button
                type="submit"
                disabled={publishingAviso || avisoMsg.trim().length < 2}
                className="min-h-[42px] px-4 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170] disabled:opacity-60 whitespace-nowrap"
              >
                {publishingAviso ? 'Enviando...' : 'Enviar para turma'}
              </button>
            </div>
          </form>
        )}

        {avisosColetivos.length === 0 ? (
          <p className="text-xs text-[#475569] bg-[#E6E9F0]/40 border border-[#CBD5E1] rounded-2xl p-4">
            Nenhum aviso coletivo ativo para suas disciplinas no momento. Quando alguém da mesma matéria registrar cancelamento ou comunicado, ele aparece aqui.
          </p>
        ) : (
          <div className="space-y-2.5">
            {avisosColetivos.map((aviso) => {
              const matchedMat = materias.find(
                (m) => resolveDisciplinaKey(m) === aviso.disciplinaKey
              );
              const inscritos = matchedMat
                ? getEnrolledCountForMateria(matchedMat, comunidadeMap)
                : comunidadeMap[aviso.disciplinaKey]?.inscritosCount || 0;
              const alreadyAppliedSemAula =
                aviso.tipo === 'sem_aula' &&
                Boolean(
                  matchedMat &&
                    faltas.some(
                      (f) =>
                        f.materiaId === matchedMat.id &&
                        f.data === aviso.data &&
                        f.tipo === 'sem_aula'
                    )
                );

              const badgeMeta = getCalendarBadgeMeta(aviso.tipo);
              return (
                <div
                  key={aviso.id}
                  className="rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] p-3.5 sm:p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        style={{
                          backgroundColor: badgeMeta.bgColor,
                          color: badgeMeta.textColor,
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap"
                      >
                        {badgeMeta.label}
                      </span>
                      {aviso.isOficial && (
                        <span className="px-2 py-0.5 rounded-full bg-[#0E1A59] text-white text-[10px] font-extrabold">
                          Oficial
                        </span>
                      )}
                      <span className="text-xs font-extrabold text-[#0E1A59]">
                        {aviso.disciplinaNome}
                      </span>
                      {inscritos > 0 && (
                        <span className="text-[10px] font-mono tabular-nums font-bold text-[#475569]">
                          · {inscritos} {inscritos === 1 ? 'inscrito' : 'inscritos'}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenCalendarioDate(aviso.data)}
                      className="text-[11px] font-mono tabular-nums font-bold text-[#0E1A59] hover:text-[#EC1580] underline decoration-[#CBD5E1] underline-offset-2"
                    >
                      {formatDatePtBr(aviso.data)}
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-[#0E1A59] leading-snug">
                    {aviso.mensagem}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-[#475569] font-semibold">
                      Enviado por {aviso.autorNome}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {aviso.tipo === 'sem_aula' && matchedMat && !alreadyAppliedSemAula && (
                        <button
                          type="button"
                          onClick={() => handleApplySemAulaFromAviso(aviso)}
                          className="min-h-[34px] px-2.5 rounded-lg bg-[#DCFCE7] text-[#15803D] text-[11px] font-extrabold hover:bg-[#bbf7d0] transition-colors whitespace-nowrap"
                        >
                          Aplicar Sem Aula
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={Boolean(aviso.confirmadoPorMim)}
                        onClick={() => onConfirmAviso(aviso.id)}
                        className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                          aviso.confirmadoPorMim
                            ? 'bg-[#E6E9F0] text-[#0E1A59] border border-[#CBD5E1]'
                            : 'bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] hover:border-[#0E1A59]'
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" aria-hidden="true" />
                        <span className="font-mono tabular-nums">{aviso.confirmacoes}</span>
                      </button>
                      {(aviso.autorUid === currentUserUid || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => onDeleteAviso(aviso.id)}
                          aria-label="Remover aviso coletivo"
                          className="min-h-[34px] min-w-[34px] rounded-lg border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#EC1580] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bento Card 5: Radar da Semana (Seg a Sáb) */}
      <section className="bento-card p-5 sm:p-6 space-y-3" aria-labelledby="radar-semana-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="radar-semana-heading" className="text-sm font-extrabold text-[#0E1A59]">
              Radar da semana
            </h2>
            <span className="text-xs text-[#475569]">Toque em um dia para ver aulas</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenGradeSemanal}
              className="min-h-[36px] px-3 rounded-xl bg-[#0E1A59] text-white text-[11px] font-extrabold hover:bg-[#14267D] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Grade Semanal</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenCalendario}
              className="min-h-[36px] px-3 rounded-xl bg-[#E6E9F0]/70 border border-[#CBD5E1] text-[11px] font-extrabold text-[#0E1A59] hover:border-[#0E1A59] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Abrir calendário</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {weekDates.map((dStr) => {
            const dow = getDiaSemanaFromIso(dStr) as DiaSemana;
            const holiday = isFeriado(dStr, semestreConfig.feriados);
            const hasClass =
              !holiday && materias.some((m) => m.horarios.some((h) => h.diaSemana === dow));
            const hasProgramada = faltas.some((f) => f.data === dStr && f.tipo === 'programada');
            const hasFalta = faltas.some((f) => f.data === dStr && f.tipo === 'falta');
            const isSelected = selectedDayStr === dStr;
            const isToday = dStr === todayStr;

            return (
              <button
                key={dStr}
                type="button"
                onClick={() => setSelectedDayStr(dStr)}
                className={`min-h-[68px] rounded-2xl border-[1.5px] p-1.5 sm:p-2 flex flex-col items-center justify-between transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-[#0E1A59] text-white border-[#0E1A59]'
                    : hasProgramada
                    ? 'bg-[#FCE7F3] text-[#0E1A59] border-[#EC1580]/50'
                    : 'bg-[#E6E9F0]/50 text-[#0E1A59] border-[#CBD5E1] hover:border-[#94A3B8]'
                }`}
              >
                <span
                  className={`text-[11px] font-bold ${
                    isSelected ? 'text-indigo-200' : 'text-[#475569]'
                  }`}
                >
                  {DIA_SEMANA_LABELS[dow].short}
                </span>
                <span className="font-mono tabular-nums text-sm font-extrabold">
                  {dStr.slice(8, 10)}
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    !isSelected && hasProgramada ? 'text-[#BE185D]' : ''
                  }`}
                >
                  {holiday
                    ? 'Feriado'
                    : hasProgramada
                    ? 'Folga'
                    : hasFalta
                    ? 'Falta'
                    : hasClass
                    ? isToday
                      ? 'Hoje'
                      : 'Aula'
                    : 'Livre'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
