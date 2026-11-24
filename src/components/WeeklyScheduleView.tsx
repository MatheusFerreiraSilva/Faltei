import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import {
  AvisoColetivo,
  DiaSemana,
  DisciplinaComunidade,
  FaltaDetalheTipo,
  FaltaTipo,
  SemAulaConsenso,
  SemestreConfig,
  UserEvento,
  UserEventoTipo,
  UserFalta,
  UserMateria,
} from '../types/domain';
import {
  formatDatePtBr,
  formatNumberClean,
  getEffectiveFaltaHoras,
  getPeriodoStyle,
} from '../utils/attendance';
import { getEnrolledCountForMateria } from '../utils/disciplinaKey';
import {
  buildWeeklyScheduleModel,
  getNowIndicatorOffsetPx,
  shiftWeekIso,
  WEEKLY_HOUR_TICKS,
  WEEKLY_TOTAL_HEIGHT_PX,
  WeeklyDayColumn,
  WeeklyGridBlock,
} from '../utils/weeklyGrid';
import { SmartFaltaSelector } from './SmartFaltaSelector';

interface WeeklyScheduleViewProps {
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  comunidadeMap: Record<string, DisciplinaComunidade>;
  semAulaConsensoMap: Record<string, SemAulaConsenso>;
  avisosColetivos: AvisoColetivo[];
  requestedDate?: { iso: string; nonce: number } | null;
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
  onAddEvento: (params: {
    materia?: UserMateria;
    disciplinaNome?: string;
    data: string;
    tipo: UserEventoTipo;
    titulo: string;
    detalhes?: string;
    grupo?: string;
    horario?: string;
  }) => Promise<unknown>;
  onOpenGrade: () => void;
}

const QUICK_EVAL_OPTIONS: Array<{ tipo: UserEventoTipo; label: string }> = [
  { tipo: 'prova', label: 'Prova' },
  { tipo: 'trabalho', label: 'Trabalho' },
  { tipo: 'trabalho_grupo', label: 'Trab. Grupo' },
  { tipo: 'seminario', label: 'Seminário' },
];

export const WeeklyScheduleView: React.FC<WeeklyScheduleViewProps> = ({
  todayStr,
  semestreConfig,
  materias,
  faltas,
  eventos,
  comunidadeMap,
  semAulaConsensoMap,
  avisosColetivos,
  requestedDate,
  onRecordFalta,
  onDeleteFalta,
  onAddEvento,
  onOpenGrade,
}) => {
  const [anchorIso, setAnchorIso] = useState<string>(requestedDate?.iso || todayStr);
  const [zoomWholeWeek, setZoomWholeWeek] = useState<boolean>(false);
  const [nowPx, setNowPx] = useState<number | null>(() =>
    getNowIndicatorOffsetPx(new Date())
  );
  const [selectedSlot, setSelectedSlot] = useState<{
    block: WeeklyGridBlock;
    col: WeeklyDayColumn;
  } | null>(null);
  const [activeDayJumpIso, setActiveDayJumpIso] = useState<string>(todayStr);

  // Quick evaluation inline form inside contextual bottom sheet
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [evalTipo, setEvalTipo] = useState<UserEventoTipo>('prova');
  const [evalTitulo, setEvalTitulo] = useState('');
  const [evalGrupo, setEvalGrupo] = useState('');
  const [evalDetalhes, setEvalDetalhes] = useState('');
  const [savingEval, setSavingEval] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const dayColRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (requestedDate?.iso) {
      setAnchorIso(requestedDate.iso);
      setActiveDayJumpIso(requestedDate.iso);
    }
  }, [requestedDate]);

  useEffect(() => {
    const updateNow = () => setNowPx(getNowIndicatorOffsetPx(new Date()));
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const model = useMemo(
    () =>
      buildWeeklyScheduleModel({
        anchorIso,
        todayStr,
        semestreConfig,
        materias,
        faltas,
        eventos,
        avisosColetivos,
        semAulaConsensoMap,
      }),
    [
      anchorIso,
      avisosColetivos,
      eventos,
      faltas,
      materias,
      semAulaConsensoMap,
      semestreConfig,
      todayStr,
    ]
  );

  // Keep contextual sheet synced with latest faltas / eventos after mutations
  const liveSelectedBlock = useMemo(() => {
    if (!selectedSlot) return null;
    for (const col of model.columns) {
      const found = col.blocks.find((b) => b.id === selectedSlot.block.id);
      if (found) return { block: found, col };
    }
    return selectedSlot;
  }, [model.columns, selectedSlot]);

  // Auto-center horizontal scroll on today's column when not in Zoom mode
  useEffect(() => {
    if (zoomWholeWeek) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const targetCol =
      model.columns.find((c) => c.isoDate === activeDayJumpIso) ||
      model.columns.find((c) => c.isToday) ||
      model.columns[0];
    if (!targetCol) return;
    const el = dayColRefs.current[targetCol.isoDate];
    if (!el) return;

    const stickyAxisWidth = 48;
    const targetLeft = Math.max(
      0,
      el.offsetLeft - stickyAxisWidth - Math.max(0, (container.clientWidth - stickyAxisWidth - el.clientWidth) / 2)
    );
    container.scrollTo({ left: targetLeft, behavior: 'auto' });
  }, [activeDayJumpIso, model.columns, zoomWholeWeek]);

  const handleJumpDay = (isoDate: string) => {
    setActiveDayJumpIso(isoDate);
    if (zoomWholeWeek) return;
    const container = scrollContainerRef.current;
    const el = dayColRefs.current[isoDate];
    if (container && el) {
      const stickyAxisWidth = 48;
      const targetLeft = Math.max(0, el.offsetLeft - stickyAxisWidth);
      container.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
  };

  const handleOpenBlockSheet = (block: WeeklyGridBlock, col: WeeklyDayColumn) => {
    setSelectedSlot({ block, col });
    setShowEvalForm(false);
    setEvalTipo('prova');
    setEvalTitulo('');
    setEvalGrupo('');
    setEvalDetalhes('');
  };

  const handleSubmitQuickEval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSelectedBlock || evalTitulo.trim().length < 2) return;
    setSavingEval(true);
    try {
      await onAddEvento({
        materia: liveSelectedBlock.block.materia,
        disciplinaNome: liveSelectedBlock.block.materia.nome,
        data: liveSelectedBlock.block.isoDate,
        tipo: evalTipo,
        titulo: evalTitulo.trim(),
        grupo: evalGrupo.trim() || undefined,
        detalhes: evalDetalhes.trim() || undefined,
        horario: liveSelectedBlock.block.bloco.horarioInicio,
      });
      setEvalTitulo('');
      setEvalGrupo('');
      setEvalDetalhes('');
      setShowEvalForm(false);
    } finally {
      setSavingEval(false);
    }
  };

  if (materias.length === 0) {
    return (
      <section className="bento-card p-6 sm:p-8 text-center space-y-4">
        <h2 className="text-lg font-black text-[#0E1A59]">Grade Semanal Proporcional</h2>
        <p className="text-xs sm:text-sm text-[#475569] max-w-md mx-auto">
          Importe seu período ou adicione suas matérias para visualizar os blocos proporcionais de 07:00 às 19:00 com almoço, feriados e avaliações.
        </p>
        <button
          type="button"
          onClick={onOpenGrade}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D]"
        >
          Ir para Grade e Importar
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Controls + Quick Weekday Jump + Zoom Toggle */}
      <section
        className="bento-card p-3.5 sm:p-5 space-y-3 overflow-hidden"
        aria-label="Grade Horária Semanal Proporcional"
        data-testid="weekly-schedule-view"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAnchorIso((prev) => shiftWeekIso(prev, -1))}
              aria-label="Semana anterior"
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Semana Anterior</span>
            </button>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#E6E9F0] text-center">
              <p className="text-[10px] font-extrabold text-[#EC1580] leading-none">
                {model.isCurrentWeek ? 'Semana Atual' : 'Semana'}
              </p>
              <p className="font-mono tabular-nums text-xs sm:text-sm font-black text-[#0E1A59] leading-tight mt-0.5">
                {model.rangeLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAnchorIso((prev) => shiftWeekIso(prev, 1))}
              aria-label="Próxima semana"
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] inline-flex items-center gap-1"
            >
              <span className="hidden sm:inline">Próxima Semana</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAnchorIso(todayStr);
                setActiveDayJumpIso(todayStr);
              }}
              className="min-h-[40px] px-3 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59]"
            >
              Hoje
            </button>

            <button
              type="button"
              data-testid="toggle-zoom-semana"
              aria-pressed={zoomWholeWeek}
              onClick={() => setZoomWholeWeek((v) => !v)}
              className={`min-h-[40px] px-3 rounded-xl border-[1.5px] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                zoomWholeWeek
                  ? 'bg-[#0E1A59] text-white border-[#0E1A59]'
                  : 'bg-[#FCE7F3]/60 text-[#BE185D] border-[#EC1580]/40 hover:border-[#EC1580]'
              }`}
            >
              {zoomWholeWeek ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Modo Detalhado</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Zoom Semana Inteira</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Weekday Jump Bar */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Navegação rápida por dia da semana"
        >
          {model.columns.map((col) => {
            const isActive = activeDayJumpIso === col.isoDate;
            const hasEval = col.dayEvaluations.length > 0;
            return (
              <button
                key={col.isoDate}
                type="button"
                onClick={() => handleJumpDay(col.isoDate)}
                className={`min-h-[34px] px-3 rounded-xl text-xs font-extrabold whitespace-nowrap inline-flex items-center gap-1.5 border-[1.5px] transition-colors shrink-0 ${
                  isActive
                    ? 'bg-[#0E1A59] text-white border-[#0E1A59]'
                    : col.isToday
                    ? 'bg-[#FCE7F3] text-[#BE185D] border-[#EC1580]/60'
                    : 'bg-white text-[#0E1A59] border-[#CBD5E1] hover:border-[#0E1A59]'
                }`}
              >
                <span>{col.shortLabel}</span>
                <span className="font-mono tabular-nums text-[10px] opacity-80">
                  {col.dateLabel}
                </span>
                {hasEval && (
                  <span
                    className="w-2 h-2 rounded-full bg-[#EC1580] shrink-0"
                    title="Dia com avaliação"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Proportional Time Grid (07:00 - 19:00, 1h = 52px) */}
        <div
          ref={scrollContainerRef}
          data-testid="weekly-grid-scroll"
          className={`relative rounded-2xl border-[1.5px] border-[#CBD5E1] bg-white ${
            zoomWholeWeek
              ? 'overflow-hidden'
              : 'overflow-x-auto snap-x snap-mandatory'
          }`}
        >
          <div
            className={
              zoomWholeWeek ? 'flex w-full min-w-0' : 'flex min-w-max md:min-w-0 w-full'
            }
          >
            {/* Sticky Left Time Axis (07h..19h) */}
            <div
              className={`sticky left-0 z-20 shrink-0 bg-white border-r-[1.5px] border-[#CBD5E1] ${
                zoomWholeWeek ? 'w-9 sm:w-12' : 'w-12'
              }`}
            >
              {/* Top Corner Header matching day headers */}
              <div className="h-14 border-b-[1.5px] border-[#CBD5E1] flex items-center justify-center bg-[#E6E9F0]/60">
                <Clock className="w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
              </div>

              {/* Hour labels 07h..19h */}
              <div className="relative h-[624px]" data-testid="weekly-hour-axis">
                {WEEKLY_HOUR_TICKS.map((hour, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === WEEKLY_HOUR_TICKS.length - 1;
                  return (
                    <div
                      key={hour}
                      style={{ top: `${idx * 52}px` }}
                      className={`absolute left-0 right-0 flex items-start justify-center font-mono tabular-nums font-bold text-[#475569] ${
                        zoomWholeWeek ? 'text-[9px] sm:text-[11px]' : 'text-[11px]'
                      } ${isFirst ? 'translate-y-0.5' : isLast ? '-translate-y-3.5' : '-translate-y-2'}`}
                    >
                      {String(hour).padStart(2, '0')}h
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Day Columns */}
            <div
              className={
                zoomWholeWeek
                  ? `flex-1 min-w-0 grid ${
                      model.hasSaturday ? 'grid-cols-6' : 'grid-cols-5'
                    }`
                  : 'flex-1 flex min-w-0'
              }
            >
              {model.columns.map((col) => {
                const hasEval = col.dayEvaluations.length > 0;
                return (
                  <div
                    key={col.isoDate}
                    ref={(el) => {
                      dayColRefs.current[col.isoDate] = el;
                    }}
                    data-testid={`weekly-col-${col.diaSemana}`}
                    className={`${
                      zoomWholeWeek
                        ? 'min-w-0 overflow-hidden border-r border-[#CBD5E1] last:border-r-0'
                        : 'flex-1 min-w-[148px] md:min-w-0 snap-center border-r border-[#CBD5E1] last:border-r-0'
                    }`}
                  >
                    {/* Column Header */}
                    <div
                      className={`h-14 overflow-hidden ${
                        zoomWholeWeek ? 'px-1 sm:px-2' : 'px-2 sm:px-2.5'
                      } border-b-[1.5px] border-[#CBD5E1] flex flex-col justify-center ${
                        col.isToday
                          ? 'bg-[#FCE7F3]/60'
                          : col.holiday
                          ? 'bg-[#DCFCE7]/50'
                          : 'bg-[#E6E9F0]/45'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-0.5 min-w-0">
                        <span
                          className={`font-black leading-none shrink-0 ${
                            zoomWholeWeek ? 'text-[9px] sm:text-xs' : 'text-xs'
                          } ${col.isToday ? 'text-[#EC1580]' : 'text-[#0E1A59]'}`}
                        >
                          {zoomWholeWeek ? col.shortLabel.replace('F', '') : col.shortLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-bold leading-none truncate ${
                            zoomWholeWeek ? 'text-[8px] sm:text-[11px]' : 'text-[11px]'
                          } ${
                            col.isToday
                              ? `${zoomWholeWeek ? 'px-1 py-0.5' : 'px-1.5 py-0.5'} rounded-full bg-[#EC1580] text-white`
                              : 'text-[#475569]'
                          }`}
                        >
                          {zoomWholeWeek ? col.dateLabel.slice(0, 2) : col.dateLabel}
                        </span>
                      </div>

                      {col.holiday ? (
                        <span className="text-[9px] font-extrabold text-[#15803D] truncate mt-1">
                          Feriado: {col.holiday.nome}
                        </span>
                      ) : hasEval ? (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-[#BE185D] truncate mt-1">
                          <ClipboardCheck className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {col.dayEvaluations.length}{' '}
                            {col.dayEvaluations.length === 1 ? 'avaliação' : 'avaliações'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold text-[#64748B] truncate mt-1">
                          {col.blocks.length === 0
                            ? 'Livre'
                            : `${col.blocks.length} ${
                                col.blocks.length === 1 ? 'bloco' : 'blocos'
                              }`}
                        </span>
                      )}
                    </div>

                    {/* Proportional Timeline Body (624px = 12h * 52px) */}
                    <div className="relative h-[624px] bg-white">
                      {/* Horizontal Hour Grid Lines */}
                      {WEEKLY_HOUR_TICKS.slice(0, -1).map((hour, idx) => (
                        <div
                          key={hour}
                          style={{ top: `${idx * 52}px`, height: '52px' }}
                          className={`absolute left-0 right-0 border-b border-[#E2E8F0] pointer-events-none ${
                            hour === 12 ? 'bg-[#E6E9F0]/35' : ''
                          }`}
                        />
                      ))}

                      {/* Live Now Line ("Linha Agora") in Today's Column */}
                      {col.isToday && nowPx !== null && (
                        <div
                          data-testid="weekly-now-line"
                          style={{ top: `${nowPx}px` }}
                          className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                        >
                          <span className="w-2.5 h-2.5 -ml-1 rounded-full bg-[#EC1580] animate-pulse shrink-0" />
                          <div className="h-[2px] flex-1 bg-[#EC1580]" />
                        </div>
                      )}

                      {/* Class Blocks */}
                      {col.blocks.map((block) => {
                        const pStyle = getPeriodoStyle(block.materia.periodo);
                        const isFaltaOrProg =
                          block.visualState === 'falta' ||
                          block.visualState === 'programada';
                        const isSemAulaOrHoliday =
                          block.visualState === 'sem_aula' ||
                          block.visualState === 'feriado';
                        const hasBlockEval = block.evaluations.length > 0;
                        const isPartial =
                          block.falta?.tipoFalta === 'parcial' &&
                          getEffectiveFaltaHoras(block.falta) < block.bloco.horas;

                        const widthPct = 100 / block.totalCols;
                        const leftPct = block.colIndex * widthPct;

                        return (
                          <button
                            key={block.id}
                            type="button"
                            data-testid={`weekly-block-${block.materia.id}-${block.bloco.turno}`}
                            onClick={() => handleOpenBlockSheet(block, col)}
                            style={{
                              top: `${block.topPx + 1}px`,
                              height: `${Math.max(24, block.heightPx - 2)}px`,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              borderLeftColor: isFaltaOrProg
                                ? '#EC1580'
                                : pStyle.borderColor,
                            }}
                            className={`absolute z-10 rounded-xl border-[1.5px] border-l-4 text-left overflow-hidden transition-all active:scale-[0.98] flex flex-col justify-between ${
                              zoomWholeWeek ? 'p-1' : 'p-1.5 sm:p-2'
                            } ${
                              isSemAulaOrHoliday
                                ? 'opacity-65 border-[#CBD5E1] bg-[repeating-linear-gradient(-45deg,#F8FAFC,#F8FAFC_6px,#E2E8F0_6px,#E2E8F0_12px)]'
                                : isFaltaOrProg
                                ? 'border-[#EC1580] bg-[#FCE7F3]/75 shadow-sm'
                                : hasBlockEval
                                ? 'border-[#EC1580]/70 bg-white ring-1 ring-[#EC1580]/30 hover:border-[#0E1A59]'
                                : 'border-[#CBD5E1] bg-white hover:border-[#0E1A59] shadow-xs'
                            }`}
                          >
                            <div className="min-w-0 space-y-0.5">
                              {/* Status / Period Badges */}
                              <div className="flex flex-wrap items-center gap-1">
                                {!zoomWholeWeek && (
                                  <span className="font-mono tabular-nums text-[9px] font-bold text-[#475569] leading-none">
                                    {block.bloco.horarioInicio}–{block.bloco.horarioFim}
                                  </span>
                                )}
                                {block.visualState === 'falta' && (
                                  <span className="px-1 py-0.5 rounded bg-[#EC1580] text-white text-[8px] font-black leading-none uppercase">
                                    {isPartial
                                      ? `PARCIAL ${formatNumberClean(getEffectiveFaltaHoras(block.falta!))}h`
                                      : 'FALTEI'}
                                  </span>
                                )}
                                {block.visualState === 'programada' && (
                                  <span className="px-1 py-0.5 rounded bg-[#EC1580] text-white text-[8px] font-black leading-none uppercase">
                                    PROGRAMADA
                                  </span>
                                )}
                                {isSemAulaOrHoliday && (
                                  <span className="px-1 py-0.5 rounded bg-[#15803D] text-white text-[8px] font-black leading-none uppercase">
                                    {block.visualState === 'feriado'
                                      ? 'FERIADO'
                                      : 'SEM AULA'}
                                  </span>
                                )}
                                {hasBlockEval && (
                                  <span className="px-1 py-0.5 rounded bg-[#0E1A59] text-white text-[8px] font-black leading-none inline-flex items-center gap-0.5">
                                    <ClipboardCheck className="w-2.5 h-2.5" aria-hidden="true" />
                                    {!zoomWholeWeek && (
                                      <span>{block.evaluations[0].tipo === 'prova' ? 'PROVA' : 'ENTREGA'}</span>
                                    )}
                                  </span>
                                )}
                              </div>

                              <p
                                className={`font-extrabold text-[#0E1A59] leading-tight ${
                                  zoomWholeWeek
                                    ? 'text-[9px] sm:text-[10px] line-clamp-2'
                                    : block.heightPx >= 95
                                    ? 'text-xs line-clamp-3'
                                    : 'text-[11px] line-clamp-1'
                                }`}
                              >
                                {block.materia.nome}
                              </p>
                            </div>

                            {!zoomWholeWeek && block.heightPx >= 78 && (
                              <div className="flex items-center justify-between gap-1 text-[10px] text-[#475569] font-semibold">
                                <span className="truncate">
                                  {block.bloco.local || block.materia.local || pStyle.shortLabel}
                                </span>
                                <span className="font-mono tabular-nums font-bold text-[#0E1A59] shrink-0">
                                  {formatNumberClean(block.bloco.horas)}h
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-[#475569] pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-[1.5px] border-[#CBD5E1] border-l-4 border-l-[#0E1A59] bg-white" />
            <span>Aula normal</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-[1.5px] border-[#EC1580] bg-[#FCE7F3]" />
            <span>Falta / Programada</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#CBD5E1] bg-[repeating-linear-gradient(-45deg,#F8FAFC,#F8FAFC_3px,#CBD5E1_3px,#CBD5E1_6px)]" />
            <span>Sem aula / Feriado</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#EC1580]" />
            <span>Linha Agora</span>
          </span>
          <span className="ml-auto font-mono tabular-nums text-[10px] text-[#64748B]">
            Escala proporcional: 1h = 52px ({WEEKLY_TOTAL_HEIGHT_PX}px total)
          </span>
        </div>
      </section>

      {/* Contextual 1-Tap Bottom Sheet / Modal */}
      {liveSelectedBlock && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#09113B]/50 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weekly-sheet-title"
          data-testid="weekly-block-sheet"
        >
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl border-[1.5px] border-[#CBD5E1] shadow-2xl max-h-[88vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            {/* Sheet Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    style={{
                      backgroundColor: getPeriodoStyle(liveSelectedBlock.block.materia.periodo).badgeBg,
                      color: getPeriodoStyle(liveSelectedBlock.block.materia.periodo).badgeText,
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold"
                  >
                    {getPeriodoStyle(liveSelectedBlock.block.materia.periodo).label}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] font-bold text-[#475569]">
                    {liveSelectedBlock.col.fullLabel} · {formatDatePtBr(liveSelectedBlock.block.isoDate)}
                  </span>
                  {getEnrolledCountForMateria(liveSelectedBlock.block.materia, comunidadeMap) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#0E1A59] bg-[#E6E9F0] px-2 py-0.5 rounded-full font-mono tabular-nums">
                      <Users className="w-3 h-3" aria-hidden="true" />
                      {getEnrolledCountForMateria(liveSelectedBlock.block.materia, comunidadeMap)}
                    </span>
                  )}
                </div>

                <h2 id="weekly-sheet-title" className="text-base sm:text-lg font-black text-[#0E1A59] leading-snug">
                  {liveSelectedBlock.block.materia.nome}
                </h2>

                <p className="text-xs font-mono tabular-nums font-bold text-[#475569]">
                  {liveSelectedBlock.block.bloco.horarioInicio}–{liveSelectedBlock.block.bloco.horarioFim} (
                  {formatNumberClean(liveSelectedBlock.block.bloco.horas)}h)
                  {liveSelectedBlock.block.bloco.local || liveSelectedBlock.block.materia.local
                    ? ` · ${liveSelectedBlock.block.bloco.local || liveSelectedBlock.block.materia.local}`
                    : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                aria-label="Fechar detalhes da aula"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Evaluations on this date/subject */}
            {liveSelectedBlock.block.evaluations.length > 0 && (
              <div className="space-y-1.5">
                {liveSelectedBlock.block.evaluations.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-xl bg-[#FCE7F3]/70 border border-[#EC1580]/40 px-3 py-2 flex items-start gap-2"
                  >
                    <ClipboardCheck className="w-4 h-4 text-[#EC1580] shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#0E1A59]">{ev.titulo}</p>
                      {(ev.grupo || ev.detalhes) && (
                        <p className="text-[11px] font-semibold text-[#475569]">
                          {[ev.grupo, ev.detalhes].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Crowd Sem Aula Consensus */}
            {!liveSelectedBlock.block.falta &&
              liveSelectedBlock.block.semAulaConsensusCount > 0 && (
                <div className="rounded-xl bg-[#DCFCE7]/85 border border-[#86EFAC] p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-extrabold text-[#15803D]">
                      {liveSelectedBlock.block.semAulaConsensusCount}{' '}
                      {liveSelectedBlock.block.semAulaConsensusCount === 1
                        ? 'pessoa falou que não teve aula'
                        : 'pessoas falaram que não teve aula'}
                      {liveSelectedBlock.block.semAulaAutorHint
                        ? ` · ${liveSelectedBlock.block.semAulaAutorHint}`
                        : ''}
                    </p>
                    <p className="text-[11px] font-semibold text-[#166534]">
                      Marque Sem Aula em 1 toque para poupar cliques.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onRecordFalta({
                        materiaId: liveSelectedBlock.block.materia.id,
                        data: liveSelectedBlock.block.isoDate,
                        diaSemana: liveSelectedBlock.block.diaSemana,
                        horas: liveSelectedBlock.block.bloco.horas,
                        tipo: 'sem_aula',
                        tipoFalta: 'dia_completo',
                        horasAbatidas: liveSelectedBlock.block.bloco.horas,
                      })
                    }
                    className="min-h-[34px] px-3 rounded-lg bg-[#15803D] text-white text-[11px] font-extrabold hover:bg-[#166534]"
                  >
                    Sim, Sem Aula
                  </button>
                </div>
              )}

            {/* Existing record or Smart Attendance Selector */}
            {liveSelectedBlock.col.holiday ? (
              <div className="rounded-2xl bg-[#DCFCE7]/60 border border-[#86EFAC] p-3.5 flex items-center gap-2.5 text-xs font-bold text-[#15803D]">
                <CalendarOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Feriado oficial ({liveSelectedBlock.col.holiday.nome}). Nenhuma hora é abatida da sua cota.
                </span>
              </div>
            ) : liveSelectedBlock.block.falta ? (
              <div className="rounded-2xl bg-[#E6E9F0]/70 border-[1.5px] border-[#CBD5E1] p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#0E1A59]">
                  {liveSelectedBlock.block.falta.tipo === 'sem_aula' ? (
                    <CalendarCheck className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                  ) : (
                    <CalendarClock className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
                  )}
                  <span>
                    {liveSelectedBlock.block.falta.tipo === 'sem_aula'
                      ? 'Marcado como Sem Aula (cota preservada)'
                      : liveSelectedBlock.block.falta.tipo === 'programada'
                      ? `Falta programada (−${formatNumberClean(getEffectiveFaltaHoras(liveSelectedBlock.block.falta))}h)`
                      : `Falta registrada (−${formatNumberClean(getEffectiveFaltaHoras(liveSelectedBlock.block.falta))}h)`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteFalta(liveSelectedBlock.block.falta!.id)}
                  className="min-h-[36px] px-3 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Desfazer</span>
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#E6E9F0]/55 border-[1.5px] border-[#CBD5E1] p-3.5 space-y-2.5">
                <p className="text-xs font-extrabold text-[#0E1A59]">
                  Registrar presença ou falta nesta data
                </p>
                <SmartFaltaSelector
                  materia={liveSelectedBlock.block.materia}
                  isoDate={liveSelectedBlock.block.isoDate}
                  defaultBlocoId={liveSelectedBlock.block.bloco.id}
                  onSubmit={onRecordFalta}
                />
              </div>
            )}

            {/* Quick Inline Form: Adicionar Prova / Entrega */}
            <div className="pt-1 border-t border-[#CBD5E1] space-y-2.5">
              {!showEvalForm ? (
                <button
                  type="button"
                  onClick={() => setShowEvalForm(true)}
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
                  <span>Adicionar Prova / Entrega neste dia</span>
                </button>
              ) : (
                <form
                  onSubmit={handleSubmitQuickEval}
                  className="rounded-2xl bg-[#E6E9F0]/55 border-[1.5px] border-[#CBD5E1] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-extrabold text-[#0E1A59]">
                      Nova avaliação / entrega
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowEvalForm(false)}
                      className="text-[11px] font-bold text-[#475569] hover:text-[#0E1A59]"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {QUICK_EVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.tipo}
                        type="button"
                        onClick={() => setEvalTipo(opt.tipo)}
                        className={`min-h-[34px] px-2 rounded-lg text-[11px] font-extrabold border transition-colors ${
                          evalTipo === opt.tipo
                            ? 'bg-[#0E1A59] text-white border-[#0E1A59]'
                            : 'bg-white text-[#0E1A59] border-[#CBD5E1]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={160}
                    value={evalTitulo}
                    onChange={(e) => setEvalTitulo(e.target.value)}
                    placeholder="Ex.: P1 Teórica / Entrega de caso clínico"
                    className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                  />

                  {evalTipo === 'trabalho_grupo' && (
                    <input
                      type="text"
                      maxLength={100}
                      value={evalGrupo}
                      onChange={(e) => setEvalGrupo(e.target.value)}
                      placeholder="Grupo / Integrantes (opcional)"
                      className="w-full min-h-[38px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                    />
                  )}

                  <input
                    type="text"
                    maxLength={240}
                    value={evalDetalhes}
                    onChange={(e) => setEvalDetalhes(e.target.value)}
                    placeholder="Conteúdo / Sala (opcional)"
                    className="w-full min-h-[38px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                  />

                  <button
                    type="submit"
                    disabled={savingEval || evalTitulo.trim().length < 2}
                    className="w-full min-h-[40px] rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170] disabled:opacity-60"
                  >
                    {savingEval ? 'Salvando...' : 'Salvar avaliação'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
