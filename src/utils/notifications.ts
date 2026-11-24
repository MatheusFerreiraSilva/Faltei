import {
  AvisoColetivo,
  DiaSemana,
  MateriaStats,
  NotificationDigestPayload,
  NotificationPreferences,
  SemAulaConsenso,
  SemestreConfig,
  TurnoAula,
  UserEvento,
  UserFalta,
  UserMateria,
} from '../types/domain';
import {
  addDaysIso,
  formatNumberClean,
  getDiaSemanaFromIso,
  getMateriaBlocos,
  isFeriado,
  round2,
} from './attendance';
import { getClassSemAulaConsensus, resolveDisciplinaKey } from './disciplinaKey';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  ativo: false,
  horarioNoturno: '20:30',
  alertasRisco: true,
  alertasAvaliacao: true,
  alertasTurma: true,
};

export const NIGHTLY_TIME_OPTIONS: string[] = [
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
  '22:30',
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  prova: 'Prova',
  trabalho: 'Trabalho',
  trabalho_grupo: 'Trabalho em grupo',
  seminario: 'Seminário',
};

const TURNO_LABELS: Record<TurnoAula, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
};

export interface BuildTomorrowDigestParams {
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  statsList: MateriaStats[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  avisosColetivos?: AvisoColetivo[];
  semAulaConsensoMap?: Record<string, SemAulaConsenso>;
  currentUserUid?: string;
  prefs?: Partial<NotificationPreferences>;
}

/**
 * Motor de Inteligência do "Plantão Noturno do Cúmplice":
 * Analisa a grade de AMANHÃ (excluindo feriados e dias com Sem Aula registrado)
 * e escolhe o cenário de maior prioridade entre os 5 roteiros bem-humorados.
 */
export function buildTomorrowDigestNotification(
  params: BuildTomorrowDigestParams
): NotificationDigestPayload {
  const {
    todayStr,
    semestreConfig,
    materias,
    statsList,
    faltas,
    eventos,
    avisosColetivos = [],
    semAulaConsensoMap = {},
    currentUserUid = '',
    prefs,
  } = params;

  const effectivePrefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...prefs,
  };

  const tomorrowStr = addDaysIso(todayStr, 1);
  const tomorrowDow = getDiaSemanaFromIso(tomorrowStr);
  const tomorrowHoliday = isFeriado(tomorrowStr, semestreConfig.feriados);
  const statsMap = new Map(statsList.map((s) => [s.materia.id, s]));

  // Coleta blocos previstos para amanhã (excluindo domingo, feriado e matérias já marcadas como sem_aula)
  const activeTomorrowClasses =
    tomorrowDow >= 1 && tomorrowDow <= 6 && !tomorrowHoliday
      ? materias
          .map((materia) => {
            const hasSemAulaPersonal = faltas.some(
              (f) => f.materiaId === materia.id && f.data === tomorrowStr && f.tipo === 'sem_aula'
            );
            if (hasSemAulaPersonal) return null;
            const blocos = getMateriaBlocos(materia)
              .filter((b) => b.diaSemana === (tomorrowDow as DiaSemana))
              .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
            if (blocos.length === 0) return null;
            const horasDia = round2(blocos.reduce((sum, b) => sum + b.horas, 0));
            return {
              materia,
              blocos,
              horarioInicio: blocos[0].horarioInicio,
              local: blocos[0].local || materia.local || 'UNIRIO',
              horasDia,
              stats: statsMap.get(materia.id),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio))
      : [];

  // 1. Prioridade Máxima: Aula Crítica / Zona Amarela (>= 80% da cota) amanhã
  if (effectivePrefs.alertasRisco && activeTomorrowClasses.length > 0) {
    const risky = activeTomorrowClasses
      .filter((item) => {
        const s = item.stats;
        if (!s) return false;
        return (
          s.percentualConsumido >= 80 ||
          s.zonaAmarela ||
          s.status === 'CRÍTICO' ||
          s.status === 'ESTOURADO'
        );
      })
      .sort(
        (a, b) => (b.stats?.percentualConsumido ?? 0) - (a.stats?.percentualConsumido ?? 0)
      );

    if (risky.length > 0) {
      const top = risky[0];
      const st = top.stats!;
      const margemStr =
        st.unidade === 'h'
          ? `${formatNumberClean(st.restanteLivre)}h`
          : `${formatNumberClean(st.restanteLivre)} enc.`;
      return {
        scenario: 'risco',
        title: '🚨 Alerta de sobrevivência para amanhã',
        body: `Amanhã às ${top.horarioInicio} tem ${top.materia.nome} (${top.local}) e você só tem mais ${margemStr} de margem. Bota o despertador no modo sirene do HUGG!`,
        targetDate: tomorrowStr,
        targetTab: 'hoje',
        materiaId: top.materia.id,
        materiaNome: top.materia.nome,
      };
    }
  }

  // 2. Prioridade 2: Prova, Trabalho, Trabalho em Grupo ou Seminário amanhã
  if (effectivePrefs.alertasAvaliacao) {
    const academicTypes = new Set(['prova', 'trabalho', 'trabalho_grupo', 'seminario']);
    const tomorrowPersonalEvents = eventos.filter(
      (ev) => ev.data === tomorrowStr && academicTypes.has(ev.tipo)
    );
    const tomorrowCollectiveEvents = avisosColetivos.filter(
      (av) => av.data === tomorrowStr && academicTypes.has(av.tipo)
    );

    if (tomorrowPersonalEvents.length > 0 || tomorrowCollectiveEvents.length > 0) {
      const ev = tomorrowPersonalEvents[0];
      const av = tomorrowCollectiveEvents[0];
      const tipo = ev ? ev.tipo : av.tipo;
      const tipoLabel = EVENT_TYPE_LABELS[tipo] || 'Avaliação';
      const titulo = ev ? ev.titulo : av.mensagem;
      const disciplinaNome = ev ? ev.disciplinaNome : av.disciplinaNome;
      const matchedClass = activeTomorrowClasses.find(
        (c) =>
          (ev?.materiaId && c.materia.id === ev.materiaId) ||
          resolveDisciplinaKey(c.materia) === (ev?.disciplinaKey || av?.disciplinaKey)
      );
      const horario = ev?.horario || matchedClass?.horarioInicio || '08:00';

      return {
        scenario: 'avaliacao',
        title: '📚 Dia inegociável amanhã',
        body: `Amanhã tem ${tipoLabel}: ${titulo} de ${disciplinaNome} às ${horario}. Faltar amanhã não gasta só sua cota, gasta sua aprovação.`,
        targetDate: tomorrowStr,
        targetTab: 'calendario',
        materiaId: ev?.materiaId || matchedClass?.materia.id,
        materiaNome: disciplinaNome,
      };
    }
  }

  // 3. Prioridade 3: Consenso da Turma ("Radar da Turma") de Sem Aula amanhã
  if (effectivePrefs.alertasTurma && activeTomorrowClasses.length > 0) {
    const consensusHits = activeTomorrowClasses
      .map((item) => {
        const key = resolveDisciplinaKey(item.materia);
        const info = getClassSemAulaConsensus({
          semestreId: item.materia.semestreId || semestreConfig.id,
          disciplinaKey: key,
          data: tomorrowStr,
          consensoMap: semAulaConsensoMap,
          avisosColetivos,
          currentUserUid,
        });
        return { item, count: info.count };
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);

    if (consensusHits.length > 0) {
      const top = consensusHits[0];
      const colegaLabel =
        top.count === 1 ? '1 colega marcou' : `${top.count} colegas marcaram`;
      return {
        scenario: 'turma',
        title: `👥 Opa! A turma movimentou ${top.item.materia.nome}`,
        body: `${colegaLabel} 'Sem Aula' para amanhã em ${top.item.materia.nome}. Confere no app antes de pegar condução à toa!`,
        targetDate: tomorrowStr,
        targetTab: 'hoje',
        materiaId: top.item.materia.id,
        materiaNome: top.item.materia.nome,
      };
    }
  }

  // 4. Prioridade 4: Maratona Pesada / Turno Duplo (>= 6h totais) amanhã
  if (activeTomorrowClasses.length > 0) {
    const totalHorasTomorrow = round2(
      activeTomorrowClasses.reduce((sum, item) => sum + item.horasDia, 0)
    );
    if (totalHorasTomorrow >= 6) {
      const uniqueTurns: TurnoAula[] = [];
      for (const item of activeTomorrowClasses) {
        for (const bloco of item.blocos) {
          if (!uniqueTurns.includes(bloco.turno)) uniqueTurns.push(bloco.turno);
        }
      }
      const order: TurnoAula[] = ['manha', 'tarde', 'noite'];
      const sortedTurns = uniqueTurns
        .sort((a, b) => order.indexOf(a) - order.indexOf(b))
        .map((t) => TURNO_LABELS[t])
        .join(' + ');

      const mat1 = activeTomorrowClasses[0].materia.nome;
      const mat2 = activeTomorrowClasses[1]?.materia.nome;
      const matsText = mat2 ? `${mat1} e ${mat2}` : mat1;

      return {
        scenario: 'maratona',
        title: `⚡ Amanhã é plantão de ${formatNumberClean(totalHorasTomorrow)}h de aula`,
        body: `Prepare o café e o jaleco: amanhã você encara ${matsText} (${sortedTurns || 'Integral'}).`,
        targetDate: tomorrowStr,
        targetTab: 'hoje',
        materiaId: activeTomorrowClasses[0].materia.id,
        materiaNome: mat1,
      };
    }
  }

  // 5. Prioridade 5: Dia Livre / Sem Aulas Regulares amanhã
  if (activeTomorrowClasses.length === 0) {
    return {
      scenario: 'livre',
      title: '🎉 Passe livre do Cúmplice',
      body: 'Boa notícia: amanhã você não tem aulas regulares na grade. Pode desligar o despertador sem culpa.',
      targetDate: tomorrowStr,
      targetTab: 'hoje',
    };
  }

  // Fallback para dia normal (< 6h, sem risco/prova/consenso): resumo leve com as aulas de amanhã
  const first = activeTomorrowClasses[0];
  const totalH = round2(activeTomorrowClasses.reduce((s, i) => s + i.horasDia, 0));
  return {
    scenario: 'maratona',
    title: `📅 Briefing do Cúmplice para amanhã (${formatNumberClean(totalH)}h)`,
    body: `Amanhã às ${first.horarioInicio} você começa com ${first.materia.nome} (${first.local}). Cota tranquila por enquanto!`,
    targetDate: tomorrowStr,
    targetTab: 'hoje',
    materiaId: first.materia.id,
    materiaNome: first.materia.nome,
  };
}

export function shouldTriggerNightlyDigest(params: {
  prefs: NotificationPreferences;
  now: Date;
  todayStr: string;
}): boolean {
  const { prefs, now, todayStr } = params;
  if (!prefs.ativo) return false;
  if (prefs.ultimoDisparoData === todayStr) return false;

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentHm = `${hh}:${mm}`;
  const targetHm = /^\d{2}:\d{2}$/.test(prefs.horarioNoturno) ? prefs.horarioNoturno : '20:30';
  return currentHm >= targetHm;
}

export function isIosNonStandaloneSafari(userAgent: string, isStandalone: boolean): boolean {
  if (isStandalone) return false;
  return /iphone|ipad|ipod/i.test(userAgent);
}
