import {
  AvisoColetivo,
  BlocoAula,
  DiaSemana,
  Feriado,
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
  getDiaSemanaFromIso,
  getMateriaBlocos,
} from './attendance';
import { getClassSemAulaConsensus, resolveDisciplinaKey } from './disciplinaKey';

export const WEEKLY_START_HOUR = 7;
export const WEEKLY_END_HOUR = 19;
export const HOUR_HEIGHT_PX = 52;
export const WEEKLY_TOTAL_HEIGHT_PX = (WEEKLY_END_HOUR - WEEKLY_START_HOUR) * HOUR_HEIGHT_PX; // 624px
export const WEEKLY_HOUR_TICKS: number[] = Array.from(
  { length: WEEKLY_END_HOUR - WEEKLY_START_HOUR + 1 },
  (_, idx) => WEEKLY_START_HOUR + idx
);

export type WeeklyBlockVisualState = 'normal' | 'falta' | 'programada' | 'sem_aula' | 'feriado';

export interface WeeklyGridBlock {
  id: string;
  isoDate: string;
  diaSemana: DiaSemana;
  materia: UserMateria;
  bloco: BlocoAula;
  startMinutes: number;
  endMinutes: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  totalCols: number;
  visualState: WeeklyBlockVisualState;
  falta?: UserFalta;
  evaluations: UserEvento[];
  collectiveNotices: AvisoColetivo[];
  semAulaConsensusCount: number;
  semAulaAutorHint?: string;
}

export interface WeeklyDayColumn {
  isoDate: string;
  diaSemana: DiaSemana;
  shortLabel: string;
  fullLabel: string;
  dateLabel: string;
  isToday: boolean;
  holiday?: Feriado;
  inSemester: boolean;
  dayEvaluations: UserEvento[];
  daySemAulaEvents: UserEvento[];
  blocks: WeeklyGridBlock[];
}

export interface WeeklyScheduleModel {
  mondayIso: string;
  lastDayIso: string;
  rangeLabel: string;
  hasSaturday: boolean;
  isCurrentWeek: boolean;
  columns: WeeklyDayColumn[];
}

export function parseTimeToMinutes(hhmm: string): number {
  const [hhRaw, mmRaw] = hhmm.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  const safeH = Number.isFinite(hh) ? Math.max(0, Math.min(23, hh)) : 8;
  const safeM = Number.isFinite(mm) ? Math.max(0, Math.min(59, mm)) : 0;
  return safeH * 60 + safeM;
}

export function computeBlockGeometry(
  horarioInicio: string,
  horarioFim: string
): { startMinutes: number; endMinutes: number; topPx: number; heightPx: number } {
  const minGrid = WEEKLY_START_HOUR * 60;
  const maxGrid = WEEKLY_END_HOUR * 60;
  const rawStart = parseTimeToMinutes(horarioInicio);
  const rawEnd = parseTimeToMinutes(horarioFim);
  const clampedStart = Math.max(minGrid, Math.min(maxGrid - 30, rawStart));
  const clampedEnd = Math.max(clampedStart + 30, Math.min(maxGrid, rawEnd));

  const topPx = Math.round(((clampedStart - minGrid) / 60) * HOUR_HEIGHT_PX);
  const heightPx = Math.round(((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT_PX);

  return {
    startMinutes: clampedStart,
    endMinutes: clampedEnd,
    topPx,
    heightPx,
  };
}

export function getNowIndicatorOffsetPx(now: Date): number | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  const minGrid = WEEKLY_START_HOUR * 60;
  const maxGrid = WEEKLY_END_HOUR * 60;
  if (mins < minGrid || mins > maxGrid) return null;
  return Math.round(((mins - minGrid) / 60) * HOUR_HEIGHT_PX);
}

export function getWeekAnchorMondayIso(referenceIso: string): string {
  const dow = getDiaSemanaFromIso(referenceIso); // 0=Sun, 1=Mon .. 6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(referenceIso, diffToMonday);
}

export function shiftWeekIso(anchorIso: string, deltaWeeks: number): string {
  return addDaysIso(getWeekAnchorMondayIso(anchorIso), deltaWeeks * 7);
}

export function findMatchingFaltaForBlock(
  dayFaltas: UserFalta[],
  materiaId: string,
  blocoId: string
): UserFalta | undefined {
  return (
    dayFaltas.find((f) => f.materiaId === materiaId && f.blocoId === blocoId) ||
    dayFaltas.find((f) => f.materiaId === materiaId && !f.blocoId)
  );
}

function assignOverlapColumns(blocks: WeeklyGridBlock[]): WeeklyGridBlock[] {
  if (blocks.length <= 1) return blocks;
  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes
  );

  // Sweep-line cluster grouping so overlapping blocks share width side-by-side
  const clusters: WeeklyGridBlock[][] = [];
  let currentCluster: WeeklyGridBlock[] = [];
  let clusterEnd = -1;

  for (const blk of sorted) {
    if (currentCluster.length === 0 || blk.startMinutes < clusterEnd) {
      currentCluster.push(blk);
      clusterEnd = Math.max(clusterEnd, blk.endMinutes);
    } else {
      clusters.push(currentCluster);
      currentCluster = [blk];
      clusterEnd = blk.endMinutes;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const positioned: WeeklyGridBlock[] = [];
  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const assignedCols: number[] = [];
    for (const blk of cluster) {
      let col = colEnds.findIndex((endMin) => endMin <= blk.startMinutes);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(blk.endMinutes);
      } else {
        colEnds[col] = blk.endMinutes;
      }
      assignedCols.push(col);
    }
    const totalCols = Math.max(1, colEnds.length);
    cluster.forEach((blk, idx) => {
      positioned.push({
        ...blk,
        colIndex: assignedCols[idx],
        totalCols,
      });
    });
  }

  return positioned;
}

const EVAL_EVENT_TYPES = new Set(['prova', 'trabalho', 'trabalho_grupo', 'seminario']);

export function buildWeeklyScheduleModel(params: {
  anchorIso: string;
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  avisosColetivos: AvisoColetivo[];
  semAulaConsensoMap?: Record<string, SemAulaConsenso>;
}): WeeklyScheduleModel {
  const {
    anchorIso,
    todayStr,
    semestreConfig,
    materias,
    faltas,
    eventos,
    avisosColetivos,
    semAulaConsensoMap = {},
  } = params;

  const mondayIso = getWeekAnchorMondayIso(anchorIso);
  const saturdayIso = addDaysIso(mondayIso, 5);

  // Show Saturday automatically ONLY if student has any class or event/falta on Saturday
  const hasSaturdayClass = materias.some((m) =>
    getMateriaBlocos(m).some((b) => b.diaSemana === 6)
  );
  const hasSaturdayActivity =
    eventos.some((e) => e.data === saturdayIso) ||
    faltas.some((f) => f.data === saturdayIso);
  const hasSaturday = hasSaturdayClass || hasSaturdayActivity;

  const dayOffsets = hasSaturday ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
  const holidayMap = new Map(semestreConfig.feriados.map((f) => [f.data, f]));

  const columns: WeeklyDayColumn[] = dayOffsets.map((offset) => {
    const isoDate = addDaysIso(mondayIso, offset);
    const diaSemana = (offset + 1) as DiaSemana;
    const holiday = holidayMap.get(isoDate);
    const inSemester =
      isoDate >= semestreConfig.dataInicio && isoDate <= semestreConfig.dataFim;

    const dayFaltas = faltas.filter((f) => f.data === isoDate);
    const dayEventos = eventos.filter((ev) => ev.data === isoDate);
    const dayEvaluations = dayEventos.filter((ev) => EVAL_EVENT_TYPES.has(ev.tipo));
    const daySemAulaEvents = dayEventos.filter((ev) => ev.tipo === 'sem_aula');
    const dayAvisos = avisosColetivos.filter((av) => av.data === isoDate);

    const rawBlocks: WeeklyGridBlock[] = [];

    for (const materia of materias) {
      const discKey = resolveDisciplinaKey(materia);
      const blocos = getMateriaBlocos(materia).filter((b) => b.diaSemana === diaSemana);
      if (blocos.length === 0) continue;

      const matNotices = dayAvisos.filter((av) => av.disciplinaKey === discKey);
      const hasNoticeSemAula = matNotices.some((av) => av.tipo === 'sem_aula');
      const hasPersonalSemAula = daySemAulaEvents.some(
        (ev) => ev.materiaId === materia.id || ev.disciplinaKey === discKey
      );
      const matEvaluations = dayEvaluations.filter(
        (ev) => ev.materiaId === materia.id || ev.disciplinaKey === discKey
      );
      const consensus = getClassSemAulaConsensus({
        semestreId: materia.semestreId || semestreConfig.id,
        disciplinaKey: discKey,
        data: isoDate,
        consensoMap: semAulaConsensoMap,
        avisosColetivos,
      });

      for (const bloco of blocos) {
        const geom = computeBlockGeometry(bloco.horarioInicio, bloco.horarioFim);
        const falta = findMatchingFaltaForBlock(dayFaltas, materia.id, bloco.id);

        let visualState: WeeklyBlockVisualState = 'normal';
        if (holiday) {
          visualState = 'feriado';
        } else if (falta) {
          visualState =
            falta.tipo === 'sem_aula'
              ? 'sem_aula'
              : falta.tipo === 'programada'
              ? 'programada'
              : 'falta';
        } else if (hasPersonalSemAula || hasNoticeSemAula) {
          visualState = 'sem_aula';
        }

        rawBlocks.push({
          id: `${isoDate}__${materia.id}__${bloco.id}`,
          isoDate,
          diaSemana,
          materia,
          bloco,
          startMinutes: geom.startMinutes,
          endMinutes: geom.endMinutes,
          topPx: geom.topPx,
          heightPx: geom.heightPx,
          colIndex: 0,
          totalCols: 1,
          visualState,
          falta,
          evaluations: matEvaluations,
          collectiveNotices: matNotices,
          semAulaConsensusCount: consensus.count,
          semAulaAutorHint: consensus.autorHint,
        });
      }
    }

    return {
      isoDate,
      diaSemana,
      shortLabel: DIA_SEMANA_LABELS[diaSemana].short,
      fullLabel: DIA_SEMANA_LABELS[diaSemana].full,
      dateLabel: formatDatePtBr(isoDate),
      isToday: isoDate === todayStr,
      holiday,
      inSemester,
      dayEvaluations,
      daySemAulaEvents,
      blocks: assignOverlapColumns(rawBlocks),
    };
  });

  const lastDayIso = columns[columns.length - 1]?.isoDate || addDaysIso(mondayIso, 4);
  const isCurrentWeek = todayStr >= mondayIso && todayStr <= addDaysIso(mondayIso, 6);

  return {
    mondayIso,
    lastDayIso,
    rangeLabel: `${formatDatePtBr(mondayIso)} – ${formatDatePtBr(lastDayIso)}`,
    hasSaturday,
    isCurrentWeek,
    columns,
  };
}
