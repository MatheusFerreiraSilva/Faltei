export type PeriodoId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | 'optativa';

export type RegraModo = 'horas_totais' | 'diferente_por_dia' | 'por_encontros';

export type FaltaTipo = 'falta' | 'programada' | 'sem_aula';

export type TurnoAula = 'manha' | 'tarde' | 'noite';

export type FaltaDetalheTipo =
  | 'dia_completo'
  | 'turno_manha'
  | 'turno_tarde'
  | 'turno_noite'
  | 'parcial';

export type RiskLevel = 'SEGURO' | 'ATENÇÃO' | 'CRÍTICO' | 'ESTOURADO';

export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6; // 1=Seg .. 6=Sáb

export interface HorarioAula {
  diaSemana: DiaSemana;
  horarioInicio: string; // "08:00"
  horarioFim: string; // "12:00"
  horas: number; // 4
  local?: string;
  modalidadeTag?: string; // ex: "Teoria" / "Prática" / "Manhã + Tarde"
}

export interface BlocoAula {
  id: string;
  diaSemana: DiaSemana;
  turno: TurnoAula;
  horarioInicio: string; // "08:00"
  horarioFim: string; // "12:00"
  horas: number;
  local: string;
  modalidadeTag?: string;
}

export interface Feriado {
  data: string; // YYYY-MM-DD
  nome: string;
}

export interface SemestreConfig {
  id: string; // "2026.2"
  nome: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  feriados: Feriado[];
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface CatalogoDisciplina {
  id: string;
  semestreId: string;
  nome: string;
  local: string;
  periodo: PeriodoId;
  horarios: HorarioAula[];
  blocosAula?: BlocoAula[];
  divisaoDiferente: boolean;
  cargaHorariaTotal: number;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'student' | 'admin';
  periodoAtual?: PeriodoId;
  percentualPadrao?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserMateria {
  id: string;
  userId: string;
  catalogoId?: string;
  disciplinaKey?: string;
  semestreId: string;
  nome: string;
  local?: string;
  periodo: PeriodoId;
  horarios: HorarioAula[];
  blocosAula?: BlocoAula[];
  regraModo: RegraModo;
  cargaHorariaTotal: number;
  percentualLimite: number; // default 25
  cotaIsoladaPorDia: boolean;
  encontrosTotaisSemestre?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AvisoColetivoTipo =
  | 'sem_aula'
  | 'mudanca_sala'
  | 'aviso'
  | 'prova'
  | 'trabalho'
  | 'trabalho_grupo'
  | 'seminario';

export type UserEventoTipo =
  | 'prova'
  | 'trabalho'
  | 'trabalho_grupo'
  | 'seminario'
  | 'sem_aula';

export interface UserEvento {
  id: string;
  userId: string;
  materiaId?: string;
  disciplinaKey?: string;
  disciplinaNome: string;
  semestreId: string;
  data: string; // YYYY-MM-DD
  tipo: UserEventoTipo;
  titulo: string;
  detalhes?: string;
  grupo?: string;
  horario?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DisciplinaComunidade {
  key: string;
  semestreId: string;
  nome: string;
  catalogoId?: string;
  inscritosCount: number;
  updatedAt?: unknown;
}

export interface SemAulaConsenso {
  id: string;
  disciplinaKey: string;
  disciplinaNome: string;
  semestreId: string;
  data: string; // YYYY-MM-DD
  votosCount: number;
  ultimoAutorNome?: string;
  votedByMe?: boolean;
  updatedAt?: unknown;
}

export interface AvisoColetivo {
  id: string;
  disciplinaKey: string;
  disciplinaNome: string;
  semestreId: string;
  data: string; // YYYY-MM-DD
  tipo: AvisoColetivoTipo;
  mensagem: string;
  autorUid: string;
  autorNome: string;
  isOficial: boolean;
  confirmacoes: number;
  confirmadoPorMim?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserFalta {
  id: string;
  userId: string;
  materiaId: string;
  data: string; // YYYY-MM-DD
  diaSemana: DiaSemana;
  horas: number;
  tipo: FaltaTipo;
  tipoFalta?: FaltaDetalheTipo;
  horasAbatidas?: number;
  blocoId?: string;
  observacao?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SubCotaDia {
  diaSemana: DiaSemana;
  label: string;
  horasPorEncontro: number;
  limiteHoras: number;
  usadasHoras: number;
  programadasHoras: number;
  restantesHoras: number;
  percentualConsumido: number;
}

export interface MateriaStats {
  materia: UserMateria;
  unidade: 'h' | 'encontros';
  limiteTotal: number; // horas ou encontros conforme regra
  consumidoConfirmado: number; // falta ocorrida
  consumidoProgramado: number; // falta programada
  consumidoTotal: number; // falta + programada
  restanteLivre: number; // >= 0 (pode ser negativo se estourado? clamped or raw)
  excedidoPor: number;
  percentualConsumido: number; // 0..100+
  aulasRestantesSemestre: number;
  encontrosRestantesCota: number;
  status: RiskLevel;
  zonaCriticaTerracota: boolean; // >= 75% ou <= 1 encontro
  traducaoHumana: string;
  fraseComica: string;
  subCotasPorDia: SubCotaDia[];
  aulasCanceladasCount: number;
}

export interface SimulacaoItem {
  materia: UserMateria;
  datasAfetadas: { data: string; diaSemana: DiaSemana; horas: number }[];
  horasSimuladas: number;
  encontrosSimulados: number;
  antes: MateriaStats;
  depois: MateriaStats;
}

export interface SimulacaoResultado {
  startDate: string;
  endDate: string;
  diasUteisSelecionados: string[];
  feriadosNoPeriodo: Feriado[];
  itens: SimulacaoItem[];
  vereditoTitulo: string;
  vereditoTexto: string;
  vereditoRisco: 'ok' | 'atencao' | 'perigo';
  totalFaltasAGerar: number;
}

export interface CatalogDiffItem {
  status: 'added' | 'updated' | 'removed' | 'unchanged';
  id: string;
  nome: string;
  periodo: PeriodoId;
  before?: CatalogoDisciplina;
  after?: CatalogoDisciplina;
}

