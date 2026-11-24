import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO_2026_2, SEMESTRE_2026_2 } from '../data/seed2026_2';
import { UserFalta, UserMateria } from '../types/domain';
import {
  calculateMateriaStats,
  countScheduledMeetings,
  diffCatalogs,
  getDayAttendanceOptions,
  getDynamicHeroGreeting,
  getMateriaBlocos,
  getPeriodoStyle,
  simulateAbsenceRange,
  sortMateriasByUrgency,
} from './attendance';
import {
  buildWeeklyScheduleModel,
  computeBlockGeometry,
  HOUR_HEIGHT_PX,
  shiftWeekIso,
  WEEKLY_TOTAL_HEIGHT_PX,
} from './weeklyGrid';
import {
  applyCatalogLinkToCandidate,
  isStale2026Catalog,
  matchExtractedToCatalogo,
} from './catalogMatcher';
import {
  buildSemAulaConsensoId,
  filterAvisosForMaterias,
  getClassSemAulaConsensus,
  getEnrolledCountForMateria,
  resolveDisciplinaKey,
  sanitizeAuthorDisplayName,
  slugifyDisciplinaNome,
} from './disciplinaKey';
import {
  buildCalendarMonthCells,
  countMonthSummary,
  getCalendarBadgeMeta,
  getMonthLabelPtBr,
  shiftYearMonth,
} from './calendar';
import {
  buildTomorrowDigestNotification,
  DEFAULT_NOTIFICATION_PREFS,
  isIosNonStandaloneSafari,
  shouldTriggerNightlyDigest,
} from './notifications';
import { parseAndValidateBackupJson, serializeBackupPayload } from './backup';

const baseMateriaHoras: UserMateria = {
  id: 'mat_urinario',
  userId: 'u1',
  semestreId: '2026.2',
  nome: 'Sistema Urinário',
  local: 'Instituto Biomédico',
  periodo: '1',
  horarios: [{ diaSemana: 5, horarioInicio: '08:00', horarioFim: '12:00', horas: 4 }],
  regraModo: 'horas_totais',
  cargaHorariaTotal: 64,
  percentualLimite: 25,
  cotaIsoladaPorDia: false,
};

test('2026.2 seed has exact 86 subjects, 16 divisaoDiferente, and exact period hours matching PDF', () => {
  assert.equal(CATALOGO_2026_2.length, 86);
  assert.equal(CATALOGO_2026_2.filter((d) => d.divisaoDiferente).length, 16);

  const countByPeriodo = (p: string) => CATALOGO_2026_2.filter((d) => d.periodo === p).length;
  const hoursByPeriodo = (p: string) =>
    CATALOGO_2026_2.filter((d) => d.periodo === p).reduce((acc, d) => acc + d.cargaHorariaTotal, 0);

  assert.equal(countByPeriodo('1'), 7);
  assert.equal(hoursByPeriodo('1'), 535);

  assert.equal(countByPeriodo('2'), 8);
  assert.equal(hoursByPeriodo('2'), 576);

  assert.equal(countByPeriodo('3'), 8);
  assert.equal(hoursByPeriodo('3'), 580);

  assert.equal(countByPeriodo('4'), 10);
  assert.equal(hoursByPeriodo('4'), 488);

  assert.equal(countByPeriodo('5'), 8);
  assert.equal(hoursByPeriodo('5'), 446);

  assert.equal(countByPeriodo('6'), 9);
  assert.equal(hoursByPeriodo('6'), 444);

  assert.equal(countByPeriodo('7'), 10);
  assert.equal(hoursByPeriodo('7'), 466);

  assert.equal(countByPeriodo('8'), 10);
  assert.equal(hoursByPeriodo('8'), 572);

  assert.equal(countByPeriodo('optativa'), 16);

  // Unified PSIII check
  const ps3 = CATALOGO_2026_2.find((d) => d.id === 'unirio_2026_2_p3_praticas_saude_3_unificada');
  assert.ok(ps3);
  assert.equal(ps3.divisaoDiferente, true);
  assert.equal(ps3.cargaHorariaTotal, 92);
  assert.equal(ps3.horarios.length, 2);

  // 2ªF has 14 school days in 2026.2 (17 - 3 holidays: 07/09, 12/10, 02/11)
  const monDays = countScheduledMeetings(
    [{ diaSemana: 1, horarioInicio: '08:00', horarioFim: '10:00', horas: 2 }],
    SEMESTRE_2026_2.dataInicio,
    SEMESTRE_2026_2.dataFim,
    SEMESTRE_2026_2.feriados
  );
  assert.equal(monDays, 14);
  // 6ªF has 16 school days (17 - 1 holiday: 20/11)
  const friDays = countScheduledMeetings(
    [{ diaSemana: 5, horarioInicio: '08:00', horarioFim: '12:00', horas: 4 }],
    SEMESTRE_2026_2.dataInicio,
    SEMESTRE_2026_2.dataFim,
    SEMESTRE_2026_2.feriados
  );
  assert.equal(friDays, 16);
});

test('Mode 1 (horas_totais) computes 25% quota, sem_aula reduction, and risk levels', () => {
  const faltas: UserFalta[] = [
    { id: 'f1', userId: 'u1', materiaId: 'mat_urinario', data: '2026-09-04', diaSemana: 5, horas: 4, tipo: 'falta' },
    { id: 'f2', userId: 'u1', materiaId: 'mat_urinario', data: '2026-09-11', diaSemana: 5, horas: 4, tipo: 'programada' },
  ];
  const stats = calculateMateriaStats(baseMateriaHoras, faltas, SEMESTRE_2026_2, '2026-11-23');
  assert.equal(stats.limiteTotal, 16);
  assert.equal(stats.consumidoConfirmado, 4);
  assert.equal(stats.consumidoProgramado, 4);
  assert.equal(stats.restanteLivre, 8);
  assert.equal(stats.percentualConsumido, 50);
  assert.equal(stats.status, 'SEGURO');
  assert.match(stats.traducaoHumana, /Restam 8h livres/);
  assert.match(stats.traducaoHumana, /2 aulas de 4h/);

  const faltasEstouradas: UserFalta[] = [
    ...faltas,
    { id: 'f3', userId: 'u1', materiaId: 'mat_urinario', data: '2026-09-18', diaSemana: 5, horas: 4, tipo: 'falta' },
    { id: 'f4', userId: 'u1', materiaId: 'mat_urinario', data: '2026-09-25', diaSemana: 5, horas: 4, tipo: 'falta' },
  ];
  const statsEst = calculateMateriaStats(baseMateriaHoras, faltasEstouradas, SEMESTRE_2026_2, '2026-11-23');
  assert.equal(statsEst.status, 'ESTOURADO');
  assert.equal(statsEst.zonaCriticaTerracota, true);

  const faltasSemAula: UserFalta[] = [
    { id: 's1', userId: 'u1', materiaId: 'mat_urinario', data: '2026-08-21', diaSemana: 5, horas: 4, tipo: 'sem_aula' },
  ];
  const statsSemAula = calculateMateriaStats(baseMateriaHoras, faltasSemAula, SEMESTRE_2026_2, '2026-11-23');
  assert.equal(statsSemAula.limiteTotal, 15);
  assert.equal(statsSemAula.aulasCanceladasCount, 1);
});

test('Mode 2 (diferente_por_dia) with isolated quotas flags critical per day/modality', () => {
  const matIsolated: UserMateria = {
    id: 'mat_locomotor',
    userId: 'u1',
    semestreId: '2026.2',
    nome: 'Sistema Locomotor',
    periodo: '1',
    horarios: [
      { diaSemana: 4, horarioInicio: '13:00', horarioFim: '16:00', horas: 3 },
      { diaSemana: 5, horarioInicio: '13:00', horarioFim: '15:00', horas: 2 },
    ],
    regraModo: 'diferente_por_dia',
    cargaHorariaTotal: 83,
    percentualLimite: 25,
    cotaIsoladaPorDia: true,
  };
  const fridayFaltas: UserFalta[] = ['2026-08-21', '2026-08-28', '2026-09-04', '2026-09-11'].map((d, i) => ({
    id: `ff_${i}`,
    userId: 'u1',
    materiaId: 'mat_locomotor',
    data: d,
    diaSemana: 5,
    horas: 2,
    tipo: 'falta',
  }));
  const stats = calculateMateriaStats(matIsolated, fridayFaltas, SEMESTRE_2026_2, '2026-11-23');
  assert.equal(stats.status, 'ESTOURADO');
  assert.equal(stats.subCotasPorDia.length, 2);
});

test('Mode 3 (por_encontros) ignores hour duration and uses meeting counts', () => {
  const matEnc: UserMateria = {
    ...baseMateriaHoras,
    id: 'mat_enc',
    regraModo: 'por_encontros',
    encontrosTotaisSemestre: 30,
  };
  const faltas: UserFalta[] = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09'].map(
    (d, i) => ({
      id: `e_${i}`,
      userId: 'u1',
      materiaId: 'mat_enc',
      data: d,
      diaSemana: 5,
      horas: 4,
      tipo: 'falta',
    })
  );
  const stats = calculateMateriaStats(matEnc, faltas, SEMESTRE_2026_2, '2026-11-23');
  assert.equal(stats.unidade, 'encontros');
  assert.equal(stats.limiteTotal, 7);
  assert.equal(stats.restanteLivre, 1);
  assert.equal(stats.status, 'CRÍTICO');
});

test('Simulator crosses date range, skips holidays, and returns comic verdict', () => {
  const sim = simulateAbsenceRange(
    [baseMateriaHoras],
    [],
    SEMESTRE_2026_2,
    '2026-11-20',
    '2026-11-27',
    '2026-11-18'
  );
  assert.equal(sim.feriadosNoPeriodo.length, 1);
  assert.equal(sim.totalFaltasAGerar, 1);
  assert.equal(sim.vereditoRisco, 'ok');
});

test('Urgency sort, UNIRIO period styles, greeting, and catalog diff behave predictably', () => {
  const s1 = calculateMateriaStats(baseMateriaHoras, [], SEMESTRE_2026_2, '2026-11-23');
  const s2 = calculateMateriaStats(
    { ...baseMateriaHoras, id: 'm2', nome: 'Crítica' },
    [
      { id: 'c1', userId: 'u1', materiaId: 'm2', data: '2026-09-04', diaSemana: 5, horas: 12, tipo: 'falta' },
    ],
    SEMESTRE_2026_2,
    '2026-11-23'
  );
  const sorted = sortMateriasByUrgency([s1, s2]);
  assert.equal(sorted[0].materia.id, 'm2');

  assert.equal(getPeriodoStyle('1').borderColor, '#1E3A8A');
  assert.equal(getPeriodoStyle('3').badgeBg, '#CCFBF1');
  assert.equal(getPeriodoStyle('3').badgeText, '#0F766E');
  assert.equal(getPeriodoStyle('8').borderColor, '#0E1A59');
  assert.equal(getPeriodoStyle('optativa').borderColor, '#EC1580');
  assert.equal(getPeriodoStyle('optativa').badgeBg, '#FCE7F3');
  assert.equal(getPeriodoStyle('optativa').badgeText, '#BE185D');

  const greeting = getDynamicHeroGreeting([s1], [], SEMESTRE_2026_2, '2026-11-23');
  assert.match(greeting.headline, /fingir responsabilidade/);

  const diff = diffCatalogs(CATALOGO_2026_2.slice(0, 2), [
    { ...CATALOGO_2026_2[0], cargaHorariaTotal: 140 },
    { ...CATALOGO_2026_2[2], id: 'nova_2027' },
  ]);
  assert.equal(diff.filter((d) => d.status === 'updated').length, 1);
  assert.equal(diff.filter((d) => d.status === 'added').length, 1);
  assert.equal(diff.filter((d) => d.status === 'removed').length, 1);
});

test('Smart print catalogMatcher cross-references UNIRIO screenshots with official 2026.2 catalog', () => {
  const results = matchExtractedToCatalogo(
    [
      {
        nome: 'FARMACOLOGIA II - TURMA A',
        horarios: [
          { diaSemana: 2, horarioInicio: '10:00', horarioFim: '12:00', horas: 2 },
          { diaSemana: 4, horarioInicio: '13:00', horarioFim: '17:00', horas: 4 },
        ],
      },
      {
        nome: 'SEMIOLOGIA E PROPEDEUTICA DO ADULTO I',
        horarios: [
          { diaSemana: 4, horarioInicio: '10:00', horarioFim: '12:00', horas: 2 },
          { diaSemana: 4, horarioInicio: '13:00', horarioFim: '17:00', horas: 4 },
        ],
      },
      {
        nome: 'Liga Academica Extra Unirio',
        horarios: [{ diaSemana: 6, horarioInicio: '09:00', horarioFim: '11:00', horas: 2 }],
      },
    ],
    CATALOGO_2026_2
  );

  assert.equal(results.length, 3);
  assert.equal(results[0].matchedCatalogo?.id, 'unirio_2026_2_p5_farmacologia_2');
  assert.equal(results[0].periodo, '5');
  assert.equal(results[0].cargaHorariaTotal, 102);
  assert.equal(results[0].regraModo, 'diferente_por_dia');

  assert.equal(results[1].matchedCatalogo?.id, 'unirio_2026_2_p4_semiologia_adulto_1');
  assert.equal(results[1].cargaHorariaTotal, 102);
  assert.equal(results[1].regraModo, 'horas_totais');

  assert.equal(results[2].matchedCatalogo, null);
  assert.equal(results[2].matchConfidence, 'manual');

  const relinked = applyCatalogLinkToCandidate(results[2], CATALOGO_2026_2[0]);
  assert.equal(relinked.matchedCatalogo?.id, CATALOGO_2026_2[0].id);
  assert.equal(relinked.cargaHorariaTotal, CATALOGO_2026_2[0].cargaHorariaTotal);

  // Stale catalog detection
  assert.equal(isStale2026Catalog(CATALOGO_2026_2), false);
  assert.equal(
    isStale2026Catalog(
      CATALOGO_2026_2.filter((d) => d.id !== 'unirio_2026_2_p4_anatomia_patologica_1')
    ),
    true
  );
  assert.equal(
    isStale2026Catalog([
      { ...CATALOGO_2026_2[0], id: 'mat_2027_1', semestreId: '2027.1' },
    ]),
    false
  );
});

test('disciplinaKey normalizes manual subject names deterministically for shared counts and collective notices', () => {
  assert.equal(slugifyDisciplinaNome('  Anatomia Clínica! '), 'anatomia-clinica');
  assert.equal(slugifyDisciplinaNome('ANATOMIA CLÍNICA'), 'anatomia-clinica');
  assert.equal(slugifyDisciplinaNome('Farmacologia   Avançada — Turma B'), 'farmacologia-avancada-turma-b');
  assert.equal(slugifyDisciplinaNome('   ---   '), 'disciplina');

  // Truncation respects 96-char Firestore-safe limit without trailing hyphens
  const longSlug = slugifyDisciplinaNome('Disciplina '.repeat(15));
  assert.ok(longSlug.length <= 96);
  assert.equal(longSlug.endsWith('-'), false);

  // Resolution priority: catalogoId > existing disciplinaKey > slugify(nome)
  assert.equal(
    resolveDisciplinaKey({
      catalogoId: 'unirio_2026_2_p4_semiologia_adulto_1',
      disciplinaKey: 'semiologia',
      nome: 'Semiologia',
    }),
    'unirio_2026_2_p4_semiologia_adulto_1'
  );
  assert.equal(
    resolveDisciplinaKey({
      disciplinaKey: 'liga-de-cirurgia',
      nome: 'Liga de Cirurgia Geral',
    }),
    'liga-de-cirurgia'
  );

  // Two students manually adding the same subject without catalogoId get identical keys
  const studentA: UserMateria = {
    ...baseMateriaHoras,
    id: 'm_a',
    userId: 'u_a',
    nome: 'Farmacologia Clínica',
  };
  const studentB: UserMateria = {
    ...baseMateriaHoras,
    id: 'm_b',
    userId: 'u_b',
    nome: '  farmacologia clinica! ',
  };
  const keyA = resolveDisciplinaKey(studentA);
  const keyB = resolveDisciplinaKey(studentB);
  assert.equal(keyA, 'farmacologia-clinica');
  assert.equal(keyA, keyB);

  const comunidadeMap = {
    'farmacologia-clinica': {
      key: 'farmacologia-clinica',
      nome: 'Farmacologia Clínica',
      semestreId: '2026.2',
      inscritosCount: 12,
      updatedAt: '2026-11-23T12:00:00.000Z',
    },
  };
  assert.equal(getEnrolledCountForMateria(studentA, comunidadeMap), 12);
  assert.equal(getEnrolledCountForMateria(studentB, comunidadeMap), 12);
  assert.equal(getEnrolledCountForMateria(baseMateriaHoras, comunidadeMap), 0);

  const avisos = [
    {
      id: 'av1',
      disciplinaKey: 'farmacologia-clinica',
      disciplinaNome: 'Farmacologia Clínica',
      semestreId: '2026.2',
      data: '2026-11-23',
      tipo: 'sem_aula' as const,
      mensagem: 'Aula cancelada pelo docente',
      autorUid: 'u_a',
      autorNome: 'Aluno A',
      isOficial: false,
      confirmacoes: 3,
      createdAt: '2026-11-23T08:00:00.000Z',
    },
    {
      id: 'av2',
      disciplinaKey: 'outra-materia',
      disciplinaNome: 'Outra Matéria',
      semestreId: '2026.2',
      data: '2026-11-24',
      tipo: 'aviso' as const,
      mensagem: 'Não deve aparecer para aluno B',
      autorUid: 'u_x',
      autorNome: 'Aluno X',
      isOficial: false,
      confirmacoes: 1,
      createdAt: '2026-11-23T09:00:00.000Z',
    },
  ];
  const filtered = filterAvisosForMaterias(avisos, [studentB]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'av1');
});

test('Calendar builder plots monthly cells with provas, trabalhos em grupo, seminários, sem aula, holidays, and classes', () => {
  assert.equal(getMonthLabelPtBr(2026, 10), 'Novembro 2026');
  assert.deepEqual(shiftYearMonth(2026, 11, 1), { year: 2027, monthIndex0: 0 });
  assert.equal(getCalendarBadgeMeta('trabalho_grupo').label, 'Trabalho em grupo');
  assert.equal(getCalendarBadgeMeta('sem_aula').label, 'Não tem aula');

  const cells = buildCalendarMonthCells({
    year: 2026,
    monthIndex0: 10, // November 2026
    todayStr: '2026-11-23',
    semestreConfig: SEMESTRE_2026_2,
    materias: [baseMateriaHoras],
    faltas: [
      {
        id: 'f_sem',
        userId: 'u1',
        materiaId: baseMateriaHoras.id,
        data: '2026-11-13',
        diaSemana: 5,
        horas: 4,
        tipo: 'sem_aula',
      },
    ],
    eventos: [
      {
        id: 'ev1',
        userId: 'u1',
        materiaId: baseMateriaHoras.id,
        disciplinaNome: 'Sistema Urinário',
        semestreId: '2026.2',
        data: '2026-11-24',
        tipo: 'prova',
        titulo: 'P2 Teórica',
      },
      {
        id: 'ev2',
        userId: 'u1',
        materiaId: baseMateriaHoras.id,
        disciplinaNome: 'Sistema Urinário',
        semestreId: '2026.2',
        data: '2026-11-25',
        tipo: 'trabalho_grupo',
        titulo: 'Caso Clínico',
        grupo: 'Grupo 3',
      },
      {
        id: 'ev3',
        userId: 'u1',
        materiaId: baseMateriaHoras.id,
        disciplinaNome: 'Sistema Urinário',
        semestreId: '2026.2',
        data: '2026-11-27',
        tipo: 'seminario',
        titulo: 'Seminário Renal',
      },
    ],
    avisosColetivos: [
      {
        id: 'av_cal',
        disciplinaKey: resolveDisciplinaKey(baseMateriaHoras),
        disciplinaNome: 'Sistema Urinário',
        semestreId: '2026.2',
        data: '2026-11-23',
        tipo: 'sem_aula',
        mensagem: 'Professor em congresso',
        autorUid: 'u2',
        autorNome: 'Colega',
        isOficial: false,
        confirmacoes: 4,
      },
    ],
    activeFilter: 'all',
  });

  assert.ok(cells.length === 35 || cells.length === 42);
  const nov20 = cells.find((c) => c.isoDate === '2026-11-20');
  assert.ok(nov20);
  assert.equal(nov20.isHoliday, true);
  assert.equal(nov20.iconSummary.includes('feriado'), true);
  // No regular class on holiday
  assert.equal(nov20.classesCount, 0);

  const nov24 = cells.find((c) => c.isoDate === '2026-11-24');
  assert.ok(nov24);
  assert.equal(nov24.iconSummary[0], 'prova');

  const nov25 = cells.find((c) => c.isoDate === '2026-11-25');
  assert.ok(nov25);
  assert.equal(nov25.iconSummary[0], 'trabalho_grupo');
  assert.equal(nov25.items[0].grupo, 'Grupo 3');

  const nov23 = cells.find((c) => c.isoDate === '2026-11-23');
  assert.ok(nov23);
  assert.equal(nov23.isToday, true);
  assert.equal(nov23.iconSummary.includes('sem_aula'), true);

  const summary = countMonthSummary(cells);
  assert.equal(summary.provas, 1);
  assert.equal(summary.trabalhos, 1);
  assert.equal(summary.seminarios, 1);
  assert.ok(summary.semAula >= 3); // 2 holidays (02/11, 20/11) + sem_aula falta + sem_aula aviso

  const evalCells = buildCalendarMonthCells({
    year: 2026,
    monthIndex0: 10,
    todayStr: '2026-11-23',
    semestreConfig: SEMESTRE_2026_2,
    materias: [baseMateriaHoras],
    faltas: [],
    eventos: [
      {
        id: 'ev1',
        userId: 'u1',
        disciplinaNome: 'Sistema Urinário',
        semestreId: '2026.2',
        data: '2026-11-24',
        tipo: 'prova',
        titulo: 'P2',
      },
    ],
    avisosColetivos: [],
    activeFilter: 'avaliacoes',
  });
  const evalOnlySummary = countMonthSummary(evalCells);
  assert.equal(evalOnlySummary.provas, 1);
  assert.equal(evalOnlySummary.aulas, 0);
});

test('Author display name sanitization and crowd sem_aula consensus propagate into calendar class items', () => {
  assert.equal(sanitizeAuthorDisplayName('  Matheus   Henrique  ', 'mat@unirio.br'), 'Matheus Henrique');
  assert.equal(sanitizeAuthorDisplayName('', 'ana.silva@edu.unirio.br'), 'ana.silva');
  assert.equal(sanitizeAuthorDisplayName('', ''), 'Estudante');

  const key = resolveDisciplinaKey(baseMateriaHoras);
  const cId = buildSemAulaConsensoId('2026.2', key, '2026-11-27');
  assert.ok(cId.length <= 128);
  assert.match(cId, /^[a-zA-Z0-9._-]+$/);

  const consensoMap = {
    [cId]: {
      id: cId,
      disciplinaKey: key,
      disciplinaNome: baseMateriaHoras.nome,
      semestreId: '2026.2',
      data: '2026-11-27',
      votosCount: 5,
      ultimoAutorNome: 'Matheus Henrique',
      votedByMe: false,
    },
  };

  const info = getClassSemAulaConsensus({
    semestreId: '2026.2',
    disciplinaKey: key,
    data: '2026-11-27',
    consensoMap,
    avisosColetivos: [],
    currentUserUid: 'u1',
  });
  assert.equal(info.count, 5);
  assert.equal(info.votedByMe, false);
  assert.equal(info.autorHint, 'Matheus Henrique');

  const calCells = buildCalendarMonthCells({
    year: 2026,
    monthIndex0: 10,
    todayStr: '2026-11-23',
    semestreConfig: SEMESTRE_2026_2,
    materias: [baseMateriaHoras],
    faltas: [],
    eventos: [],
    avisosColetivos: [],
    semAulaConsensoMap: consensoMap,
  });
  const nov27 = calCells.find((c) => c.isoDate === '2026-11-27');
  assert.ok(nov27);
  assert.equal(nov27.iconSummary.includes('sem_aula'), true);
  assert.equal(nov27.items[0].semAulaConsensusCount, 5);
  assert.equal(nov27.items[0].semAulaAutorHint, 'Matheus Henrique');
});

test('Block 2: blocosAula splits multi-turn subjects, computes turn-only & partial absences, and renders real-day balance translation', () => {
  const semiologiaCat = CATALOGO_2026_2.find((c) => c.id === 'unirio_2026_2_p4_semiologia_adulto_1');
  const sistNervosoCat = CATALOGO_2026_2.find((c) => c.id === 'unirio_2026_2_p2_sistema_nervoso');
  const hematoCat = CATALOGO_2026_2.find((c) => c.id === 'unirio_2026_2_p7_hematologia');
  const locomotorCat = CATALOGO_2026_2.find((c) => c.id === 'unirio_2026_2_p1_sistema_locomotor');

  assert.ok(semiologiaCat && sistNervosoCat && hematoCat && locomotorCat);

  // Thursday (diaSemana 4) Semiologia has Manhã (2h) + Tarde (4h)
  const semBlocosThu = (semiologiaCat.blocosAula || []).filter((b) => b.diaSemana === 4);
  assert.equal(semBlocosThu.length, 2);
  assert.equal(semBlocosThu[0].turno, 'manha');
  assert.equal(semBlocosThu[0].horas, 2);
  assert.equal(semBlocosThu[1].turno, 'tarde');
  assert.equal(semBlocosThu[1].horas, 4);

  // Thursday (diaSemana 4) Sistema Nervoso has Manhã (2h) + Tarde (4h)
  const snBlocosThu = (sistNervosoCat.blocosAula || []).filter((b) => b.diaSemana === 4);
  assert.equal(snBlocosThu.length, 2);
  assert.equal(snBlocosThu[0].horas, 2);
  assert.equal(snBlocosThu[1].horas, 4);

  // Wednesday (diaSemana 3) Hematologia splits into Manhã (2h) + Tarde (1h)
  const hemBlocosWed = (hematoCat.blocosAula || []).filter((b) => b.diaSemana === 3);
  assert.equal(hemBlocosWed.length, 2);
  assert.equal(hemBlocosWed[0].horas, 2);
  assert.equal(hemBlocosWed[1].horas, 1);

  const sistNervosoMat: UserMateria = {
    id: 'mat_sn',
    userId: 'u1',
    catalogoId: sistNervosoCat.id,
    semestreId: '2026.2',
    nome: sistNervosoCat.nome,
    local: sistNervosoCat.local,
    periodo: sistNervosoCat.periodo,
    horarios: sistNervosoCat.horarios,
    blocosAula: getMateriaBlocos({
      id: 'mat_sn',
      local: sistNervosoCat.local,
      horarios: sistNervosoCat.horarios,
      blocosAula: sistNervosoCat.blocosAula,
    }),
    regraModo: 'horas_totais',
    cargaHorariaTotal: sistNervosoCat.cargaHorariaTotal,
    percentualLimite: 25,
    cotaIsoladaPorDia: false,
  };

  // Options on Thursday (2026-09-10): Dia Completo (6h), Só Manhã (2h), Só Tarde (4h), maxParcial = 5
  const thuSummary = getDayAttendanceOptions(sistNervosoMat, '2026-09-10');
  assert.equal(thuSummary.hasTurnosDistintos, true);
  assert.equal(thuSummary.totalHorasDia, 6);
  assert.equal(thuSummary.maxParcialHoras, 5);
  assert.equal(thuSummary.options.map((o) => o.tipoFalta).join(','), 'dia_completo,turno_manha,turno_tarde');

  // Turn-only absence (Só Manhã = 2h) leaves remaining afternoon intact in quota calculation
  const manhaOpt = thuSummary.options.find((o) => o.tipoFalta === 'turno_manha')!;
  const statsManha = calculateMateriaStats(
    sistNervosoMat,
    [
      {
        id: 'fm1',
        userId: 'u1',
        materiaId: 'mat_sn',
        data: '2026-09-10',
        diaSemana: 4,
        horas: 2,
        horasAbatidas: 2,
        tipoFalta: 'turno_manha',
        blocoId: manhaOpt.blocoId,
        tipo: 'falta',
      },
    ],
    SEMESTRE_2026_2,
    '2026-09-10'
  );
  assert.equal(statsManha.consumidoConfirmado, 2);

  // Partial 1h absence on a 4h Friday class
  const partialStats = calculateMateriaStats(
    baseMateriaHoras,
    [
      {
        id: 'fp1',
        userId: 'u1',
        materiaId: baseMateriaHoras.id,
        data: '2026-09-04',
        diaSemana: 5,
        horas: 1,
        horasAbatidas: 1,
        tipoFalta: 'parcial',
        tipo: 'falta',
      },
    ],
    SEMESTRE_2026_2,
    '2026-09-10'
  );
  assert.equal(partialStats.consumidoConfirmado, 1);
  assert.equal(partialStats.restanteLivre, 15);

  // Real-day balance translation for uneven-day subject (3h Thu + 2h Fri, 12h free)
  const locomotorMat: UserMateria = {
    id: 'mat_loc',
    userId: 'u1',
    semestreId: '2026.2',
    nome: 'Sistema Locomotor',
    periodo: '1',
    horarios: locomotorCat.horarios,
    blocosAula: locomotorCat.blocosAula,
    regraModo: 'diferente_por_dia',
    cargaHorariaTotal: 48, // 25% = 12h free
    percentualLimite: 25,
    cotaIsoladaPorDia: false,
  };
  const locStats = calculateMateriaStats(locomotorMat, [], SEMESTRE_2026_2, '2026-09-01');
  assert.equal(
    locStats.traducaoHumana,
    'Saldo: 12h livres = até 4 faltas de 5ªF (3h) ou 6 faltas de 6ªF (2h)'
  );

  // Simulator sums both Morning + Afternoon blocks on Thursday (2h + 4h = 6h)
  const simSn = simulateAbsenceRange(
    [sistNervosoMat],
    [],
    SEMESTRE_2026_2,
    '2026-09-10',
    '2026-09-10',
    '2026-09-01'
  );
  assert.equal(simSn.itens.length, 1);
  assert.equal(simSn.itens[0].horasSimuladas, 6);
});

test('Block 1: weeklyGrid builds proportional 52px/h blocks, hides Saturday unless active, and reflects faltas/feriados/avaliações', () => {
  assert.equal(HOUR_HEIGHT_PX, 52);
  assert.equal(WEEKLY_TOTAL_HEIGHT_PX, 624);

  const g4h = computeBlockGeometry('08:00', '12:00');
  const g2h = computeBlockGeometry('13:00', '15:00');
  assert.equal(g4h.topPx, 52);
  assert.equal(g4h.heightPx, 208);
  assert.equal(g2h.topPx, 312);
  assert.equal(g2h.heightPx, 104);
  assert.equal(g4h.heightPx, g2h.heightPx * 2);

  assert.equal(shiftWeekIso('2026-09-08', 1), '2026-09-14');
  assert.equal(shiftWeekIso('2026-09-08', -1), '2026-08-31');

  const semiologiaCat = CATALOGO_2026_2.find((c) => c.id === 'unirio_2026_2_p4_semiologia_adulto_1')!;
  const semiologiaMat: UserMateria = {
    id: 'mat_semio',
    userId: 'u1',
    catalogoId: semiologiaCat.id,
    semestreId: '2026.2',
    nome: semiologiaCat.nome,
    local: semiologiaCat.local,
    periodo: '4',
    horarios: semiologiaCat.horarios,
    blocosAula: semiologiaCat.blocosAula,
    regraModo: 'horas_totais',
    cargaHorariaTotal: semiologiaCat.cargaHorariaTotal,
    percentualLimite: 25,
    cotaIsoladaPorDia: false,
  };
  const manhaBlock = getMateriaBlocos(semiologiaMat).find(
    (b) => b.diaSemana === 4 && b.turno === 'manha'
  )!;

  // Week of 2026-09-07 (contains Sept 7 holiday on Mon) without Saturday class -> 5 columns
  const model5 = buildWeeklyScheduleModel({
    anchorIso: '2026-09-09',
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [semiologiaMat, baseMateriaHoras],
    faltas: [
      {
        id: 'f_thu_m',
        userId: 'u1',
        materiaId: semiologiaMat.id,
        data: '2026-09-10',
        diaSemana: 4,
        horas: 2,
        horasAbatidas: 2,
        tipoFalta: 'turno_manha',
        blocoId: manhaBlock.id,
        tipo: 'falta',
      },
      {
        id: 'f_fri_p',
        userId: 'u1',
        materiaId: baseMateriaHoras.id,
        data: '2026-09-11',
        diaSemana: 5,
        horas: 4,
        tipo: 'programada',
      },
    ],
    eventos: [
      {
        id: 'ev_thu',
        userId: 'u1',
        materiaId: semiologiaMat.id,
        disciplinaNome: semiologiaMat.nome,
        semestreId: '2026.2',
        data: '2026-09-10',
        tipo: 'prova',
        titulo: 'P1 Semiologia',
      },
    ],
    avisosColetivos: [],
  });

  assert.equal(model5.hasSaturday, false);
  assert.equal(model5.columns.length, 5);
  assert.equal(model5.isCurrentWeek, true);
  assert.ok(model5.columns[0].holiday); // Sept 7 Independence Day

  const thuCol = model5.columns.find((c) => c.diaSemana === 4)!;
  assert.equal(thuCol.dayEvaluations.length, 1);
  const thuManha = thuCol.blocks.find((b) => b.bloco.id === manhaBlock.id)!;
  const thuTarde = thuCol.blocks.find((b) => b.bloco.id !== manhaBlock.id)!;
  assert.equal(thuManha.visualState, 'falta');
  assert.equal(thuTarde.visualState, 'normal'); // Turn-only absence kept afternoon normal!

  const friCol = model5.columns.find((c) => c.diaSemana === 5)!;
  assert.equal(friCol.blocks[0].visualState, 'programada');

  // With a Saturday class, Saturday column appears automatically (6 columns)
  const satMat: UserMateria = {
    ...baseMateriaHoras,
    id: 'mat_sat',
    horarios: [{ diaSemana: 6, horarioInicio: '08:00', horarioFim: '10:00', horas: 2 }],
    blocosAula: undefined,
  };
  const model6 = buildWeeklyScheduleModel({
    anchorIso: '2026-09-09',
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [satMat],
    faltas: [],
    eventos: [],
    avisosColetivos: [],
  });
  assert.equal(model6.hasSaturday, true);
  assert.equal(model6.columns.length, 6);
});

test('Zona Amarela triggers at >= 80% before busting and clears below 80% or when ESTOURADO', () => {
  // 100h subject (2h/class) => 25h quota => 20h used = 80% (5h left = 2 encounters, Zona Amarela = true, not ESTOURADO)
  const mat100: UserMateria = {
    ...baseMateriaHoras,
    id: 'mat_100h',
    horarios: [{ diaSemana: 5, horarioInicio: '08:00', horarioFim: '10:00', horas: 2 }],
    cargaHorariaTotal: 100,
    percentualLimite: 25,
  };
  const s75 = calculateMateriaStats(
    mat100,
    [{ id: 'fa', userId: 'u1', materiaId: 'mat_100h', data: '2026-09-04', diaSemana: 5, horas: 18, tipo: 'falta' }],
    SEMESTRE_2026_2,
    '2026-11-23'
  );
  assert.equal(s75.zonaAmarela, false);

  const s80 = calculateMateriaStats(
    mat100,
    [{ id: 'fb', userId: 'u1', materiaId: 'mat_100h', data: '2026-09-04', diaSemana: 5, horas: 20, tipo: 'falta' }],
    SEMESTRE_2026_2,
    '2026-11-23'
  );
  assert.equal(s80.percentualConsumido, 80);
  assert.equal(s80.zonaAmarela, true);
  assert.equal(s80.status, 'ATENÇÃO');

  const s100 = calculateMateriaStats(
    mat100,
    [{ id: 'fc', userId: 'u1', materiaId: 'mat_100h', data: '2026-09-04', diaSemana: 5, horas: 25, tipo: 'falta' }],
    SEMESTRE_2026_2,
    '2026-11-23'
  );
  assert.equal(s100.status, 'ESTOURADO');
  assert.equal(s100.zonaAmarela, false);
});

test('Nightly briefing engine prioritizes all 5 humorous scenarios and respects holidays & sem_aula', () => {
  const matThu: UserMateria = {
    ...baseMateriaHoras,
    id: 'mat_thu',
    nome: 'Semiologia Médica',
    local: 'HUGG',
    horarios: [
      { diaSemana: 4, horarioInicio: '08:00', horarioFim: '12:00', horas: 4 },
      { diaSemana: 4, horarioInicio: '13:00', horarioFim: '15:00', horas: 2 },
    ],
    cargaHorariaTotal: 100,
  };

  // Tomorrow is Thursday 2026-09-10 (todayStr = 2026-09-09)
  // Scenario 1: Risco (>= 80%)
  const statsRisk = calculateMateriaStats(
    matThu,
    [{ id: 'r1', userId: 'u1', materiaId: 'mat_thu', data: '2026-08-27', diaSemana: 4, horas: 21, tipo: 'falta' }],
    SEMESTRE_2026_2,
    '2026-09-09'
  );
  const d1 = buildTomorrowDigestNotification({
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [matThu],
    statsList: [statsRisk],
    faltas: [],
    eventos: [
      {
        id: 'ev1',
        userId: 'u1',
        materiaId: 'mat_thu',
        disciplinaNome: matThu.nome,
        semestreId: '2026.2',
        data: '2026-09-10',
        tipo: 'prova',
        titulo: 'P1',
      },
    ],
  });
  assert.equal(d1.scenario, 'risco');
  assert.match(d1.title, /Alerta de sobrevivência/);
  assert.match(d1.body, /HUGG/);
  assert.match(d1.body, /4h de margem/);

  // Scenario 2: Avaliação when risco disabled or safe
  const statsSafe = calculateMateriaStats(matThu, [], SEMESTRE_2026_2, '2026-09-09');
  const d2 = buildTomorrowDigestNotification({
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [matThu],
    statsList: [statsSafe],
    faltas: [],
    eventos: [
      {
        id: 'ev1',
        userId: 'u1',
        materiaId: 'mat_thu',
        disciplinaNome: matThu.nome,
        semestreId: '2026.2',
        data: '2026-09-10',
        tipo: 'prova',
        titulo: 'P1 Prática',
        horario: '09:30',
      },
    ],
  });
  assert.equal(d2.scenario, 'avaliacao');
  assert.match(d2.title, /Dia inegociável/);
  assert.match(d2.body, /P1 Prática/);

  // Scenario 3: Consenso da Turma
  const keyThu = resolveDisciplinaKey(matThu);
  const cId = buildSemAulaConsensoId('2026.2', keyThu, '2026-09-10');
  const d3 = buildTomorrowDigestNotification({
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [matThu],
    statsList: [statsSafe],
    faltas: [],
    eventos: [],
    semAulaConsensoMap: {
      [cId]: {
        id: cId,
        disciplinaKey: keyThu,
        disciplinaNome: matThu.nome,
        semestreId: '2026.2',
        data: '2026-09-10',
        votosCount: 4,
      },
    },
  });
  assert.equal(d3.scenario, 'turma');
  assert.match(d3.body, /4 colegas marcaram 'Sem Aula'/);

  // Scenario 4: Maratona >= 6h (Manhã + Tarde)
  const d4 = buildTomorrowDigestNotification({
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [matThu],
    statsList: [statsSafe],
    faltas: [],
    eventos: [],
  });
  assert.equal(d4.scenario, 'maratona');
  assert.match(d4.title, /plantão de 6h/);
  assert.match(d4.body, /Manhã \+ Tarde/);

  // Scenario 5: Dia Livre (Holiday 2026-09-07 or sem_aula recorded for tomorrow)
  const d5Holiday = buildTomorrowDigestNotification({
    todayStr: '2026-09-06',
    semestreConfig: SEMESTRE_2026_2,
    materias: [{ ...baseMateriaHoras, horarios: [{ diaSemana: 1, horarioInicio: '08:00', horarioFim: '12:00', horas: 4 }] }],
    statsList: [statsSafe],
    faltas: [],
    eventos: [],
  });
  assert.equal(d5Holiday.scenario, 'livre');
  assert.match(d5Holiday.title, /Passe livre/);

  const d5SemAula = buildTomorrowDigestNotification({
    todayStr: '2026-09-09',
    semestreConfig: SEMESTRE_2026_2,
    materias: [matThu],
    statsList: [statsSafe],
    faltas: [{ id: 'sa', userId: 'u1', materiaId: 'mat_thu', data: '2026-09-10', diaSemana: 4, horas: 6, tipo: 'sem_aula' }],
    eventos: [],
  });
  assert.equal(d5SemAula.scenario, 'livre');

  // Scheduler & iOS standalone check
  assert.equal(
    shouldTriggerNightlyDigest({
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, ativo: true, horarioNoturno: '20:30' },
      now: new Date(2026, 8, 9, 20, 35, 0),
      todayStr: '2026-09-09',
    }),
    true
  );
  assert.equal(
    shouldTriggerNightlyDigest({
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, ativo: true, horarioNoturno: '20:30', ultimoDisparoData: '2026-09-09' },
      now: new Date(2026, 8, 9, 21, 0, 0),
      todayStr: '2026-09-09',
    }),
    false
  );
  assert.equal(isIosNonStandaloneSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', false), true);
  assert.equal(isIosNonStandaloneSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', true), false);
});

test('Backup JSON serializer and validator round-trip valid backups and reject corrupted files', () => {
  const payload = serializeBackupPayload({
    semestre: SEMESTRE_2026_2,
    profile: { uid: 'u1', email: 'a@b.com', displayName: 'Ana', role: 'student' },
    displayName: 'Ana',
    periodoAtual: '4',
    percentualPadrao: 25,
    materias: [baseMateriaHoras],
    faltas: [{ id: 'f1', userId: 'u1', materiaId: baseMateriaHoras.id, data: '2026-09-04', diaSemana: 5, horas: 4, tipo: 'falta' }],
    eventos: [{ id: 'e1', userId: 'u1', materiaId: baseMateriaHoras.id, disciplinaNome: 'Sistema Urinário', semestreId: '2026.2', data: '2026-09-18', tipo: 'prova', titulo: 'Prova 1' }],
  });

  const restored = parseAndValidateBackupJson(JSON.stringify(payload), {
    targetUserId: 'u2',
    defaultSemestreId: '2026.2',
  });
  assert.equal(restored.materias.length, 1);
  assert.equal(restored.materias[0].userId, 'u2');
  assert.equal(restored.faltas.length, 1);
  assert.equal(restored.faltas[0].materiaId, restored.materias[0].id);
  assert.equal(restored.eventos.length, 1);
  assert.equal(restored.eventos[0].materiaId, restored.materias[0].id);

  assert.throws(() => parseAndValidateBackupJson('not json', { targetUserId: 'u2', defaultSemestreId: '2026.2' }));
  assert.throws(() => parseAndValidateBackupJson('{"materias":"invalid"}', { targetUserId: 'u2', defaultSemestreId: '2026.2' }));
});






