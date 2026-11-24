import {
  BlocoAula,
  DiaSemana,
  FaltaDetalheTipo,
  FaltaTipo,
  HorarioAula,
  PeriodoId,
  RegraModo,
  SemestreConfig,
  UserEvento,
  UserEventoTipo,
  UserFalta,
  UserMateria,
  UserProfile,
} from '../types/domain';
import { normalizeBlocosFromHorarios } from './attendance';
import { resolveDisciplinaKey } from './disciplinaKey';

const VALID_PERIODOS = new Set<PeriodoId>(['1', '2', '3', '4', '5', '6', '7', '8', 'optativa']);
const VALID_REGRAS = new Set<RegraModo>(['horas_totais', 'diferente_por_dia', 'por_encontros']);
const VALID_FALTA_TIPOS = new Set<FaltaTipo>(['falta', 'programada', 'sem_aula']);
const VALID_FALTA_DETALHE = new Set<FaltaDetalheTipo>([
  'dia_completo',
  'turno_manha',
  'turno_tarde',
  'turno_noite',
  'parcial',
]);
const VALID_EVENTO_TIPOS = new Set<UserEventoTipo>([
  'prova',
  'trabalho',
  'trabalho_grupo',
  'seminario',
  'sem_aula',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SAFE_ID_RE = /^[a-zA-Z0-9._-]+$/;

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  semestre: {
    id: string;
    nome: string;
    dataInicio: string;
    dataFim: string;
  };
  profile: {
    displayName: string;
    email?: string;
    periodoAtual?: PeriodoId;
    percentualPadrao?: number;
  };
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
}

export interface ValidatedBackupResult {
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
  profilePatch?: {
    displayName?: string;
    periodoAtual?: PeriodoId;
    percentualPadrao?: number;
  };
}

function makeSafeId(prefix: string, index: number): string {
  return `${prefix}_imp_${Date.now().toString(36)}_${index}`;
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function serializeBackupPayload(params: {
  semestre: SemestreConfig;
  profile: UserProfile | null;
  displayName: string;
  periodoAtual?: PeriodoId;
  percentualPadrao?: number;
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos: UserEvento[];
}): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    semestre: {
      id: params.semestre.id,
      nome: params.semestre.nome,
      dataInicio: params.semestre.dataInicio,
      dataFim: params.semestre.dataFim,
    },
    profile: {
      displayName: params.displayName,
      email: params.profile?.email || '',
      ...(params.periodoAtual ? { periodoAtual: params.periodoAtual } : {}),
      percentualPadrao: params.percentualPadrao ?? 25,
    },
    materias: params.materias.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
    faltas: params.faltas.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
    eventos: params.eventos.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
  };
}

export function parseAndValidateBackupJson(
  rawText: string,
  options: { targetUserId: string; defaultSemestreId: string }
): ValidatedBackupResult {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Arquivo de backup vazio.');
  }
  if (rawText.length > 2_500_000) {
    throw new Error('Arquivo de backup excede o tamanho máximo suportado (2,5 MB).');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('JSON inválido. Verifique se o arquivo foi exportado pelo faltei.');
  }

  if (!isPlainRecord(parsed)) {
    throw new Error('Estrutura de backup inválida.');
  }
  if (!Array.isArray(parsed.materias)) {
    throw new Error('Backup inválido: campo "materias" ausente ou incorreto.');
  }
  if (parsed.materias.length > 40) {
    throw new Error('Backup excede o limite de 40 matérias.');
  }

  const rawFaltas = parsed.faltas === undefined ? [] : parsed.faltas;
  const rawEventos = parsed.eventos === undefined ? [] : parsed.eventos;
  if (!Array.isArray(rawFaltas) || !Array.isArray(rawEventos)) {
    throw new Error('Backup inválido: campos "faltas" ou "eventos" devem ser listas.');
  }
  if (rawFaltas.length > 800 || rawEventos.length > 300) {
    throw new Error('Backup excede os limites de registros permitidos.');
  }

  const idMap = new Map<string, string>();
  const materias: UserMateria[] = [];

  parsed.materias.forEach((item, idx) => {
    if (!isPlainRecord(item)) {
      throw new Error(`Matéria #${idx + 1} possui formato inválido.`);
    }
    const nome = typeof item.nome === 'string' ? item.nome.trim().slice(0, 160) : '';
    if (!nome) {
      throw new Error(`Matéria #${idx + 1} está sem nome.`);
    }
    const periodo: PeriodoId = VALID_PERIODOS.has(item.periodo as PeriodoId)
      ? (item.periodo as PeriodoId)
      : '4';
    const regraModo: RegraModo = VALID_REGRAS.has(item.regraModo as RegraModo)
      ? (item.regraModo as RegraModo)
      : 'horas_totais';

    if (!Array.isArray(item.horarios) || item.horarios.length === 0) {
      throw new Error(`Matéria "${nome}" está sem horários semanais válidos.`);
    }

    const horarios: HorarioAula[] = item.horarios.slice(0, 7).map((h) => {
      if (!isPlainRecord(h)) {
        throw new Error(`Horário inválido na matéria "${nome}".`);
      }
      const dow = Number(h.diaSemana);
      if (!Number.isInteger(dow) || dow < 1 || dow > 6) {
        throw new Error(`Dia da semana inválido na matéria "${nome}".`);
      }
      const horarioInicio =
        typeof h.horarioInicio === 'string' && TIME_HM_RE.test(h.horarioInicio)
          ? h.horarioInicio
          : '08:00';
      const horarioFim =
        typeof h.horarioFim === 'string' && TIME_HM_RE.test(h.horarioFim)
          ? h.horarioFim
          : '10:00';
      const horas = Math.max(0.5, Math.min(16, Number(h.horas) || 2));
      return {
        diaSemana: dow as DiaSemana,
        horarioInicio,
        horarioFim,
        horas,
        ...(typeof h.local === 'string' && h.local.trim()
          ? { local: h.local.trim().slice(0, 160) }
          : {}),
        ...(typeof h.modalidadeTag === 'string' && h.modalidadeTag.trim()
          ? { modalidadeTag: h.modalidadeTag.trim().slice(0, 60) }
          : {}),
      };
    });

    const newId = makeSafeId('mat', idx);
    if (typeof item.id === 'string' && item.id.trim()) {
      idMap.set(item.id, newId);
    }

    const local = typeof item.local === 'string' ? item.local.trim().slice(0, 160) : '';
    const catalogoId =
      typeof item.catalogoId === 'string' &&
      item.catalogoId.trim() &&
      SAFE_ID_RE.test(item.catalogoId.trim())
        ? item.catalogoId.trim().slice(0, 128)
        : undefined;

    const rawBlocos = Array.isArray(item.blocosAula) ? item.blocosAula : [];
    const blocosAula: BlocoAula[] =
      rawBlocos.length > 0
        ? rawBlocos.slice(0, 14).map((b, bIdx) => {
            const rec = isPlainRecord(b) ? b : {};
            const dow = Number(rec.diaSemana);
            const hIni =
              typeof rec.horarioInicio === 'string' && TIME_HM_RE.test(rec.horarioInicio)
                ? rec.horarioInicio
                : horarios[0].horarioInicio;
            const hFim =
              typeof rec.horarioFim === 'string' && TIME_HM_RE.test(rec.horarioFim)
                ? rec.horarioFim
                : horarios[0].horarioFim;
            const turno =
              rec.turno === 'manha' || rec.turno === 'tarde' || rec.turno === 'noite'
                ? rec.turno
                : 'manha';
            return {
              id: `${newId}_b${bIdx}`,
              diaSemana: (dow >= 1 && dow <= 6 ? dow : horarios[0].diaSemana) as DiaSemana,
              turno,
              horarioInicio: hIni,
              horarioFim: hFim,
              horas: Math.max(0.5, Math.min(16, Number(rec.horas) || 2)),
              local: typeof rec.local === 'string' ? rec.local.trim().slice(0, 160) : local,
              ...(typeof rec.modalidadeTag === 'string' && rec.modalidadeTag.trim()
                ? { modalidadeTag: rec.modalidadeTag.trim().slice(0, 60) }
                : {}),
            };
          })
        : normalizeBlocosFromHorarios(horarios, local, newId).slice(0, 14);

    const semestreId =
      typeof item.semestreId === 'string' && item.semestreId.trim()
        ? item.semestreId.trim().slice(0, 32)
        : options.defaultSemestreId;

    const disciplinaKey = resolveDisciplinaKey({
      catalogoId,
      disciplinaKey:
        typeof item.disciplinaKey === 'string' && SAFE_ID_RE.test(item.disciplinaKey)
          ? item.disciplinaKey
          : undefined,
      nome,
    });

    materias.push({
      id: newId,
      userId: options.targetUserId,
      ...(catalogoId ? { catalogoId } : {}),
      disciplinaKey,
      semestreId,
      nome,
      local,
      periodo,
      horarios,
      blocosAula,
      regraModo,
      cargaHorariaTotal: Math.max(1, Math.min(1000, Number(item.cargaHorariaTotal) || 64)),
      percentualLimite: Math.max(1, Math.min(99, Math.round(Number(item.percentualLimite) || 25))),
      cotaIsoladaPorDia: Boolean(item.cotaIsoladaPorDia),
      encontrosTotaisSemestre: Math.max(
        1,
        Math.min(400, Math.round(Number(item.encontrosTotaisSemestre) || 30))
      ),
    });
  });

  const validMateriaIds = new Set(materias.map((m) => m.id));
  const faltas: UserFalta[] = [];

  rawFaltas.forEach((raw, idx) => {
    if (!isPlainRecord(raw)) return;
    const mappedMatId =
      typeof raw.materiaId === 'string' ? idMap.get(raw.materiaId) : undefined;
    if (!mappedMatId || !validMateriaIds.has(mappedMatId)) return;
    if (typeof raw.data !== 'string' || !ISO_DATE_RE.test(raw.data)) return;
    const tipo: FaltaTipo = VALID_FALTA_TIPOS.has(raw.tipo as FaltaTipo)
      ? (raw.tipo as FaltaTipo)
      : 'falta';
    const dow = Number(raw.diaSemana);
    if (!Number.isInteger(dow) || dow < 1 || dow > 6) return;
    const horas = Math.max(0.5, Math.min(24, Number(raw.horas) || 2));
    const horasAbatidas = Math.max(
      0.5,
      Math.min(24, Number(raw.horasAbatidas ?? horas) || horas)
    );
    const tipoFalta: FaltaDetalheTipo = VALID_FALTA_DETALHE.has(
      raw.tipoFalta as FaltaDetalheTipo
    )
      ? (raw.tipoFalta as FaltaDetalheTipo)
      : 'dia_completo';

    faltas.push({
      id: makeSafeId('flt', idx),
      userId: options.targetUserId,
      materiaId: mappedMatId,
      data: raw.data,
      diaSemana: dow as DiaSemana,
      horas,
      horasAbatidas,
      tipo,
      tipoFalta,
      ...(typeof raw.observacao === 'string' && raw.observacao.trim()
        ? { observacao: raw.observacao.trim().slice(0, 240) }
        : {}),
    });
  });

  const eventos: UserEvento[] = [];
  rawEventos.forEach((raw, idx) => {
    if (!isPlainRecord(raw)) return;
    if (typeof raw.data !== 'string' || !ISO_DATE_RE.test(raw.data)) return;
    const titulo = typeof raw.titulo === 'string' ? raw.titulo.trim().slice(0, 160) : '';
    if (titulo.length < 2) return;
    const tipo: UserEventoTipo = VALID_EVENTO_TIPOS.has(raw.tipo as UserEventoTipo)
      ? (raw.tipo as UserEventoTipo)
      : 'prova';
    const disciplinaNome =
      typeof raw.disciplinaNome === 'string' && raw.disciplinaNome.trim()
        ? raw.disciplinaNome.trim().slice(0, 160)
        : 'Disciplina';
    const mappedMatId =
      typeof raw.materiaId === 'string' ? idMap.get(raw.materiaId) : undefined;

    eventos.push({
      id: makeSafeId('evt', idx),
      userId: options.targetUserId,
      ...(mappedMatId ? { materiaId: mappedMatId } : {}),
      disciplinaKey: resolveDisciplinaKey({ nome: disciplinaNome }),
      disciplinaNome,
      semestreId:
        typeof raw.semestreId === 'string' && raw.semestreId.trim()
          ? raw.semestreId.trim().slice(0, 32)
          : options.defaultSemestreId,
      data: raw.data,
      tipo,
      titulo,
      ...(typeof raw.detalhes === 'string' && raw.detalhes.trim()
        ? { detalhes: raw.detalhes.trim().slice(0, 240) }
        : {}),
      ...(typeof raw.grupo === 'string' && raw.grupo.trim()
        ? { grupo: raw.grupo.trim().slice(0, 100) }
        : {}),
      ...(typeof raw.horario === 'string' && raw.horario.trim()
        ? { horario: raw.horario.trim().slice(0, 16) }
        : {}),
    });
  });

  let profilePatch: ValidatedBackupResult['profilePatch'];
  if (isPlainRecord(parsed.profile)) {
    profilePatch = {
      ...(typeof parsed.profile.displayName === 'string' && parsed.profile.displayName.trim()
        ? { displayName: parsed.profile.displayName.trim().slice(0, 120) }
        : {}),
      ...(VALID_PERIODOS.has(parsed.profile.periodoAtual as PeriodoId)
        ? { periodoAtual: parsed.profile.periodoAtual as PeriodoId }
        : {}),
      ...(typeof parsed.profile.percentualPadrao === 'number'
        ? {
            percentualPadrao: Math.max(
              1,
              Math.min(99, Math.round(parsed.profile.percentualPadrao))
            ),
          }
        : {}),
    };
  }

  return {
    materias,
    faltas,
    eventos,
    ...(profilePatch ? { profilePatch } : {}),
  };
}
