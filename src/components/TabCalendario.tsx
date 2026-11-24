import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BookmarkPlus,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  MapPin,
  Megaphone,
  Plus,
  Presentation,
  Share2,
  ThumbsUp,
  Trash2,
  Undo2,
  UserX,
  Users,
  X,
} from 'lucide-react';
import {
  AvisoColetivo,
  AvisoColetivoTipo,
  DiaSemana,
  DisciplinaComunidade,
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
  getDiaSemanaFromIso,
  getPeriodoStyle,
  parseIsoUtc,
} from '../utils/attendance';
import {
  buildCalendarMonthCells,
  CalendarBadgeType,
  CalendarDayItem,
  CalendarFilterMode,
  countMonthSummary,
  getCalendarBadgeMeta,
  getMonthLabelPtBr,
  parseYearMonthFromIso,
  shiftYearMonth,
} from '../utils/calendar';
import {
  getClassSemAulaConsensus,
  getEnrolledCountForMateria,
  resolveDisciplinaKey,
} from '../utils/disciplinaKey';

interface TabCalendarioProps {
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  comunidadeMap: Record<string, DisciplinaComunidade>;
  semAulaConsensoMap: Record<string, SemAulaConsenso>;
  avisosColetivos: AvisoColetivo[];
  requestedDate?: { iso: string; nonce: number } | null;
  currentUserUid: string;
  isAdmin: boolean;
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
  onDeleteEvento: (eventoId: string) => Promise<void>;
  onPublishAviso: (params: {
    materia: UserMateria;
    data: string;
    tipo: AvisoColetivoTipo;
    mensagem: string;
  }) => Promise<void>;
  onConfirmAviso: (avisoId: string) => Promise<void>;
  onDeleteAviso: (avisoId: string) => Promise<void>;
  onRecordFalta: (params: {
    materiaId: string;
    data: string;
    diaSemana: DiaSemana;
    horas: number;
    tipo: FaltaTipo;
  }) => Promise<void>;
  onDeleteFalta: (faltaId: string) => Promise<void>;
  onOpenGrade: () => void;
}

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const FULL_WEEKDAYS_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const EVENT_TYPE_OPTIONS: Array<{
  tipo: UserEventoTipo;
  label: string;
  placeholderTitulo: string;
}> = [
  { tipo: 'prova', label: 'Prova', placeholderTitulo: 'Ex.: P1 / P2 — Conteúdo teórico' },
  { tipo: 'trabalho', label: 'Trabalho', placeholderTitulo: 'Ex.: Entrega do fichamento ou caso' },
  {
    tipo: 'trabalho_grupo',
    label: 'Trab. Grupo',
    placeholderTitulo: 'Ex.: Apresentação clínica em equipe',
  },
  { tipo: 'seminario', label: 'Seminário', placeholderTitulo: 'Ex.: Seminário integrador' },
  { tipo: 'sem_aula', label: 'Não tem aula', placeholderTitulo: 'Ex.: Professor liberou / Congresso' },
];

const FILTER_OPTIONS: Array<{ id: CalendarFilterMode; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'avaliacoes', label: 'Provas e Trabalhos' },
  { id: 'sem_aula', label: 'Não tem aula' },
  { id: 'faltas', label: 'Faltas' },
  { id: 'aulas', label: 'Aulas' },
];

function renderBadgeIcon(type: CalendarBadgeType, className = 'w-3.5 h-3.5') {
  switch (type) {
    case 'prova':
      return <ClipboardCheck className={className} aria-hidden="true" />;
    case 'trabalho':
      return <FileText className={className} aria-hidden="true" />;
    case 'trabalho_grupo':
      return <Users className={className} aria-hidden="true" />;
    case 'seminario':
      return <Presentation className={className} aria-hidden="true" />;
    case 'sem_aula':
    case 'feriado':
      return <CalendarOff className={className} aria-hidden="true" />;
    case 'mudanca_sala':
      return <MapPin className={className} aria-hidden="true" />;
    case 'aviso':
      return <Megaphone className={className} aria-hidden="true" />;
    case 'falta':
      return <UserX className={className} aria-hidden="true" />;
    case 'programada':
      return <CalendarClock className={className} aria-hidden="true" />;
    case 'aula':
    default:
      return <BookOpen className={className} aria-hidden="true" />;
  }
}

export const TabCalendario: React.FC<TabCalendarioProps> = ({
  todayStr,
  semestreConfig,
  materias,
  faltas,
  eventos,
  comunidadeMap,
  semAulaConsensoMap,
  avisosColetivos,
  requestedDate,
  currentUserUid,
  isAdmin,
  onAddEvento,
  onDeleteEvento,
  onPublishAviso,
  onConfirmAviso,
  onDeleteAviso,
  onRecordFalta,
  onDeleteFalta,
  onOpenGrade,
}) => {
  const initialYm = useMemo(() => parseYearMonthFromIso(todayStr), [todayStr]);
  const [viewYear, setViewYear] = useState<number>(initialYm.year);
  const [viewMonth, setViewMonth] = useState<number>(initialYm.monthIndex0);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeFilter, setActiveFilter] = useState<CalendarFilterMode>('all');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [evTipo, setEvTipo] = useState<UserEventoTipo>('prova');
  const [evMateriaId, setEvMateriaId] = useState<string>(() => materias[0]?.id || '__custom__');
  const [evCustomDisciplina, setEvCustomDisciplina] = useState('');
  const [evTitulo, setEvTitulo] = useState('');
  const [evGrupo, setEvGrupo] = useState('');
  const [evHorario, setEvHorario] = useState('');
  const [evDetalhes, setEvDetalhes] = useState('');
  const [evCompartilharTurma, setEvCompartilharTurma] = useState(false);
  const [savingEvento, setSavingEvento] = useState(false);

  const detailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!requestedDate?.iso) return;
    setSelectedDate(requestedDate.iso);
    const ym = parseYearMonthFromIso(requestedDate.iso);
    setViewYear(ym.year);
    setViewMonth(ym.monthIndex0);
  }, [requestedDate]);

  const cells = useMemo(
    () =>
      buildCalendarMonthCells({
        year: viewYear,
        monthIndex0: viewMonth,
        todayStr,
        semestreConfig,
        materias,
        faltas,
        eventos,
        avisosColetivos,
        semAulaConsensoMap,
        activeFilter,
      }),
    [
      activeFilter,
      avisosColetivos,
      eventos,
      faltas,
      materias,
      semAulaConsensoMap,
      semestreConfig,
      todayStr,
      viewMonth,
      viewYear,
    ]
  );

  const monthSummary = useMemo(() => countMonthSummary(cells), [cells]);

  const selectedCell = useMemo(
    () => cells.find((c) => c.isoDate === selectedDate) || cells.find((c) => c.isToday) || cells[0],
    [cells, selectedDate]
  );

  const selectedWeekdayName = useMemo(() => {
    const dt = parseIsoUtc(selectedDate);
    return FULL_WEEKDAYS_PT[dt.getUTCDay()] || '';
  }, [selectedDate]);

  const handleShiftMonth = (delta: number) => {
    const next = shiftYearMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.monthIndex0);
  };

  const handleJumpToday = () => {
    const ym = parseYearMonthFromIso(todayStr);
    setViewYear(ym.year);
    setViewMonth(ym.monthIndex0);
    setSelectedDate(todayStr);
  };

  const handleSelectDay = (isoDate: string) => {
    setSelectedDate(isoDate);
    const ym = parseYearMonthFromIso(isoDate);
    if (ym.year !== viewYear || ym.monthIndex0 !== viewMonth) {
      setViewYear(ym.year);
      setViewMonth(ym.monthIndex0);
    }
  };

  const handleOpenCreateForm = (presetTipo?: UserEventoTipo) => {
    if (presetTipo) setEvTipo(presetTipo);
    if ((!evMateriaId || evMateriaId === '__custom__') && materias[0]) {
      setEvMateriaId(materias[0].id);
    }
    setShowCreateForm(true);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const selectedMateriaForForm = materias.find((m) => m.id === evMateriaId);

  const handleSubmitEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    const tituloTrim = evTitulo.trim();
    if (tituloTrim.length < 2) return;
    const disciplinaNome = selectedMateriaForForm
      ? selectedMateriaForForm.nome
      : evCustomDisciplina.trim();
    if (!disciplinaNome) return;

    setSavingEvento(true);
    try {
      if (evCompartilharTurma && selectedMateriaForForm) {
        const msgParts = [
          tituloTrim,
          evGrupo.trim() ? `Grupo: ${evGrupo.trim()}` : '',
          evHorario.trim() ? `Horário: ${evHorario.trim()}` : '',
          evDetalhes.trim(),
        ].filter(Boolean);
        await onPublishAviso({
          materia: selectedMateriaForForm,
          data: selectedDate,
          tipo: evTipo,
          mensagem: msgParts.join(' · ').slice(0, 240),
        });
      } else {
        await onAddEvento({
          materia: selectedMateriaForForm,
          disciplinaNome,
          data: selectedDate,
          tipo: evTipo,
          titulo: tituloTrim,
          detalhes: evDetalhes.trim() || undefined,
          grupo: evGrupo.trim() || undefined,
          horario: evHorario.trim() || undefined,
        });
      }
      setEvTitulo('');
      setEvGrupo('');
      setEvHorario('');
      setEvDetalhes('');
      setEvCustomDisciplina('');
      setShowCreateForm(false);
    } finally {
      setSavingEvento(false);
    }
  };

  const handleApplySemAulaFromItem = async (item: CalendarDayItem) => {
    if (!item.materia) return;
    const rawDow = getDiaSemanaFromIso(selectedDate);
    const dow = (rawDow >= 1 && rawDow <= 6 ? rawDow : item.materia.horarios[0]?.diaSemana || 1) as DiaSemana;
    const hMatch = item.materia.horarios.find((h) => h.diaSemana === dow) || item.materia.horarios[0];
    await onRecordFalta({
      materiaId: item.materia.id,
      data: selectedDate,
      diaSemana: dow,
      horas: hMatch?.horas || 2,
      tipo: 'sem_aula',
    });
  };

  const activeTipoOption = EVENT_TYPE_OPTIONS.find((o) => o.tipo === evTipo) || EVENT_TYPE_OPTIONS[0];

  return (
    <div className="space-y-4">
      {/* Header & Month Overview Card */}
      <section className="bento-card p-4 sm:p-6 space-y-4" aria-labelledby="calendario-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0E1A59] text-white flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1
                id="calendario-heading"
                className="text-lg sm:text-xl font-black text-[#0E1A59] leading-tight capitalize"
              >
                {getMonthLabelPtBr(viewYear, viewMonth)}
              </h1>
              <p className="text-xs font-semibold text-[#475569]">
                Toque em qualquer dia para ver aulas, provas, trabalhos ou avisos de sem aula
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => handleShiftMonth(-1)}
              aria-label="Mês anterior"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] hover:border-[#0E1A59] flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleJumpToday}
              className="min-h-[44px] px-3 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] transition-colors whitespace-nowrap"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => handleShiftMonth(1)}
              aria-label="Próximo mês"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] hover:border-[#0E1A59] flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateForm()}
              className="min-h-[44px] px-3.5 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Novo evento</span>
            </button>
          </div>
        </div>

        {/* Month KPI Summary Strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-[#475569] border-t border-[#CBD5E1]/70 pt-3">
          <span className="inline-flex items-center gap-1.5 text-[#BE185D] font-extrabold">
            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{monthSummary.provas}</span>
            <span>{monthSummary.provas === 1 ? 'prova' : 'provas'}</span>
          </span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span className="inline-flex items-center gap-1.5 text-[#6D28D9] font-extrabold">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{monthSummary.trabalhos}</span>
            <span>{monthSummary.trabalhos === 1 ? 'trabalho' : 'trabalhos'}</span>
          </span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span className="inline-flex items-center gap-1.5 text-[#0369A1] font-extrabold">
            <Presentation className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{monthSummary.seminarios}</span>
            <span>{monthSummary.seminarios === 1 ? 'seminário' : 'seminários'}</span>
          </span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span className="inline-flex items-center gap-1.5 text-[#15803D] font-extrabold">
            <CalendarOff className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{monthSummary.semAula}</span>
            <span>sem aula</span>
          </span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span className="inline-flex items-center gap-1.5 text-[#0E1A59] font-bold">
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{monthSummary.aulas}</span>
            <span>aulas no mês</span>
          </span>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar calendário">
          {FILTER_OPTIONS.map((f) => {
            const active = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0E1A59] text-white'
                    : 'bg-[#E6E9F0]/70 text-[#475569] hover:text-[#0E1A59] border border-[#CBD5E1]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Split: Large Monthly Grid + Selected Day Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.72fr_1fr] gap-4 items-start">
        {/* Large Calendar Grid Card */}
        <section className="bento-card p-3 sm:p-5 space-y-3" aria-label="Grade mensal do calendário">
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
            {WEEKDAY_HEADERS.map((wd) => (
              <div
                key={wd}
                className="py-1.5 text-[11px] font-extrabold text-[#475569] tracking-tight"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5" data-testid="calendar-month-grid">
            {cells.map((cell) => {
              const isSelected = cell.isoDate === selectedDate;
              const priorityBadges = cell.iconSummary.filter((b) => b !== 'aula');
              const hasAula = cell.iconSummary.includes('aula');
              const shownBadges = priorityBadges.slice(0, 3);
              const extraCount = Math.max(0, priorityBadges.length - shownBadges.length);

              const cellYm = parseYearMonthFromIso(cell.isoDate);
              const ariaDescParts = [
                `${cell.dayNumber} de ${getMonthLabelPtBr(cellYm.year, cellYm.monthIndex0)}`,
                cell.isToday ? 'Hoje' : '',
                ...priorityBadges.map((b) => getCalendarBadgeMeta(b).label),
                cell.classesCount > 0 ? `${cell.classesCount} aula(s)` : '',
              ].filter(Boolean);

              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  onClick={() => handleSelectDay(cell.isoDate)}
                  aria-label={ariaDescParts.join(', ')}
                  aria-pressed={isSelected}
                  className={`relative min-h-[70px] sm:min-h-[98px] rounded-2xl border-[1.5px] p-1 sm:p-2 flex flex-col justify-between text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-[#0E1A59] text-white border-[#0E1A59] ring-2 ring-[#EC1580]/70 ring-offset-1'
                      : cell.isToday
                      ? 'bg-[#FCE7F3]/45 text-[#0E1A59] border-[#EC1580]'
                      : cell.inCurrentMonth
                      ? 'bg-white text-[#0E1A59] border-[#CBD5E1] hover:border-[#0E1A59]'
                      : 'bg-[#E6E9F0]/45 text-[#94A3B8] border-[#CBD5E1]/60 hover:border-[#94A3B8]'
                  }`}
                >
                  {/* Day Number + Class Count */}
                  <div className="flex items-center justify-between gap-0.5 w-full">
                    <span
                      className={`inline-flex items-center justify-center font-mono tabular-nums text-xs sm:text-sm font-extrabold leading-none ${
                        cell.isToday && !isSelected
                          ? 'w-6 h-6 rounded-full bg-[#EC1580] text-white'
                          : isSelected
                          ? 'text-white'
                          : ''
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {hasAula && (
                      <span
                        title={`${cell.classesCount} aula(s) prevista(s)`}
                        className={`inline-flex items-center gap-0.5 font-mono tabular-nums text-[9px] sm:text-[10px] font-bold px-1 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-white/15 text-indigo-100'
                            : 'bg-[#E6E9F0] text-[#475569]'
                        }`}
                      >
                        <BookOpen className="w-2.5 h-2.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                        <span>{cell.classesCount}</span>
                      </span>
                    )}
                  </div>

                  {/* Event & Status Icons inside the cell */}
                  <div className="flex flex-wrap items-center gap-1 mt-1 w-full">
                    {shownBadges.map((bType) => {
                      const meta = getCalendarBadgeMeta(bType);
                      return (
                        <span
                          key={bType}
                          title={meta.label}
                          style={
                            isSelected
                              ? undefined
                              : {
                                  backgroundColor: meta.bgColor,
                                  color: meta.textColor,
                                  borderColor: meta.borderColor,
                                }
                          }
                          className={`inline-flex items-center gap-0.5 sm:gap-1 rounded-lg border px-1 py-0.5 text-[9px] font-extrabold leading-none whitespace-nowrap ${
                            isSelected
                              ? 'bg-white/20 text-white border-white/30'
                              : ''
                          }`}
                        >
                          {renderBadgeIcon(bType, 'w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0')}
                          <span className="hidden sm:inline">{meta.shortLabel}</span>
                        </span>
                      );
                    })}
                    {extraCount > 0 && (
                      <span
                        className={`text-[9px] font-mono tabular-nums font-extrabold ${
                          isSelected ? 'text-indigo-200' : 'text-[#475569]'
                        }`}
                      >
                        +{extraCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Icon Legend */}
          <div className="pt-2 border-t border-[#CBD5E1]/70 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#475569]">
            {(
              [
                'prova',
                'trabalho',
                'trabalho_grupo',
                'seminario',
                'sem_aula',
                'mudanca_sala',
                'falta',
                'aula',
              ] as CalendarBadgeType[]
            ).map((bType) => {
              const meta = getCalendarBadgeMeta(bType);
              return (
                <span key={bType} className="inline-flex items-center gap-1">
                  <span
                    style={{ backgroundColor: meta.bgColor, color: meta.textColor }}
                    className="w-5 h-5 rounded-md inline-flex items-center justify-center"
                  >
                    {renderBadgeIcon(bType, 'w-3 h-3')}
                  </span>
                  <span>{meta.shortLabel}</span>
                </span>
              );
            })}
          </div>
        </section>

        {/* Selected Day Interactive Details + Quick Add Panel */}
        <section
          ref={detailRef}
          className="bento-card p-4 sm:p-5 space-y-4 lg:sticky lg:top-20"
          aria-labelledby="dia-selecionado-heading"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-extrabold text-[#EC1580]">
                {selectedDate === todayStr ? 'Hoje no calendário' : 'Dia selecionado'}
              </p>
              <h2
                id="dia-selecionado-heading"
                className="text-base sm:text-lg font-black text-[#0E1A59] leading-tight"
              >
                {selectedWeekdayName} · {formatDatePtBr(selectedDate)}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => (showCreateForm ? setShowCreateForm(false) : handleOpenCreateForm())}
              className="min-h-[38px] px-3 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {showCreateForm ? (
                <>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Fechar</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Adicionar</span>
                </>
              )}
            </button>
          </div>

          {/* Inline Create Academic Event Form */}
          {showCreateForm && (
            <form
              onSubmit={handleSubmitEvento}
              className="rounded-2xl bg-[#E6E9F0]/65 border-[1.5px] border-[#CBD5E1] p-3.5 space-y-3"
            >
              <p className="text-xs font-extrabold text-[#0E1A59]">
                Novo registro em {formatDatePtBr(selectedDate)}
              </p>

              {/* Event type selector */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {EVENT_TYPE_OPTIONS.map((opt) => {
                  const active = evTipo === opt.tipo;
                  const meta = getCalendarBadgeMeta(opt.tipo);
                  return (
                    <button
                      key={opt.tipo}
                      type="button"
                      onClick={() => setEvTipo(opt.tipo)}
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border-[1.5px] text-[11px] font-extrabold inline-flex items-center gap-1.5 transition-colors ${
                        active
                          ? 'bg-[#0E1A59] text-white border-[#0E1A59]'
                          : 'bg-white text-[#0E1A59] border-[#CBD5E1] hover:border-[#0E1A59]'
                      }`}
                    >
                      <span style={active ? undefined : { color: meta.textColor }}>
                        {renderBadgeIcon(opt.tipo, 'w-3.5 h-3.5 shrink-0')}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Discipline selector */}
              <div>
                <label htmlFor="cal-ev-materia" className="block text-[11px] font-bold text-[#475569] mb-1">
                  Disciplina
                </label>
                <select
                  id="cal-ev-materia"
                  value={evMateriaId}
                  onChange={(e) => setEvMateriaId(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-bold text-[#0E1A59]"
                >
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                  <option value="__custom__">Outra disciplina / atividade manual...</option>
                </select>
              </div>

              {(!selectedMateriaForForm || evMateriaId === '__custom__') && (
                <div>
                  <label htmlFor="cal-ev-custom-mat" className="block text-[11px] font-bold text-[#475569] mb-1">
                    Nome da disciplina
                  </label>
                  <input
                    id="cal-ev-custom-mat"
                    type="text"
                    required
                    value={evCustomDisciplina}
                    onChange={(e) => setEvCustomDisciplina(e.target.value)}
                    placeholder="Ex.: Semiologia Médica"
                    className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                  />
                </div>
              )}

              <div>
                <label htmlFor="cal-ev-titulo" className="block text-[11px] font-bold text-[#475569] mb-1">
                  Descrição curta
                </label>
                <input
                  id="cal-ev-titulo"
                  type="text"
                  required
                  minLength={2}
                  maxLength={160}
                  value={evTitulo}
                  onChange={(e) => setEvTitulo(e.target.value)}
                  placeholder={activeTipoOption.placeholderTitulo}
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {evTipo === 'trabalho_grupo' && (
                  <div>
                    <label htmlFor="cal-ev-grupo" className="block text-[11px] font-bold text-[#475569] mb-1">
                      Grupo / Integrantes
                    </label>
                    <input
                      id="cal-ev-grupo"
                      type="text"
                      maxLength={100}
                      value={evGrupo}
                      onChange={(e) => setEvGrupo(e.target.value)}
                      placeholder="Ex.: Grupo 3 (Ana, João)"
                      className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="cal-ev-horario" className="block text-[11px] font-bold text-[#475569] mb-1">
                    Horário (opcional)
                  </label>
                  <input
                    id="cal-ev-horario"
                    type="text"
                    maxLength={16}
                    value={evHorario}
                    onChange={(e) => setEvHorario(e.target.value)}
                    placeholder="Ex.: 08:00"
                    className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cal-ev-detalhes" className="block text-[11px] font-bold text-[#475569] mb-1">
                  Detalhes / Sala (opcional)
                </label>
                <input
                  id="cal-ev-detalhes"
                  type="text"
                  maxLength={240}
                  value={evDetalhes}
                  onChange={(e) => setEvDetalhes(e.target.value)}
                  placeholder="Ex.: Anfiteatro 4º andar · Matéria das aulas 1 a 6"
                  className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                />
              </div>

              {selectedMateriaForForm && (
                <label className="flex items-center gap-2 rounded-xl bg-white border border-[#CBD5E1] px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evCompartilharTurma}
                    onChange={(e) => setEvCompartilharTurma(e.target.checked)}
                    className="w-4 h-4 accent-[#EC1580]"
                  />
                  <Share2 className="w-3.5 h-3.5 text-[#EC1580] shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-bold text-[#0E1A59]">
                    Compartilhar no mural coletivo da turma ({resolveDisciplinaKey(selectedMateriaForForm)})
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={savingEvento || evTitulo.trim().length < 2}
                className="w-full min-h-[44px] rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170] disabled:opacity-60 transition-colors"
              >
                {savingEvento ? 'Salvando...' : 'Salvar no calendário'}
              </button>
            </form>
          )}

          {/* Selected Day Items List */}
          {!selectedCell || selectedCell.items.length === 0 ? (
            <div className="rounded-2xl bg-[#E6E9F0]/55 border-[1.5px] border-[#CBD5E1] p-5 text-center space-y-3">
              <p className="text-sm font-extrabold text-[#0E1A59]">
                Dia livre por enquanto!
              </p>
              <p className="text-xs text-[#475569]">
                {materias.length === 0
                  ? 'Importe sua grade para visualizar suas aulas automaticamente no calendário.'
                  : 'Nenhuma aula, prova, trabalho ou cancelamento encontrado nesta data.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {materias.length === 0 ? (
                  <button
                    type="button"
                    onClick={onOpenGrade}
                    className="min-h-[40px] px-4 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D]"
                  >
                    Carregar minha grade
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenCreateForm('prova')}
                    className="min-h-[40px] px-4 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D]"
                  >
                    Agendar prova ou trabalho
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5" data-testid="calendar-day-details">
              {selectedCell.items.map((item) => {
                const meta = getCalendarBadgeMeta(item.badgeType);
                const pStyle = item.periodo ? getPeriodoStyle(item.periodo) : null;
                const inscritos = item.materia
                  ? getEnrolledCountForMateria(item.materia, comunidadeMap)
                  : 0;

                // Regular Class Item with quick attendance controls + crowd Sem Aula consensus
                if (item.kind === 'class' && item.materia && item.horario) {
                  const mat = item.materia;
                  const h = item.horario;
                  const falta = item.falta;
                  const consensus = getClassSemAulaConsensus({
                    semestreId: mat.semestreId || semestreConfig.id,
                    disciplinaKey: resolveDisciplinaKey(mat),
                    data: selectedDate,
                    consensoMap: semAulaConsensoMap,
                    avisosColetivos,
                    currentUserUid,
                  });

                  return (
                    <div
                      key={item.id}
                      style={pStyle ? { borderLeftColor: pStyle.borderColor } : undefined}
                      className={`rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] ${
                        pStyle ? 'border-l-4' : ''
                      } p-3.5 space-y-2.5`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              style={{
                                backgroundColor: meta.bgColor,
                                color: meta.textColor,
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap"
                            >
                              {renderBadgeIcon(item.badgeType, 'w-3 h-3')}
                              <span>{meta.label}</span>
                            </span>
                            {pStyle && (
                              <span
                                style={{
                                  backgroundColor: pStyle.badgeBg,
                                  color: pStyle.badgeText,
                                }}
                                className="px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap"
                              >
                                {pStyle.shortLabel}
                              </span>
                            )}
                            {inscritos > 0 && (
                              <span className="text-[10px] font-mono tabular-nums font-bold text-[#475569]">
                                · {inscritos} inscritos
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-extrabold text-[#0E1A59] leading-snug">
                            {item.title}
                          </h3>
                          {item.subtitle && (
                            <p className="text-xs font-semibold text-[#475569] font-mono tabular-nums">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Inline crowd Sem Aula prompt BEFORE marking Faltei / Programar / Sem Aula */}
                      {!falta && consensus.count > 0 && (
                        <div
                          data-testid={`cal-consensus-${mat.id}`}
                          className="rounded-xl bg-[#DCFCE7]/85 border border-[#86EFAC] p-2.5 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-extrabold text-[#15803D] leading-snug">
                              {consensus.count}{' '}
                              {consensus.count === 1
                                ? 'pessoa falou que não teve aula'
                                : 'pessoas falaram que não teve aula'}
                              {consensus.autorHint ? ` · ${consensus.autorHint}` : ''}
                            </p>
                            <p className="text-[11px] font-semibold text-[#166534]">
                              Quer marcar Sem Aula também para poupar cliques?
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onRecordFalta({
                                materiaId: mat.id,
                                data: selectedDate,
                                diaSemana: h.diaSemana,
                                horas: h.horas,
                                tipo: 'sem_aula',
                              })
                            }
                            className="min-h-[34px] px-3 rounded-lg bg-[#15803D] text-white text-[11px] font-extrabold hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0"
                          >
                            Sim, marcar Sem Aula
                          </button>
                        </div>
                      )}

                      {/* Quick Attendance Actions on the clicked date */}
                      {falta ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#0E1A59]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                            <span>
                              {falta.tipo === 'sem_aula'
                                ? 'Marcado como Sem Aula (cota preservada)'
                                : falta.tipo === 'programada'
                                ? 'Falta programada neste dia'
                                : 'Falta registrada neste dia'}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteFalta(falta.id)}
                            className="min-h-[34px] px-2.5 rounded-lg bg-[#E6E9F0] text-[#0E1A59] text-[11px] font-extrabold inline-flex items-center gap-1 hover:bg-[#CBD5E1] transition-colors"
                          >
                            <Undo2 className="w-3 h-3" aria-hidden="true" />
                            <span>Desfazer</span>
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              onRecordFalta({
                                materiaId: mat.id,
                                data: selectedDate,
                                diaSemana: h.diaSemana,
                                horas: h.horas,
                                tipo: 'falta',
                              })
                            }
                            className="min-h-[36px] rounded-xl bg-[#0E1A59] text-white text-[11px] font-extrabold hover:bg-[#14267D] transition-colors"
                          >
                            Faltei
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRecordFalta({
                                materiaId: mat.id,
                                data: selectedDate,
                                diaSemana: h.diaSemana,
                                horas: h.horas,
                                tipo: 'programada',
                              })
                            }
                            className="min-h-[36px] rounded-xl bg-[#EC1580] text-white text-[11px] font-extrabold hover:bg-[#d11170] transition-colors"
                          >
                            Programar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRecordFalta({
                                materiaId: mat.id,
                                data: selectedDate,
                                diaSemana: h.diaSemana,
                                horas: h.horas,
                                tipo: 'sem_aula',
                              })
                            }
                            className="min-h-[36px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] text-[11px] font-extrabold hover:border-[#0E1A59] transition-colors"
                          >
                            Sem Aula
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // Academic Event, Holiday, or Collective Notice Item
                const canDeleteEvento = item.kind === 'evento' && item.evento;
                const canManageAviso = item.kind === 'aviso' && item.aviso;
                const alreadyAppliedSemAula =
                  item.badgeType === 'sem_aula' &&
                  item.materia &&
                  faltas.some(
                    (f) =>
                      f.materiaId === item.materia!.id &&
                      f.data === selectedDate &&
                      f.tipo === 'sem_aula'
                  );

                return (
                  <div
                    key={item.id}
                    style={{ borderColor: meta.borderColor }}
                    className="rounded-2xl bg-white border-[1.5px] p-3.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            style={{
                              backgroundColor: meta.bgColor,
                              color: meta.textColor,
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap"
                          >
                            {renderBadgeIcon(item.badgeType, 'w-3 h-3')}
                            <span>{meta.label}</span>
                          </span>
                          {item.isCollective && (
                            <span className="px-2 py-0.5 rounded-full bg-[#E6E9F0] text-[#0E1A59] text-[10px] font-extrabold whitespace-nowrap">
                              Turma
                            </span>
                          )}
                          {item.grupo && (
                            <span className="px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#6D28D9] text-[10px] font-extrabold whitespace-nowrap">
                              {item.grupo}
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm font-extrabold text-[#0E1A59] leading-snug">
                          {item.title}
                        </h3>
                        {item.subtitle && (
                          <p className="text-xs font-semibold text-[#475569] leading-snug">
                            {item.subtitle}
                          </p>
                        )}
                      </div>

                      {canDeleteEvento && (
                        <button
                          type="button"
                          onClick={() => onDeleteEvento(item.evento!.id)}
                          aria-label={`Remover ${item.title}`}
                          className="min-h-[34px] min-w-[34px] rounded-lg border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#EC1580] flex items-center justify-center shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {canManageAviso && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] font-semibold text-[#475569]">
                          Enviado por {item.aviso!.autorNome}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(item.aviso!.tipo === 'prova' ||
                            item.aviso!.tipo === 'trabalho' ||
                            item.aviso!.tipo === 'trabalho_grupo' ||
                            item.aviso!.tipo === 'seminario') &&
                            !eventos.some(
                              (e) =>
                                e.data === selectedDate &&
                                e.tipo === item.aviso!.tipo &&
                                e.disciplinaKey === item.aviso!.disciplinaKey
                            ) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAddEvento({
                                    materia: item.materia,
                                    disciplinaNome: item.aviso!.disciplinaNome,
                                    data: selectedDate,
                                    tipo: item.aviso!.tipo as UserEventoTipo,
                                    titulo: item.aviso!.mensagem.slice(0, 120),
                                  })
                                }
                                className="min-h-[34px] px-2.5 rounded-lg bg-[#E0E7FF] text-[#0E1A59] text-[11px] font-extrabold inline-flex items-center gap-1 hover:bg-[#c7d2fe] transition-colors whitespace-nowrap"
                              >
                                <BookmarkPlus className="w-3 h-3" aria-hidden="true" />
                                <span>Salvar na agenda</span>
                              </button>
                            )}
                          {item.badgeType === 'sem_aula' && item.materia && !alreadyAppliedSemAula && (
                            <button
                              type="button"
                              onClick={() => handleApplySemAulaFromItem(item)}
                              className="min-h-[34px] px-2.5 rounded-lg bg-[#DCFCE7] text-[#15803D] text-[11px] font-extrabold hover:bg-[#bbf7d0] transition-colors whitespace-nowrap"
                            >
                              Aplicar Sem Aula
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={Boolean(item.aviso!.confirmadoPorMim)}
                            onClick={() => onConfirmAviso(item.aviso!.id)}
                            className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 ${
                              item.aviso!.confirmadoPorMim
                                ? 'bg-[#E6E9F0] text-[#0E1A59] border border-[#CBD5E1]'
                                : 'bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] hover:border-[#0E1A59]'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" aria-hidden="true" />
                            <span className="font-mono tabular-nums">{item.aviso!.confirmacoes}</span>
                          </button>
                          {(item.aviso!.autorUid === currentUserUid || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => onDeleteAviso(item.aviso!.id)}
                              aria-label="Remover aviso coletivo"
                              className="min-h-[34px] min-w-[34px] rounded-lg border-[1.5px] border-[#CBD5E1] text-[#475569] hover:text-[#EC1580] flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
