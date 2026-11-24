import {
  AvisoColetivo,
  DiaSemana,
  HorarioAula,
  PeriodoId,
  SemAulaConsenso,
  SemestreConfig,
  UserEvento,
  UserFalta,
  UserMateria,
} from '../types/domain';
import { addDaysIso, formatIsoUtc, getDiaSemanaFromIso } from './attendance';
import { getClassSemAulaConsensus, resolveDisciplinaKey } from './disciplinaKey';

export type CalendarFilterMode = 'all' | 'avaliacoes' | 'sem_aula' | 'aulas' | 'faltas';

export type CalendarBadgeType =
  | 'prova'
  | 'trabalho'
  | 'trabalho_grupo'
  | 'seminario'
  | 'sem_aula'
  | 'mudanca_sala'
  | 'aviso'
  | 'falta'
  | 'programada'
  | 'feriado'
  | 'aula';

export interface CalendarBadgeMeta {
  type: CalendarBadgeType;
  label: string;
  shortLabel: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  dotColor: string;
}

export interface CalendarDayItem {
  id: string;
  kind: 'holiday' | 'class' | 'evento' | 'aviso';
  badgeType: CalendarBadgeType;
  title: string;
  subtitle?: string;
  disciplinaNome?: string;
  periodo?: PeriodoId;
  materia?: UserMateria;
  horario?: HorarioAula;
  falta?: UserFalta;
  evento?: UserEvento;
  aviso?: AvisoColetivo;
  grupo?: string;
  horarioTexto?: string;
  isCollective?: boolean;
  semAulaConsensusCount?: number;
  semAulaAutorHint?: string;
}

export interface CalendarDayCell {
  isoDate: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  items: CalendarDayItem[];
  iconSummary: CalendarBadgeType[];
  classesCount: number;
  highlightCount: number;
}

export interface CalendarMonthSummary {
  provas: number;
  trabalhos: number;
  seminarios: number;
  semAula: number;
  aulas: number;
}

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const BADGE_PRIORITY: CalendarBadgeType[] = [
  'prova',
  'trabalho_grupo',
  'trabalho',
  'seminario',
  'sem_aula',
  'mudanca_sala',
  'falta',
  'programada',
  'aviso',
  'feriado',
  'aula',
];

export function getCalendarBadgeMeta(type: CalendarBadgeType): CalendarBadgeMeta {
  switch (type) {
    case 'prova':
      return {
        type,
        label: 'Prova',
        shortLabel: 'Prova',
        bgColor: '#FCE7F3',
        textColor: '#BE185D',
        borderColor: '#F9A8D4',
        dotColor: '#EC1580',
      };
    case 'trabalho':
      return {
        type,
        label: 'Trabalho',
        shortLabel: 'Trab.',
        bgColor: '#FEF3C7',
        textColor: '#B45309',
        borderColor: '#FCD34D',
        dotColor: '#D97706',
      };
    case 'trabalho_grupo':
      return {
        type,
        label: 'Trabalho em grupo',
        shortLabel: 'Grupo',
        bgColor: '#EDE9FE',
        textColor: '#6D28D9',
        borderColor: '#C4B5FD',
        dotColor: '#7C3AED',
      };
    case 'seminario':
      return {
        type,
        label: 'Seminário',
        shortLabel: 'Semin',
        bgColor: '#E0F2FE',
        textColor: '#0369A1',
        borderColor: '#7DD3FC',
        dotColor: '#0284C7',
      };
    case 'sem_aula':
      return {
        type,
        label: 'Não tem aula',
        shortLabel: 'S/aula',
        bgColor: '#DCFCE7',
        textColor: '#15803D',
        borderColor: '#86EFAC',
        dotColor: '#16A34A',
      };
    case 'mudanca_sala':
      return {
        type,
        label: 'Mudança de sala',
        shortLabel: 'Sala',
        bgColor: '#FFEDD5',
        textColor: '#C2410C',
        borderColor: '#FDBA74',
        dotColor: '#EA580C',
      };
    case 'aviso':
      return {
        type,
        label: 'Aviso da turma',
        shortLabel: 'Aviso',
        bgColor: '#DBEAFE',
        textColor: '#1E3A8A',
        borderColor: '#93C5FD',
        dotColor: '#1E3A8A',
      };
    case 'falta':
      return {
        type,
        label: 'Falta registrada',
        shortLabel: 'Faltei',
        bgColor: '#E0E7FF',
        textColor: '#0E1A59',
        borderColor: '#A5B4FC',
        dotColor: '#0E1A59',
      };
    case 'programada':
      return {
        type,
        label: 'Falta programada',
        shortLabel: 'Prog.',
        bgColor: '#FCE7F3',
        textColor: '#9D174D',
        borderColor: '#F9A8D4',
        dotColor: '#EC1580',
      };
    case 'feriado':
      return {
        type,
        label: 'Feriado / Recesso',
        shortLabel: 'Fer.',
        bgColor: '#CCFBF1',
        textColor: '#0F766E',
        borderColor: '#5EEAD4',
        dotColor: '#0F766E',
      };
    case 'aula':
    default:
      return {
        type: 'aula',
        label: 'Aula prevista',
        shortLabel: 'Aula',
        bgColor: '#F1F5F9',
        textColor: '#334155',
        borderColor: '#CBD5E1',
        dotColor: '#475569',
      };
  }
}

export function getMonthLabelPtBr(year: number, monthIndex0: number): string {
  const safeMonth = ((monthIndex0 % 12) + 12) % 12;
  return `${MONTH_NAMES_PT[safeMonth]} ${year}`;
}

export function shiftYearMonth(
  year: number,
  monthIndex0: number,
  deltaMonths: number
): { year: number; monthIndex0: number } {
  const d = new Date(Date.UTC(year, monthIndex0 + deltaMonths, 1));
  return { year: d.getUTCFullYear(), monthIndex0: d.getUTCMonth() };
}

export function parseYearMonthFromIso(isoDate: string): { year: number; monthIndex0: number } {
  const [y, m] = isoDate.split('-').map(Number);
  return {
    year: Number.isFinite(y) && y > 1900 ? y : 2026,
    monthIndex0: Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : 0,
  };
}

function matchesFilter(badge: CalendarBadgeType, filter: CalendarFilterMode): boolean {
  if (filter === 'all') return true;
  if (filter === 'avaliacoes') {
    return (
      badge === 'prova' ||
      badge === 'trabalho' ||
      badge === 'trabalho_grupo' ||
      badge === 'seminario'
    );
  }
  if (filter === 'sem_aula') {
    return badge === 'sem_aula' || badge === 'feriado';
  }
  if (filter === 'aulas') {
    return badge === 'aula' || badge === 'mudanca_sala';
  }
  if (filter === 'faltas') {
    return badge === 'falta' || badge === 'programada';
  }
  return true;
}

export function buildCalendarMonthCells(params: {
  year: number;
  monthIndex0: number;
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  avisosColetivos: AvisoColetivo[];
  semAulaConsensoMap?: Record<string, SemAulaConsenso>;
  activeFilter?: CalendarFilterMode;
}): CalendarDayCell[] {
  const {
    year,
    monthIndex0,
    todayStr,
    semestreConfig,
    materias,
    faltas,
    eventos,
    avisosColetivos,
    semAulaConsensoMap = {},
    activeFilter = 'all',
  } = params;

  const firstOfMonth = new Date(Date.UTC(year, monthIndex0, 1));
  const startDow = firstOfMonth.getUTCDay(); // 0=Dom..6=Sáb
  const lastOfMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const daysInMonth = lastOfMonth.getUTCDate();
  const totalCells = startDow + daysInMonth > 35 ? 42 : 35;

  const gridStartIso = addDaysIso(formatIsoUtc(firstOfMonth), -startDow);

  const holidayMap = new Map(semestreConfig.feriados.map((f) => [f.data, f]));
  const materiaKeyToName = new Map(materias.map((m) => [resolveDisciplinaKey(m), m]));

  const faltasByDate = new Map<string, UserFalta[]>();
  for (const f of faltas) {
    const arr = faltasByDate.get(f.data) || [];
    arr.push(f);
    faltasByDate.set(f.data, arr);
  }

  const eventosByDate = new Map<string, UserEvento[]>();
  for (const ev of eventos) {
    const arr = eventosByDate.get(ev.data) || [];
    arr.push(ev);
    eventosByDate.set(ev.data, arr);
  }

  const avisosByDate = new Map<string, AvisoColetivo[]>();
  for (const av of avisosColetivos) {
    const arr = avisosByDate.get(av.data) || [];
    arr.push(av);
    avisosByDate.set(av.data, arr);
  }

  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < totalCells; i++) {
    const isoDate = addDaysIso(gridStartIso, i);
    const [cellY, cellM, cellD] = isoDate.split('-').map(Number);
    const inCurrentMonth = cellY === year && cellM - 1 === monthIndex0;
    const dow = getDiaSemanaFromIso(isoDate);
    const feriado = holidayMap.get(isoDate);
    const dayFaltas = faltasByDate.get(isoDate) || [];
    const dayEventos = eventosByDate.get(isoDate) || [];
    const dayAvisos = avisosByDate.get(isoDate) || [];

    const rawItems: CalendarDayItem[] = [];

    if (feriado) {
      rawItems.push({
        id: `hol_${isoDate}`,
        kind: 'holiday',
        badgeType: 'feriado',
        title: `Não tem aula · ${feriado.nome}`,
        subtitle: 'Feriado ou recesso acadêmico oficial',
      });
    }

    // Personal events (Prova, Trabalho, Trabalho em grupo, Seminário, Sem aula)
    for (const ev of dayEventos) {
      const matchedMat = ev.materiaId
        ? materias.find((m) => m.id === ev.materiaId)
        : ev.disciplinaKey
        ? materiaKeyToName.get(ev.disciplinaKey)
        : undefined;
      const meta = getCalendarBadgeMeta(ev.tipo);
      const prefix =
        ev.tipo === 'sem_aula' ? 'Não tem aula' : meta.label;
      rawItems.push({
        id: `ev_${ev.id}`,
        kind: 'evento',
        badgeType: ev.tipo,
        title: `${prefix} de ${ev.disciplinaNome}`,
        subtitle: [ev.titulo, ev.grupo, ev.horario, ev.detalhes].filter(Boolean).join(' · '),
        disciplinaNome: ev.disciplinaNome,
        periodo: matchedMat?.periodo,
        materia: matchedMat,
        evento: ev,
        grupo: ev.grupo,
        horarioTexto: ev.horario,
        isCollective: false,
      });
    }

    // Collective notices / shared class events
    for (const av of dayAvisos) {
      const matchedMat = materiaKeyToName.get(av.disciplinaKey);
      const meta = getCalendarBadgeMeta(av.tipo);
      const prefix =
        av.tipo === 'sem_aula'
          ? 'Não tem aula'
          : av.tipo === 'mudanca_sala'
          ? 'Mudança de sala'
          : meta.label;
      rawItems.push({
        id: `av_${av.id}`,
        kind: 'aviso',
        badgeType: av.tipo,
        title: `${prefix} de ${av.disciplinaNome}`,
        subtitle: av.mensagem,
        disciplinaNome: av.disciplinaNome,
        periodo: matchedMat?.periodo,
        materia: matchedMat,
        aviso: av,
        isCollective: true,
      });
    }

    // Regular scheduled classes within semester bounds on non-holiday weekdays
    const inSemester =
      isoDate >= semestreConfig.dataInicio && isoDate <= semestreConfig.dataFim;
    if (inSemester && !feriado && dow >= 1 && dow <= 6) {
      const typedDow = dow as DiaSemana;
      const matchingClasses: Array<{ materia: UserMateria; horario: HorarioAula }> = [];
      for (const m of materias) {
        for (const h of m.horarios) {
          if (h.diaSemana === typedDow) {
            matchingClasses.push({ materia: m, horario: h });
          }
        }
      }
      matchingClasses.sort((a, b) => a.horario.horarioInicio.localeCompare(b.horario.horarioInicio));

      for (const { materia, horario } of matchingClasses) {
        const faltaRecord = dayFaltas.find((f) => f.materiaId === materia.id);
        const discKey = resolveDisciplinaKey(materia);
        const consensus = getClassSemAulaConsensus({
          semestreId: semestreConfig.id,
          disciplinaKey: discKey,
          data: isoDate,
          consensoMap: semAulaConsensoMap,
          avisosColetivos,
        });
        const badgeType: CalendarBadgeType = faltaRecord
          ? faltaRecord.tipo === 'sem_aula'
            ? 'sem_aula'
            : faltaRecord.tipo === 'programada'
            ? 'programada'
            : 'falta'
          : 'aula';

        const titlePrefix =
          badgeType === 'sem_aula'
            ? `Não tem aula de ${materia.nome}`
            : badgeType === 'falta'
            ? `Faltei em ${materia.nome}`
            : badgeType === 'programada'
            ? `Falta programada · ${materia.nome}`
            : materia.nome;

        rawItems.push({
          id: `cls_${materia.id}_${horario.horarioInicio}`,
          kind: 'class',
          badgeType,
          title: titlePrefix,
          subtitle: `${horario.horarioInicio}–${horario.horarioFim} (${horario.horas}h)${
            horario.local || materia.local ? ` · ${horario.local || materia.local}` : ''
          }`,
          disciplinaNome: materia.nome,
          periodo: materia.periodo,
          materia,
          horario,
          falta: faltaRecord,
          horarioTexto: `${horario.horarioInicio}–${horario.horarioFim}`,
          semAulaConsensusCount: consensus.count,
          semAulaAutorHint: consensus.autorHint,
        });
      }
    }

    const filteredItems = rawItems.filter((item) => matchesFilter(item.badgeType, activeFilter));

    const uniqueBadges = new Set(filteredItems.map((it) => it.badgeType));
    if (
      activeFilter === 'all' &&
      filteredItems.some((it) => it.kind === 'class' && (it.semAulaConsensusCount || 0) > 0)
    ) {
      uniqueBadges.add('sem_aula');
    }
    const iconSummary = BADGE_PRIORITY.filter((b) => uniqueBadges.has(b));

    const classesCount = filteredItems.filter((it) => it.kind === 'class').length;
    const highlightCount = filteredItems.filter((it) => it.badgeType !== 'aula').length;

    cells.push({
      isoDate,
      dayNumber: cellD,
      inCurrentMonth,
      isToday: isoDate === todayStr,
      isHoliday: Boolean(feriado),
      holidayName: feriado?.nome,
      items: filteredItems,
      iconSummary,
      classesCount,
      highlightCount,
    });
  }

  return cells;
}

export function countMonthSummary(cells: CalendarDayCell[]): CalendarMonthSummary {
  const summary: CalendarMonthSummary = {
    provas: 0,
    trabalhos: 0,
    seminarios: 0,
    semAula: 0,
    aulas: 0,
  };

  for (const cell of cells) {
    if (!cell.inCurrentMonth) continue;
    for (const item of cell.items) {
      if (item.badgeType === 'prova') summary.provas += 1;
      else if (item.badgeType === 'trabalho' || item.badgeType === 'trabalho_grupo') summary.trabalhos += 1;
      else if (item.badgeType === 'seminario') summary.seminarios += 1;
      else if (item.badgeType === 'sem_aula' || item.badgeType === 'feriado') summary.semAula += 1;
      else if (item.badgeType === 'aula') summary.aulas += 1;
    }
  }

  return summary;
}
