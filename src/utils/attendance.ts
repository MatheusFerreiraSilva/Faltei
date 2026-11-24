import {
  CatalogDiffItem,
  CatalogoDisciplina,
  DiaSemana,
  Feriado,
  HorarioAula,
  MateriaStats,
  PeriodoId,
  RiskLevel,
  SemestreConfig,
  SimulacaoItem,
  SimulacaoResultado,
  SubCotaDia,
  UserFalta,
  UserMateria,
} from '../types/domain';

export interface PeriodoVisualStyle {
  label: string;
  shortLabel: string;
  borderColor: string;
  cardBg: string;
  badgeBg: string;
  badgeText: string;
}

export const DIA_SEMANA_LABELS: Record<DiaSemana, { short: string; full: string }> = {
  1: { short: '2ªF', full: 'Segunda-feira' },
  2: { short: '3ªF', full: 'Terça-feira' },
  3: { short: '4ªF', full: 'Quarta-feira' },
  4: { short: '5ªF', full: 'Quinta-feira' },
  5: { short: '6ªF', full: 'Sexta-feira' },
  6: { short: 'Sáb', full: 'Sábado' },
};

export function getPeriodoStyle(periodo: PeriodoId): PeriodoVisualStyle {
  switch (periodo) {
    case '1':
      return {
        label: '1º Período',
        shortLabel: '1º P',
        borderColor: '#1E3A8A',
        cardBg: '#FFFFFF',
        badgeBg: '#DBEAFE',
        badgeText: '#1E3A8A',
      };
    case '2':
      return {
        label: '2º Período',
        shortLabel: '2º P',
        borderColor: '#0369A1',
        cardBg: '#FFFFFF',
        badgeBg: '#E0F2FE',
        badgeText: '#0369A1',
      };
    case '3':
      return {
        label: '3º Período',
        shortLabel: '3º P',
        borderColor: '#0F766E',
        cardBg: '#FFFFFF',
        badgeBg: '#CCFBF1',
        badgeText: '#0F766E',
      };
    case '4':
      return {
        label: '4º Período',
        shortLabel: '4º P',
        borderColor: '#15803D',
        cardBg: '#FFFFFF',
        badgeBg: '#DCFCE7',
        badgeText: '#15803D',
      };
    case '5':
      return {
        label: '5º Período',
        shortLabel: '5º P',
        borderColor: '#B45309',
        cardBg: '#FFFFFF',
        badgeBg: '#FEF3C7',
        badgeText: '#B45309',
      };
    case '6':
      return {
        label: '6º Período',
        shortLabel: '6º P',
        borderColor: '#C2410C',
        cardBg: '#FFFFFF',
        badgeBg: '#FFEDD5',
        badgeText: '#C2410C',
      };
    case '7':
      return {
        label: '7º Período',
        shortLabel: '7º P',
        borderColor: '#6D28D9',
        cardBg: '#FFFFFF',
        badgeBg: '#EDE9FE',
        badgeText: '#6D28D9',
      };
    case '8':
      return {
        label: '8º Período',
        shortLabel: '8º P',
        borderColor: '#0E1A59',
        cardBg: '#FFFFFF',
        badgeBg: '#E0E7FF',
        badgeText: '#0E1A59',
      };
    case 'optativa':
    default:
      return {
        label: 'Optativa',
        shortLabel: 'Opt',
        borderColor: '#EC1580',
        cardBg: '#FFFFFF',
        badgeBg: '#FCE7F3',
        badgeText: '#BE185D',
      };
  }
}

export function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatIsoUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(dateStr: string, days: number): string {
  const dt = parseIsoUtc(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatIsoUtc(dt);
}

export function getDiaSemanaFromIso(dateStr: string): number {
  return parseIsoUtc(dateStr).getUTCDay(); // 0=Sun, 1=Mon .. 6=Sat
}

export function formatDatePtBr(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

export function getWeekDatesIso(referenceDateStr: string): string[] {
  const day = getDiaSemanaFromIso(referenceDateStr);
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDaysIso(referenceDateStr, diffToMonday);
  return [0, 1, 2, 3, 4, 5].map((offset) => addDaysIso(monday, offset)); // Seg a Sáb
}

export function isFeriado(dateStr: string, feriados: Feriado[]): Feriado | undefined {
  return feriados.find((f) => f.data === dateStr);
}

export function getWeeksRemaining(semestre: SemestreConfig, referenceDateStr: string): number {
  const ref = parseIsoUtc(referenceDateStr).getTime();
  const end = parseIsoUtc(semestre.dataFim).getTime();
  if (end <= ref) return 0;
  const diffDays = Math.ceil((end - ref) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil(diffDays / 7));
}

export function countScheduledMeetings(
  horarios: HorarioAula[],
  startDateStr: string,
  endDateStr: string,
  feriados: Feriado[]
): number {
  if (!horarios.length || endDateStr < startDateStr) return 0;
  const holidaySet = new Set(feriados.map((f) => f.data));
  const diasSet = new Set(horarios.map((h) => h.diaSemana));

  let count = 0;
  let cursor = startDateStr;
  let guard = 0;
  while (cursor <= endDateStr && guard < 400) {
    const dow = getDiaSemanaFromIso(cursor);
    if (dow >= 1 && dow <= 6 && diasSet.has(dow as DiaSemana) && !holidaySet.has(cursor)) {
      count += 1;
    }
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return count;
}

export function countMeetingsByWeekday(
  horarios: HorarioAula[],
  semestre: SemestreConfig
): Record<number, number> {
  const holidaySet = new Set(semestre.feriados.map((f) => f.data));
  const diasSet = new Set(horarios.map((h) => h.diaSemana));
  const counts: Record<number, number> = {};
  for (const h of horarios) counts[h.diaSemana] = 0;

  let cursor = semestre.dataInicio;
  let guard = 0;
  while (cursor <= semestre.dataFim && guard < 400) {
    const dow = getDiaSemanaFromIso(cursor);
    if (dow >= 1 && dow <= 6 && diasSet.has(dow as DiaSemana) && !holidaySet.has(cursor)) {
      counts[dow] = (counts[dow] || 0) + 1;
    }
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return counts;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatNumberClean(n: number): string {
  const rounded = round2(n);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

export function getComicAlertByStatus(
  status: RiskLevel,
  encontrosRestantes: number,
  materiaNome?: string
): string {
  switch (status) {
    case 'ESTOURADO':
      return 'Fim da linha: cota zerada. A partir de agora você é patrimônio histórico da sala de aula.';
    case 'CRÍTICO':
      if (encontrosRestantes <= 1) {
        return 'Modo sobrevivência: só sobrou 1 falta. Se pisar fora de casa hoje, já era.';
      }
      return `Modo sobrevivência em ${materiaNome || 'campo minado'}: margem no osso. Respira e vai pra aula.`;
    case 'ATENÇÃO':
      return 'Sinal amarelo: o professor já começou a decorar seu rosto. Administre com sabedoria.';
    case 'SEGURO':
    default:
      return 'Saldo folgado. Dá pra dormir até mais tarde sem peso na consciência.';
  }
}

function buildHumanTranslation(
  materia: UserMateria,
  restanteLivre: number,
  unidade: 'h' | 'encontros',
  subCotas: SubCotaDia[],
  aulasRestantesSemestre: number
): string {
  if (unidade === 'encontros') {
    const inteiros = Math.max(0, Math.floor(restanteLivre));
    if (inteiros === 0) {
      return `Restam 0 encontros livres · Faltam ${aulasRestantesSemestre} aulas para acabar o semestre`;
    }
    return `Restam ${inteiros} ${inteiros === 1 ? 'encontro livre' : 'encontros livres'} · Faltam ${aulasRestantesSemestre} aulas para acabar o semestre`;
  }

  if (restanteLivre <= 0) {
    return `Restam 0h livres · Faltam ${aulasRestantesSemestre} aulas para acabar o semestre`;
  }

  if (materia.regraModo === 'diferente_por_dia' && materia.cotaIsoladaPorDia && subCotas.length > 0) {
    const resumoDias = subCotas
      .map((s) => {
        const aulas = Math.max(0, Math.floor(s.restantesHoras / Math.max(0.5, s.horasPorEncontro)));
        return `${s.label}: ${formatNumberClean(s.restantesHoras)}h (${aulas} aula${aulas === 1 ? '' : 's'})`;
      })
      .join(' · ');
    return `${resumoDias} · Faltam ${aulasRestantesSemestre} aulas`;
  }

  const horasBase = materia.horarios[0]?.horas || 2;
  const todasIguais = materia.horarios.every((h) => h.horas === horasBase);

  if (todasIguais) {
    const qtdAulas = Math.floor(restanteLivre / horasBase);
    return `Restam ${formatNumberClean(restanteLivre)}h livres · Equivale a ${qtdAulas} ${
      qtdAulas === 1 ? 'aula' : 'aulas'
    } de ${formatNumberClean(horasBase)}h`;
  }

  const detalhes = materia.horarios
    .map((h) => {
      const qtd = Math.floor(restanteLivre / Math.max(0.5, h.horas));
      return `${qtd}× ${DIA_SEMANA_LABELS[h.diaSemana].short} (${formatNumberClean(h.horas)}h)`;
    })
    .join(' ou ');
  return `Restam ${formatNumberClean(restanteLivre)}h livres · Equivale a ${detalhes}`;
}

export function calculateMateriaStats(
  materia: UserMateria,
  todasFaltas: UserFalta[],
  semestre: SemestreConfig,
  referenceDateStr: string
): MateriaStats {
  const faltasMateria = todasFaltas.filter((f) => f.materiaId === materia.id);
  const faltasConfirmadas = faltasMateria.filter((f) => f.tipo === 'falta');
  const faltasProgramadas = faltasMateria.filter((f) => f.tipo === 'programada');
  const aulasCanceladas = faltasMateria.filter((f) => f.tipo === 'sem_aula');

  const futureStart = referenceDateStr <= semestre.dataInicio ? semestre.dataInicio : referenceDateStr;
  const aulasFuturasBrutas =
    futureStart > semestre.dataFim
      ? 0
      : countScheduledMeetings(materia.horarios, futureStart, semestre.dataFim, semestre.feriados);
  const canceladasFuturas = aulasCanceladas.filter((f) => f.data >= futureStart).length;
  const aulasRestantesSemestre = Math.max(0, aulasFuturasBrutas - canceladasFuturas);

  const pctLimite = materia.percentualLimite > 0 ? materia.percentualLimite : 25;

  if (materia.regraModo === 'por_encontros') {
    const encontrosBase =
      materia.encontrosTotaisSemestre && materia.encontrosTotaisSemestre > 0
        ? materia.encontrosTotaisSemestre
        : Math.max(
            1,
            countScheduledMeetings(materia.horarios, semestre.dataInicio, semestre.dataFim, semestre.feriados)
          );
    const encontrosEfetivos = Math.max(1, encontrosBase - aulasCanceladas.length);
    const limiteTotal = Math.floor((encontrosEfetivos * pctLimite) / 100);
    const consumidoConfirmado = faltasConfirmadas.length;
    const consumidoProgramado = faltasProgramadas.length;
    const consumidoTotal = consumidoConfirmado + consumidoProgramado;
    const restanteRaw = limiteTotal - consumidoTotal;
    const restanteLivre = Math.max(0, restanteRaw);
    const excedidoPor = restanteRaw < 0 ? Math.abs(restanteRaw) : 0;
    const percentualConsumido = limiteTotal > 0 ? round2((consumidoTotal / limiteTotal) * 100) : 100;
    const encontrosRestantesCota = Math.max(0, Math.floor(restanteLivre));

    let status: RiskLevel = 'SEGURO';
    if (percentualConsumido >= 100 || restanteRaw < 0 || (limiteTotal > 0 && consumidoTotal >= limiteTotal)) {
      status = 'ESTOURADO';
    } else if (percentualConsumido >= 85 || encontrosRestantesCota <= 1) {
      status = 'CRÍTICO';
    } else if (percentualConsumido >= 60) {
      status = 'ATENÇÃO';
    }

    const zonaCriticaTerracota = percentualConsumido >= 75 || status === 'CRÍTICO' || status === 'ESTOURADO';

    return {
      materia,
      unidade: 'encontros',
      limiteTotal,
      consumidoConfirmado,
      consumidoProgramado,
      consumidoTotal,
      restanteLivre,
      excedidoPor,
      percentualConsumido,
      aulasRestantesSemestre,
      encontrosRestantesCota,
      status,
      zonaCriticaTerracota,
      traducaoHumana: buildHumanTranslation(materia, restanteLivre, 'encontros', [], aulasRestantesSemestre),
      fraseComica: getComicAlertByStatus(status, encontrosRestantesCota, materia.nome),
      subCotasPorDia: [],
      aulasCanceladasCount: aulasCanceladas.length,
    };
  }

  // Modo horas_totais ou diferente_por_dia
  const horasSemAula = aulasCanceladas.reduce((acc, f) => acc + f.horas, 0);
  const cargaEfetiva = Math.max(1, materia.cargaHorariaTotal - horasSemAula);
  const limiteTotal = round2((cargaEfetiva * pctLimite) / 100);

  const consumidoConfirmado = round2(faltasConfirmadas.reduce((acc, f) => acc + f.horas, 0));
  const consumidoProgramado = round2(faltasProgramadas.reduce((acc, f) => acc + f.horas, 0));
  const consumidoTotal = round2(consumidoConfirmado + consumidoProgramado);

  const restanteRaw = round2(limiteTotal - consumidoTotal);
  const restanteLivre = Math.max(0, restanteRaw);
  const excedidoPor = restanteRaw < 0 ? round2(Math.abs(restanteRaw)) : 0;

  let subCotasPorDia: SubCotaDia[] = [];
  let worstSubPct = 0;
  let worstSubRemainingMeetings = Infinity;

  if (materia.regraModo === 'diferente_por_dia') {
    const countsByDay = countMeetingsByWeekday(materia.horarios, semestre);
    subCotasPorDia = materia.horarios.map((h) => {
      const dayCancelHoras = aulasCanceladas
        .filter((f) => f.diaSemana === h.diaSemana)
        .reduce((a, b) => a + b.horas, 0);
      const dayMeetings = countsByDay[h.diaSemana] || 1;
      const dayTotalHoras = Math.max(h.horas, dayMeetings * h.horas - dayCancelHoras);
      const dayLimite = round2((dayTotalHoras * pctLimite) / 100);
      const dayUsadas = round2(
        faltasConfirmadas.filter((f) => f.diaSemana === h.diaSemana).reduce((a, b) => a + b.horas, 0)
      );
      const dayProg = round2(
        faltasProgramadas.filter((f) => f.diaSemana === h.diaSemana).reduce((a, b) => a + b.horas, 0)
      );
      const dayConsumido = round2(dayUsadas + dayProg);
      const dayRest = Math.max(0, round2(dayLimite - dayConsumido));
      const dayPct = dayLimite > 0 ? round2((dayConsumido / dayLimite) * 100) : 100;
      const dayMeetingsLeft = Math.floor(dayRest / Math.max(0.5, h.horas));
      if (dayPct > worstSubPct) worstSubPct = dayPct;
      if (dayMeetingsLeft < worstSubRemainingMeetings) worstSubRemainingMeetings = dayMeetingsLeft;

      return {
        diaSemana: h.diaSemana,
        label: h.modalidadeTag || DIA_SEMANA_LABELS[h.diaSemana].short,
        horasPorEncontro: h.horas,
        limiteHoras: dayLimite,
        usadasHoras: dayUsadas,
        programadasHoras: dayProg,
        restantesHoras: dayRest,
        percentualConsumido: dayPct,
      };
    });
  }

  const minHorasPorAula = Math.min(...materia.horarios.map((h) => h.horas || 2));
  const encontrosRestantesGlobal = Math.floor(restanteLivre / Math.max(0.5, minHorasPorAula));

  const effectivePct =
    materia.regraModo === 'diferente_por_dia' && materia.cotaIsoladaPorDia
      ? Math.max(limiteTotal > 0 ? round2((consumidoTotal / limiteTotal) * 100) : 100, worstSubPct)
      : limiteTotal > 0
      ? round2((consumidoTotal / limiteTotal) * 100)
      : 100;

  const encontrosRestantesCota =
    materia.regraModo === 'diferente_por_dia' && materia.cotaIsoladaPorDia && Number.isFinite(worstSubRemainingMeetings)
      ? Math.min(encontrosRestantesGlobal, worstSubRemainingMeetings)
      : encontrosRestantesGlobal;

  let status: RiskLevel = 'SEGURO';
  if (effectivePct >= 100 || restanteRaw < 0 || (consumidoTotal > 0 && restanteLivre < minHorasPorAula && effectivePct >= 99.9)) {
    status = 'ESTOURADO';
  } else if (effectivePct >= 85 || (consumidoTotal > 0 && encontrosRestantesCota <= 1)) {
    status = 'CRÍTICO';
  } else if (effectivePct >= 60) {
    status = 'ATENÇÃO';
  }

  // Note: if quota is tiny (e.g., 14h * 25% = 3.5h) and 0 used, don't flag CRÍTICO just for low total; check consumidoTotal > 0 or <= 1 encounter
  if (consumidoTotal === 0 && effectivePct === 0) {
    status = 'SEGURO';
  }

  const zonaCriticaTerracota = effectivePct >= 75 || status === 'CRÍTICO' || status === 'ESTOURADO';

  return {
    materia,
    unidade: 'h',
    limiteTotal,
    consumidoConfirmado,
    consumidoProgramado,
    consumidoTotal,
    restanteLivre,
    excedidoPor,
    percentualConsumido: effectivePct,
    aulasRestantesSemestre,
    encontrosRestantesCota,
    status,
    zonaCriticaTerracota,
    traducaoHumana: buildHumanTranslation(materia, restanteLivre, 'h', subCotasPorDia, aulasRestantesSemestre),
    fraseComica: getComicAlertByStatus(status, encontrosRestantesCota, materia.nome),
    subCotasPorDia,
    aulasCanceladasCount: aulasCanceladas.length,
  };
}

export function sortMateriasByUrgency(statsList: MateriaStats[]): MateriaStats[] {
  const rank: Record<RiskLevel, number> = {
    ESTOURADO: 0,
    CRÍTICO: 1,
    ATENÇÃO: 2,
    SEGURO: 3,
  };
  return [...statsList].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.percentualConsumido - a.percentualConsumido;
  });
}

export function getDynamicHeroGreeting(
  statsList: MateriaStats[],
  faltas: UserFalta[],
  semestre: SemestreConfig,
  todayStr: string
): { headline: string; subline: string } {
  const weekDates = getWeekDatesIso(todayStr);
  const weekSet = new Set(weekDates);
  const dow = getDiaSemanaFromIso(todayStr);

  const progSemana = faltas.filter((f) => f.tipo === 'programada' && weekSet.has(f.data));
  const tomorrow = addDaysIso(todayStr, 1);
  const isVesperaFeriado = Boolean(isFeriado(tomorrow, semestre.feriados));
  const isSexta = dow === 5;

  const materiaMap = new Map(statsList.map((s) => [s.materia.id, s]));

  if (progSemana.length > 0) {
    const primeira = materiaMap.get(progSemana[0].materiaId);
    const nome = primeira?.materia.nome || 'sua grade';
    return {
      headline: `Falta programada confirmada: você já garantiu sua folga em ${nome} essa semana.`,
      subline:
        progSemana.length > 1
          ? `Mais ${progSemana.length - 1} outra(s) ausência(s) planejada(s) nos próximos dias.`
          : 'Acompanhe o saldo para não transformar descanso em DP.',
    };
  }

  if (isSexta || isVesperaFeriado) {
    const criticas = statsList.filter((s) => s.status === 'CRÍTICO' || s.status === 'ESTOURADO').length;
    return {
      headline: 'Sextou com saldo positivo. Vai encarar a chamada ou ativar o modo fantasma?',
      subline:
        criticas > 0
          ? `Só cuidado: ${criticas} matéria(s) já acenderam o alerta magenta.`
          : 'Todas as suas matérias estão em zona segura por enquanto.',
    };
  }

  return {
    headline: 'E aí, iremos faltar essa semana ou vamos fingir responsabilidade?',
    subline: 'Registre presenças canceladas, programe folgas ou teste emendas no simulador.',
  };
}

export function simulateAbsenceRange(
  materias: UserMateria[],
  faltas: UserFalta[],
  semestre: SemestreConfig,
  startDateStr: string,
  endDateStr: string,
  referenceDateStr: string
): SimulacaoResultado {
  const start = startDateStr <= endDateStr ? startDateStr : endDateStr;
  const end = startDateStr <= endDateStr ? endDateStr : startDateStr;

  const holidayMap = new Map(semestre.feriados.map((f) => [f.data, f]));
  const diasUteisSelecionados: string[] = [];
  const feriadosNoPeriodo: Feriado[] = [];

  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 90) {
    const dow = getDiaSemanaFromIso(cursor);
    const fer = holidayMap.get(cursor);
    if (fer) {
      feriadosNoPeriodo.push(fer);
    } else if (dow >= 1 && dow <= 6) {
      diasUteisSelecionados.push(cursor);
    }
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }

  const existingKeys = new Set(faltas.map((f) => `${f.materiaId}__${f.data}`));
  const itens: SimulacaoItem[] = [];

  for (const mat of materias) {
    const datasAfetadas: { data: string; diaSemana: DiaSemana; horas: number }[] = [];
    for (const d of diasUteisSelecionados) {
      const dow = getDiaSemanaFromIso(d) as DiaSemana;
      const horarioDia = mat.horarios.find((h) => h.diaSemana === dow);
      if (horarioDia && !existingKeys.has(`${mat.id}__${d}`)) {
        datasAfetadas.push({ data: d, diaSemana: dow, horas: horarioDia.horas });
      }
    }

    if (datasAfetadas.length === 0) continue;

    const antes = calculateMateriaStats(mat, faltas, semestre, referenceDateStr);
    const simulatedFaltas: UserFalta[] = datasAfetadas.map((item, idx) => ({
      id: `sim_${mat.id}_${idx}`,
      userId: mat.userId,
      materiaId: mat.id,
      data: item.data,
      diaSemana: item.diaSemana,
      horas: item.horas,
      tipo: 'programada',
    }));

    const depois = calculateMateriaStats(mat, [...faltas, ...simulatedFaltas], semestre, referenceDateStr);
    const horasSimuladas = datasAfetadas.reduce((a, b) => a + b.horas, 0);

    itens.push({
      materia: mat,
      datasAfetadas,
      horasSimuladas,
      encontrosSimulados: datasAfetadas.length,
      antes,
      depois,
    });
  }

  const totalFaltasAGerar = itens.reduce((acc, item) => acc + item.datasAfetadas.length, 0);
  const estouradas = itens.filter((i) => i.depois.status === 'ESTOURADO');
  const criticas = itens.filter((i) => i.depois.status === 'CRÍTICO');

  let vereditoTitulo = 'Pode ir sem medo!';
  let vereditoTexto = 'Nenhuma matéria entra em zona crítica com essa folga. Boas férias antecipadas.';
  let vereditoRisco: 'ok' | 'atencao' | 'perigo' = 'ok';

  if (itens.length === 0) {
    vereditoTitulo = 'Nenhuma aula afetada';
    vereditoTexto =
      feriadosNoPeriodo.length > 0
        ? 'Você escolheu dias sem aula na sua grade ou já é feriado oficial.'
        : 'Nenhuma das suas disciplinas cadastradas acontece nesse intervalo.';
  } else if (estouradas.length > 0) {
    const primeira = estouradas[0];
    const unidadeLabel = primeira.depois.unidade === 'h' ? 'horas' : 'encontros';
    vereditoTitulo = 'Alerta vermelho: reprovação à vista!';
    vereditoTexto = `Você estoura o limite em ${primeira.materia.nome} por ${formatNumberClean(
      primeira.depois.excedidoPor
    )} ${unidadeLabel}. Melhor repensar a viagem.`;
    vereditoRisco = 'perigo';
  } else if (criticas.length > 0) {
    vereditoTitulo = 'Passa raspando na trave';
    vereditoTexto = `${criticas.map((c) => c.materia.nome).join(', ')} entra em modo sobrevivência depois dessa folga.`;
    vereditoRisco = 'atencao';
  }

  return {
    startDate: start,
    endDate: end,
    diasUteisSelecionados,
    feriadosNoPeriodo,
    itens,
    vereditoTitulo,
    vereditoTexto,
    vereditoRisco,
    totalFaltasAGerar,
  };
}

export function diffCatalogs(
  currentList: CatalogoDisciplina[],
  nextList: CatalogoDisciplina[]
): CatalogDiffItem[] {
  const currentMap = new Map(currentList.map((c) => [c.id, c]));
  const nextMap = new Map(nextList.map((n) => [n.id, n]));
  const result: CatalogDiffItem[] = [];

  for (const next of nextList) {
    const prev = currentMap.get(next.id);
    if (!prev) {
      result.push({ status: 'added', id: next.id, nome: next.nome, periodo: next.periodo, after: next });
    } else {
      const changed =
        prev.nome !== next.nome ||
        prev.cargaHorariaTotal !== next.cargaHorariaTotal ||
        prev.local !== next.local ||
        prev.periodo !== next.periodo ||
        JSON.stringify(prev.horarios) !== JSON.stringify(next.horarios);
      result.push({
        status: changed ? 'updated' : 'unchanged',
        id: next.id,
        nome: next.nome,
        periodo: next.periodo,
        before: prev,
        after: next,
      });
    }
  }

  for (const prev of currentList) {
    if (!nextMap.has(prev.id)) {
      result.push({ status: 'removed', id: prev.id, nome: prev.nome, periodo: prev.periodo, before: prev });
    }
  }

  return result;
}
