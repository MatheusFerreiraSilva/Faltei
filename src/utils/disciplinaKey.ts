import {
  AvisoColetivo,
  DisciplinaComunidade,
  SemAulaConsenso,
  UserMateria,
} from '../types/domain';

/**
 * Generates a deterministic, Firestore-safe ID slug from a discipline name
 * so manually added subjects without a `catalogoId` still group together
 * across students for enrollment counts and collective dashboard notices.
 */
export function slugifyDisciplinaNome(nome: string): string {
  const base = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');

  return base || 'disciplina';
}

export function resolveDisciplinaKey(input: {
  catalogoId?: string | null;
  disciplinaKey?: string | null;
  nome: string;
}): string {
  const cat = input.catalogoId?.trim();
  if (cat) return cat;
  const existing = input.disciplinaKey?.trim();
  if (existing) return existing;
  return slugifyDisciplinaNome(input.nome);
}

export function sanitizeAuthorDisplayName(
  displayName?: string | null,
  email?: string | null
): string {
  const cleaned = String(displayName || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (cleaned) return cleaned;
  const emailPrefix = String(email || '')
    .split('@')[0]
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return emailPrefix || 'Estudante';
}

export function buildSemAulaConsensoId(
  semestreId: string,
  disciplinaKey: string,
  isoDate: string
): string {
  const safeSem = String(semestreId || '2026.2')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 16);
  const safeDate = String(isoDate || '')
    .replace(/[^0-9-]/g, '')
    .slice(0, 10);
  const maxKeyLen = Math.max(8, 128 - safeSem.length - safeDate.length - 2);
  const safeKey = String(disciplinaKey || 'disciplina')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, maxKeyLen);
  return `${safeSem}_${safeKey}_${safeDate}`;
}

export function getEnrolledCountForMateria(
  materia: Pick<UserMateria, 'catalogoId' | 'disciplinaKey' | 'nome'>,
  comunidadeMap: Record<string, DisciplinaComunidade>
): number {
  const key = resolveDisciplinaKey(materia);
  return comunidadeMap[key]?.inscritosCount ?? 0;
}

export function filterAvisosForMaterias(
  avisos: AvisoColetivo[],
  materias: Array<Pick<UserMateria, 'catalogoId' | 'disciplinaKey' | 'nome'>>
): AvisoColetivo[] {
  const keys = new Set(materias.map((m) => resolveDisciplinaKey(m)));
  return avisos
    .filter((a) => keys.has(a.disciplinaKey))
    .sort((a, b) => b.data.localeCompare(a.data) || b.confirmacoes - a.confirmacoes);
}

export interface ClassSemAulaConsensusInfo {
  count: number;
  votedByMe: boolean;
  autorHint?: string;
  fromNotice?: AvisoColetivo;
}

export function getClassSemAulaConsensus(params: {
  semestreId: string;
  disciplinaKey: string;
  data: string;
  consensoMap: Record<string, SemAulaConsenso>;
  avisosColetivos: AvisoColetivo[];
  currentUserUid?: string;
}): ClassSemAulaConsensusInfo {
  const consensoId = buildSemAulaConsensoId(params.semestreId, params.disciplinaKey, params.data);
  const doc = params.consensoMap[consensoId];
  const docCount = Math.max(0, Number(doc?.votosCount) || 0);

  const matchingAvisos = params.avisosColetivos.filter(
    (a) =>
      a.disciplinaKey === params.disciplinaKey &&
      a.data === params.data &&
      a.tipo === 'sem_aula'
  );
  const avisoMaxCount = matchingAvisos.reduce(
    (max, av) => Math.max(max, Number(av.confirmacoes) || 0),
    0
  );

  const count = Math.max(docCount, avisoMaxCount);
  const votedByMe =
    Boolean(doc?.votedByMe) ||
    matchingAvisos.some(
      (a) =>
        Boolean(a.confirmadoPorMim) ||
        Boolean(params.currentUserUid && a.autorUid === params.currentUserUid)
    );
  const autorHint = doc?.ultimoAutorNome || matchingAvisos[0]?.autorNome;

  return {
    count,
    votedByMe,
    autorHint,
    fromNotice: matchingAvisos[0],
  };
}
