import { CatalogoDisciplina, HorarioAula, PeriodoId, RegraModo } from '../types/domain';

export interface ExtractedScheduleDiscipline {
  nome: string;
  codigo?: string;
  local?: string;
  periodo?: PeriodoId;
  cargaHorariaTotal?: number;
  divisaoDiferente?: boolean;
  horarios: HorarioAula[];
}

export interface SmartReviewCandidate {
  id: string;
  selected: boolean;
  extractedNome: string;
  matchedCatalogo: CatalogoDisciplina | null;
  matchConfidence: 'exato' | 'aproximado' | 'manual';
  nome: string;
  local: string;
  periodo: PeriodoId;
  cargaHorariaTotal: number;
  regraModo: RegraModo;
  horarios: HorarioAula[];
  subturmaNota?: string;
}

export function normalizeTextForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fund|fundamentos)\b/g, 'fund')
    .replace(/\b(introd|introducao)\b/g, 'introducao')
    .replace(/\b(anf|anfiteatro)\b/g, 'anfiteatro')
    .replace(/\b(praticas?)\b/g, 'praticas')
    .replace(/\b(clinica)\b/g, 'clinica')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function romanToArabicToken(s: string): string {
  return s
    .replace(/\bviii\b/g, '8')
    .replace(/\bvii\b/g, '7')
    .replace(/\bvi\b/g, '6')
    .replace(/\biv\b/g, '4')
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\bi\b/g, '1')
    .replace(/\bv\b/g, '5');
}

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'por', 'ao', 'na', 'no']);

function tokenize(input: string): string[] {
  const norm = romanToArabicToken(normalizeTextForMatch(input));
  return norm
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function computeSimilarityScore(
  extracted: ExtractedScheduleDiscipline,
  candidate: CatalogoDisciplina
): number {
  const extNorm = romanToArabicToken(normalizeTextForMatch(extracted.nome));
  const catNorm = romanToArabicToken(normalizeTextForMatch(candidate.nome));

  if (!extNorm || !catNorm) return 0;
  if (extNorm === catNorm) return 1.0;

  // Substring boost (e.g. "Bioestatística" inside "Práticas em Saúde III (Bioestatística e Epidemiologia)")
  if (catNorm.includes(extNorm) && extNorm.length >= 5) {
    return 0.88;
  }
  if (extNorm.includes(catNorm) && catNorm.length >= 5) {
    return 0.85;
  }

  const extTokens = tokenize(extracted.nome);
  const catTokens = tokenize(candidate.nome);
  if (extTokens.length === 0 || catTokens.length === 0) return 0;

  const catSet = new Set(catTokens);
  let matches = 0;
  for (const tok of extTokens) {
    if (catSet.has(tok)) {
      matches += 1;
    } else if (tok.length >= 4 && catTokens.some((c) => c.startsWith(tok) || tok.startsWith(c))) {
      matches += 0.75;
    }
  }

  // Require trailing level number (1,2,3...) to agree if present in both
  const extNum = extTokens.find((t) => /^[1-8]$/.test(t));
  const catNum = catTokens.find((t) => /^[1-8]$/.test(t));
  if (extNum && catNum && extNum !== catNum) {
    return 0.1;
  }

  const unionSize = new Set([...extTokens, ...catTokens]).size;
  let score = matches / Math.max(1, Math.min(extTokens.length, catTokens.length)) * 0.7 + (matches / Math.max(1, unionSize)) * 0.3;

  // Bonus if day of week overlaps with catalog schedule
  if (extracted.horarios?.length) {
    const extDays = new Set(extracted.horarios.map((h) => h.diaSemana));
    const dayOverlap = candidate.horarios.some((h) => extDays.has(h.diaSemana));
    if (dayOverlap) score += 0.08;
  }

  return Math.min(0.99, score);
}

export function matchExtractedToCatalogo(
  extractedList: ExtractedScheduleDiscipline[],
  catalogo: CatalogoDisciplina[]
): SmartReviewCandidate[] {
  return extractedList.map((ext, idx) => {
    let best: CatalogoDisciplina | null = null;
    let bestScore = 0;

    for (const cat of catalogo) {
      const score = computeSimilarityScore(ext, cat);
      if (score > bestScore) {
        bestScore = score;
        best = cat;
      }
    }

    const matched = bestScore >= 0.45 ? best : null;
    const matchConfidence: 'exato' | 'aproximado' | 'manual' =
      bestScore >= 0.85 ? 'exato' : matched ? 'aproximado' : 'manual';

    const extractedHorarios: HorarioAula[] =
      Array.isArray(ext.horarios) && ext.horarios.length > 0
        ? ext.horarios
        : [{ diaSemana: 1, horarioInicio: '08:00', horarioFim: '10:00', horas: 2 }];

    if (matched) {
      // Detect any extra/practical time slots from the screenshot that aren't in the official theoretical catalog
      const officialDays = new Set(matched.horarios.map((h) => `${h.diaSemana}_${h.horarioInicio}`));
      const extraSlots = extractedHorarios.filter(
        (h) => !officialDays.has(`${h.diaSemana}_${h.horarioInicio}`)
      );

      return {
        id: `vision_${idx}_${matched.id}`,
        selected: true,
        extractedNome: ext.nome,
        matchedCatalogo: matched,
        matchConfidence,
        nome: matched.nome,
        local: ext.local?.trim() || matched.local,
        periodo: matched.periodo,
        cargaHorariaTotal: matched.cargaHorariaTotal,
        regraModo: matched.divisaoDiferente ? 'diferente_por_dia' : 'horas_totais',
        horarios: matched.horarios,
        subturmaNota:
          extraSlots.length > 0
            ? 'Horários práticos ou subturma extras detectados no print; ajuste se necessário.'
            : undefined,
      };
    }

    return {
      id: `vision_${idx}_custom`,
      selected: true,
      extractedNome: ext.nome,
      matchedCatalogo: null,
      matchConfidence: 'manual',
      nome: ext.nome || 'Disciplina',
      local: ext.local || '',
      periodo: ext.periodo || '4',
      cargaHorariaTotal: Number(ext.cargaHorariaTotal) || 64,
      regraModo: ext.divisaoDiferente ? 'diferente_por_dia' : 'horas_totais',
      horarios: extractedHorarios,
    };
  });
}

export function applyCatalogLinkToCandidate(
  candidate: SmartReviewCandidate,
  cat: CatalogoDisciplina | null
): SmartReviewCandidate {
  if (!cat) {
    return {
      ...candidate,
      matchedCatalogo: null,
      matchConfidence: 'manual',
    };
  }
  return {
    ...candidate,
    matchedCatalogo: cat,
    matchConfidence: 'exato',
    nome: cat.nome,
    local: cat.local,
    periodo: cat.periodo,
    cargaHorariaTotal: cat.cargaHorariaTotal,
    regraModo: cat.divisaoDiferente ? 'diferente_por_dia' : 'horas_totais',
    horarios: cat.horarios,
  };
}

export function isStale2026Catalog(docs: CatalogoDisciplina[]): boolean {
  if (!docs || docs.length === 0) return true;
  const isAll2026_2 = docs.every((d) => !d.semestreId || d.semestreId === '2026.2');
  if (!isAll2026_2) return false;
  const ids = new Set(docs.map((d) => d.id));
  return (
    !ids.has('unirio_2026_2_p3_praticas_saude_3_unificada') ||
    !ids.has('unirio_2026_2_p4_anatomia_patologica_1') ||
    !ids.has('unirio_2026_2_p4_diagnostico_imagem_3')
  );
}

