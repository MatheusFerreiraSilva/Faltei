import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Camera,
  Cloud,
  FileUp,
  Layers,
  Link2,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  CatalogoDisciplina,
  DiaSemana,
  DisciplinaComunidade,
  HorarioAula,
  PeriodoId,
  RegraModo,
  SemestreConfig,
  UserMateria,
  UserProfile,
} from '../types/domain';
import {
  DIA_SEMANA_LABELS,
  getPeriodoStyle,
} from '../utils/attendance';
import {
  applyCatalogLinkToCandidate,
  ExtractedScheduleDiscipline,
  matchExtractedToCatalogo,
  SmartReviewCandidate,
} from '../utils/catalogMatcher';
import {
  getEnrolledCountForMateria,
  resolveDisciplinaKey,
  slugifyDisciplinaNome,
} from '../utils/disciplinaKey';
import { PWAInstallButton } from './PWAInstallButton';

const AdminCatalogPanel = React.lazy(() => import('./AdminCatalogPanel'));

interface TabGradeProps {
  isAdmin: boolean;
  isPreviewMode: boolean;
  userProfile: UserProfile | null;
  semestreConfig: SemestreConfig;
  catalogo: CatalogoDisciplina[];
  materias: UserMateria[];
  comunidadeMap: Record<string, DisciplinaComunidade>;
  onImportPeriodo: (periodo: PeriodoId) => Promise<number>;
  onAddMateria: (
    input: Omit<UserMateria, 'id' | 'userId' | 'semestreId' | 'createdAt' | 'updatedAt'>
  ) => Promise<UserMateria>;
  onDeleteMateria: (materiaId: string) => Promise<void>;
  onSelectMateria?: (materiaId: string) => void;
  onOpenConfig: () => void;
  onOpenGradeSemanal?: () => void;
  onUpdateSemestreConfig: (config: SemestreConfig) => Promise<void>;
  onPublishCatalogUpdate: (
    nextSemestre: SemestreConfig,
    nextDisciplinas: CatalogoDisciplina[]
  ) => Promise<void>;
}

const PERIODOS: PeriodoId[] = ['1', '2', '3', '4', '5', '6', '7', '8', 'optativa'];
const DIAS_OPCOES: DiaSemana[] = [1, 2, 3, 4, 5, 6];

export const TabGrade: React.FC<TabGradeProps> = ({
  isAdmin,
  isPreviewMode,
  userProfile,
  semestreConfig,
  catalogo,
  materias,
  comunidadeMap,
  onImportPeriodo,
  onAddMateria,
  onDeleteMateria,
  onSelectMateria,
  onOpenConfig,
  onOpenGradeSemanal,
  onUpdateSemestreConfig,
  onPublishCatalogUpdate,
}) => {
  // Importar Período
  const [selectedPeriodoImport, setSelectedPeriodoImport] = useState<PeriodoId>(
    userProfile?.periodoAtual || '1'
  );
  const touchedPeriodoRef = useRef(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Adicionar Aula Individualmente (3 passos)
  const [showAddForm, setShowAddForm] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nome, setNome] = useState('');
  const [local, setLocal] = useState('');
  const [periodo, setPeriodo] = useState<PeriodoId>(userProfile?.periodoAtual || '4');
  const [horarios, setHorarios] = useState<HorarioAula[]>([
    { diaSemana: 1, horarioInicio: '08:00', horarioFim: '12:00', horas: 4 },
  ]);
  const [regraModo, setRegraModo] = useState<RegraModo>('horas_totais');
  const [cargaTotal, setCargaTotal] = useState<number>(64);
  const [pctLimite, setPctLimite] = useState<number>(userProfile?.percentualPadrao ?? 25);
  const touchedPctRef = useRef(false);
  const [cotaIsoladaPorDia, setCotaIsoladaPorDia] = useState<boolean>(false);
  const [encontrosTotais, setEncontrosTotais] = useState<number>(30);
  const [savingMateria, setSavingMateria] = useState(false);

  // Leitura Inteligente do Print (Gemini Vision + Cruzamento Catálogo Oficial)
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionFeedback, setVisionFeedback] = useState<string | null>(null);
  const [visionCandidates, setVisionCandidates] = useState<SmartReviewCandidate[]>([]);

  useEffect(() => {
    if (!touchedPeriodoRef.current && userProfile?.periodoAtual) {
      setSelectedPeriodoImport(userProfile.periodoAtual);
      setPeriodo(userProfile.periodoAtual);
    }
  }, [userProfile?.periodoAtual]);

  useEffect(() => {
    if (!touchedPctRef.current && userProfile?.percentualPadrao) {
      setPctLimite(userProfile.percentualPadrao);
    }
  }, [userProfile?.percentualPadrao]);

  const previewStyle = getPeriodoStyle(periodo);

  const catalogoFiltrado = useMemo(
    () => catalogo.filter((d) => d.periodo === selectedPeriodoImport),
    [catalogo, selectedPeriodoImport]
  );

  const catalogoSortedForSelect = useMemo(
    () => [...catalogo].sort((a, b) => a.periodo.localeCompare(b.periodo) || a.nome.localeCompare(b.nome)),
    [catalogo]
  );

  const handleImportPeriodoClick = async () => {
    setImporting(true);
    setImportFeedback(null);
    try {
      const count = await onImportPeriodo(selectedPeriodoImport);
      setImportFeedback(
        count > 0
          ? `${count} matéria(s) do ${getPeriodoStyle(selectedPeriodoImport).label} adicionada(s) à sua grade.`
          : 'Todas as matérias desse período já estão na sua grade.'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleImportSingleCatalogo = async (cat: CatalogoDisciplina) => {
    await onAddMateria({
      catalogoId: cat.id,
      disciplinaKey: cat.id,
      nome: cat.nome,
      local: cat.local,
      periodo: cat.periodo,
      horarios: cat.horarios,
      blocosAula: cat.blocosAula,
      regraModo: cat.divisaoDiferente ? 'diferente_por_dia' : 'horas_totais',
      cargaHorariaTotal: cat.cargaHorariaTotal,
      percentualLimite: userProfile?.percentualPadrao ?? 25,
      cotaIsoladaPorDia: false,
    });
  };

  const handleAddHorarioRow = () => {
    if (horarios.length >= 6) return;
    setHorarios((prev) => [
      ...prev,
      { diaSemana: 3, horarioInicio: '13:00', horarioFim: '15:00', horas: 2 },
    ]);
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || horarios.length === 0) return;
    setSavingMateria(true);
    try {
      await onAddMateria({
        disciplinaKey: slugifyDisciplinaNome(nome.trim()),
        nome: nome.trim(),
        local: local.trim(),
        periodo,
        horarios,
        regraModo,
        cargaHorariaTotal: cargaTotal,
        percentualLimite: pctLimite,
        cotaIsoladaPorDia,
        encontrosTotaisSemestre: encontrosTotais,
      });
      setNome('');
      setLocal('');
      setShowAddForm(false);
      setStep(1);
    } finally {
      setSavingMateria(false);
    }
  };

  const handleVisionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVisionError(null);
    setVisionFeedback(null);
    setVisionLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Faça login com sua conta para usar a leitura inteligente de print.');
      }

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/gemini/parse-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao analisar print da grade.');
      }

      const rawList: ExtractedScheduleDiscipline[] = Array.isArray(json.disciplinas)
        ? json.disciplinas.map((d: Record<string, unknown>) => ({
            nome: String(d.nome || 'Disciplina'),
            codigo: d.codigo ? String(d.codigo) : undefined,
            local: String(d.local || ''),
            periodo: (d.periodo as PeriodoId) || '4',
            cargaHorariaTotal: Number(d.cargaHorariaTotal) || 64,
            divisaoDiferente: Boolean(d.divisaoDiferente),
            horarios:
              Array.isArray(d.horarios) && d.horarios.length > 0
                ? (d.horarios as HorarioAula[])
                : [{ diaSemana: 1, horarioInicio: '08:00', horarioFim: '10:00', horas: 2 }],
          }))
        : [];

      const matched = matchExtractedToCatalogo(rawList, catalogo);
      setVisionCandidates(matched);
      if (matched.length === 0) {
        setVisionError('Nenhuma disciplina legível encontrada nesse print. Tente um recorte mais nítido.');
      }
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
    } finally {
      setVisionLoading(false);
      e.target.value = '';
    }
  };

  const handleSwapCandidateCatalog = (candidateId: string, catalogoId: string) => {
    const found = catalogo.find((c) => c.id === catalogoId) || null;
    setVisionCandidates((prev) =>
      prev.map((cand) =>
        cand.id === candidateId ? applyCatalogLinkToCandidate(cand, found) : cand
      )
    );
  };

  const handleUpdateCandidateHorario = (
    candidateId: string,
    slotIdx: number,
    patch: Partial<HorarioAula>
  ) => {
    setVisionCandidates((prev) =>
      prev.map((cand) =>
        cand.id === candidateId
          ? {
              ...cand,
              horarios: cand.horarios.map((h, i) => (i === slotIdx ? { ...h, ...patch } : h)),
            }
          : cand
      )
    );
  };

  const handleImportVisionCandidates = async () => {
    const selected = visionCandidates.filter((c) => c.selected);
    let addedCount = 0;
    for (const item of selected) {
      if (materias.some((m) => (item.matchedCatalogo && m.catalogoId === item.matchedCatalogo.id) || m.nome === item.nome)) {
        continue;
      }
      await onAddMateria({
        ...(item.matchedCatalogo ? { catalogoId: item.matchedCatalogo.id } : {}),
        disciplinaKey: item.matchedCatalogo
          ? item.matchedCatalogo.id
          : slugifyDisciplinaNome(item.nome),
        nome: item.nome,
        local: item.local,
        periodo: item.periodo,
        horarios: item.horarios,
        regraModo: item.regraModo,
        cargaHorariaTotal: item.cargaHorariaTotal,
        percentualLimite: userProfile?.percentualPadrao ?? 25,
        cotaIsoladaPorDia: false,
      });
      addedCount += 1;
    }
    setVisionCandidates([]);
    setVisionFeedback(
      addedCount > 0
        ? `${addedCount} matéria(s) importada(s) com sucesso para sua grade!`
        : 'As matérias selecionadas já estavam na sua grade.'
    );
  };

  return (
    <div className="space-y-4">
      {/* Header + PWA Install Card on mobile */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#0E1A59] leading-tight">
            Montar grade e regras
          </h1>
          <p className="text-xs font-semibold text-[#475569] font-mono tabular-nums">
            Catálogo ativo: {semestreConfig.nome} ({catalogo.length} disciplinas)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenGradeSemanal && (
            <button
              type="button"
              onClick={onOpenGradeSemanal}
              className="min-h-[40px] px-3.5 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <CalendarClock className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
              <span>Ver Grade Semanal</span>
            </button>
          )}
          <div className="sm:hidden">
            <PWAInstallButton variant="compact" />
          </div>
        </div>
      </div>

      {/* Bento 0: Configurações de Conta, Nome & Preferências */}
      <section className="bento-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#E6E9F0] text-[#0E1A59] flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm font-extrabold text-[#0E1A59]">
                {userProfile?.displayName || 'Estudante'}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isPreviewMode
                    ? 'bg-[#FEF3C7] text-[#B45309]'
                    : 'bg-[#DCFCE7] text-[#15803D]'
                }`}
              >
                {isPreviewMode ? 'Preview local' : 'Sincronizado'}
              </span>
            </div>
            <p className="text-xs font-semibold text-[#475569] truncate">
              {userProfile?.email || 'Entre com e-mail para sincronizar em outros aparelhos'} ·
              Limite padrão{' '}
              <span className="font-mono tabular-nums font-bold text-[#0E1A59]">
                {userProfile?.percentualPadrao ?? 25}%
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenConfig}
          className="min-h-[40px] px-3.5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Settings className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Configurar nome e sincronia</span>
        </button>
      </section>

      {/* Bento 1: Importar Período Completo + Ler Print Inteligente */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 bento-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0E1A59]" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-[#0E1A59]">
              Importar Período Completo ({semestreConfig.id})
            </h2>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => {
              const st = getPeriodoStyle(p);
              const active = selectedPeriodoImport === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    touchedPeriodoRef.current = true;
                    setSelectedPeriodoImport(p);
                    setImportFeedback(null);
                  }}
                  style={
                    active
                      ? { backgroundColor: st.borderColor, color: '#FFFFFF', borderColor: st.borderColor }
                      : { backgroundColor: st.badgeBg, color: st.badgeText, borderColor: st.badgeBg }
                  }
                  className="min-h-[38px] px-3 py-1 rounded-full text-[11px] font-extrabold border-[1.5px] transition-all whitespace-nowrap"
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs font-semibold text-[#475569]">
              {catalogoFiltrado.length} disciplina(s) neste grupo
            </p>
            <button
              type="button"
              disabled={importing || catalogoFiltrado.length === 0}
              onClick={handleImportPeriodoClick}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] active:scale-95 transition-all whitespace-nowrap"
            >
              {importing
                ? 'Importando...'
                : `Importar ${getPeriodoStyle(selectedPeriodoImport).label}`}
            </button>
          </div>

          {importFeedback && (
            <p className="text-xs font-bold text-[#15803D] bg-[#DCFCE7] rounded-xl p-3">
              {importFeedback}
            </p>
          )}

          {/* Lista rápida */}
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 border-t-[1.5px] border-[#CBD5E1] pt-3">
            {catalogoFiltrado.map((cat) => {
              const jaNaGrade = materias.some(
                (m) => m.catalogoId === cat.id || m.nome === cat.nome
              );
              const st = getPeriodoStyle(cat.periodo);
              return (
                <div
                  key={cat.id}
                  style={{ borderLeftColor: st.borderColor }}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] border-l-4 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-[#0E1A59] truncate">{cat.nome}</p>
                    <p className="text-[11px] text-[#475569] font-mono tabular-nums truncate">
                      {cat.horarios
                        .map((h) => `${DIA_SEMANA_LABELS[h.diaSemana].short} ${h.horarioInicio}–${h.horarioFim}`)
                        .join(' · ')}{' '}
                      · {cat.cargaHorariaTotal}h
                      {cat.divisaoDiferente ? ' · Dif/Dia' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={jaNaGrade}
                    onClick={() => handleImportSingleCatalogo(cat)}
                    className={`min-h-[34px] px-3 rounded-lg text-[11px] font-extrabold shrink-0 whitespace-nowrap ${
                      jaNaGrade
                        ? 'bg-[#E6E9F0] text-[#475569] border border-[#CBD5E1]'
                        : 'bg-[#0E1A59] text-white hover:bg-[#14267D]'
                    }`}
                  >
                    {jaNaGrade ? 'Na grade' : 'Adicionar'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Ler Print da Grade (Importação Inteligente Cruzada com 2026.2) */}
        <section className="lg:col-span-5 bento-card p-5 sm:p-6 flex flex-col gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
                <h2 className="text-base font-extrabold text-[#0E1A59]">Ler Print da Grade</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#FCE7F3] text-[#BE185D] text-[10px] font-extrabold inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                Cruzamento 2026.2
              </span>
            </div>
            <p className="text-xs text-[#475569] leading-relaxed">
              Envie um print do Portal do Aluno da UNIRIO. Cruzamos automaticamente cada matéria com
              o catálogo oficial 2026.2 (período, carga horária exata e regra por dia).
            </p>
          </div>

          <label className="flex-1 min-h-[150px] rounded-2xl border-[1.5px] border-dashed border-[#0E1A59]/35 bg-[#E6E9F0]/50 hover:bg-[#E6E9F0] flex flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs font-extrabold text-[#0E1A59] cursor-pointer transition-colors">
            <FileUp className="w-5 h-5 text-[#0E1A59]" aria-hidden="true" />
            <span>{visionLoading ? 'Lendo e cruzando com catálogo 2026.2...' : 'Selecionar print do Portal do Aluno'}</span>
            <span className="text-[11px] font-semibold text-[#475569]">
              PNG, JPG ou WEBP · Revisão inteligente antes de salvar
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleVisionUpload}
              disabled={visionLoading}
              className="sr-only"
            />
          </label>

          {visionError && (
            <p role="alert" className="text-xs font-bold text-[#EC1580] bg-[#FCE7F3] rounded-xl p-3">
              {visionError}
            </p>
          )}

          {visionFeedback && (
            <p className="text-xs font-bold text-[#15803D] bg-[#DCFCE7] rounded-xl p-3">
              {visionFeedback}
            </p>
          )}
        </section>
      </div>

      {/* Tela de Revisão Inteligente (quando print for lido) */}
      {visionCandidates.length > 0 && (
        <section className="bento-card p-5 sm:p-6 space-y-4 border-[#0E1A59]/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#0E1A59] flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#EC1580]" aria-hidden="true" />
                Revisão Inteligente ({visionCandidates.length} matéria(s) detectada(s))
              </h2>
              <p className="text-xs font-semibold text-[#475569]">
                Confira o vínculo com o catálogo 2026.2 e ajuste horários de subturma prática se
                precisar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisionCandidates([])}
                className="min-h-[40px] px-3.5 rounded-xl border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#475569]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportVisionCandidates}
                className="min-h-[40px] px-4 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170]"
              >
                Importar selecionadas ({visionCandidates.filter((c) => c.selected).length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visionCandidates.map((cand) => {
              const pStyle = getPeriodoStyle(cand.periodo);
              return (
                <div
                  key={cand.id}
                  style={{ borderLeftColor: pStyle.borderColor }}
                  className="rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] border-l-4 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-start gap-2.5 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={cand.selected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setVisionCandidates((prev) =>
                            prev.map((c) => (c.id === cand.id ? { ...c, selected: checked } : c))
                          );
                        }}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            style={{ backgroundColor: pStyle.badgeBg, color: pStyle.badgeText }}
                            className="px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                          >
                            {pStyle.label}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              cand.matchConfidence === 'exato'
                                ? 'bg-[#DCFCE7] text-[#15803D]'
                                : cand.matchConfidence === 'aproximado'
                                ? 'bg-[#FEF3C7] text-[#B45309]'
                                : 'bg-[#E6E9F0] text-[#475569]'
                            }`}
                          >
                            {cand.matchConfidence === 'exato'
                              ? 'Catálogo 2026.2'
                              : cand.matchConfidence === 'aproximado'
                              ? 'Vínculo aproximado'
                              : 'Personalizada'}
                          </span>
                        </div>
                        <p className="text-sm font-extrabold text-[#0E1A59] leading-snug">
                          {cand.nome}
                        </p>
                        <p className="text-[11px] text-[#475569] truncate">
                          Lido do print: “{cand.extractedNome}”
                        </p>
                      </div>
                    </label>

                    <span className="font-mono tabular-nums text-xs font-extrabold text-[#0E1A59] whitespace-nowrap">
                      {cand.cargaHorariaTotal}h
                    </span>
                  </div>

                  {/* Trocar vínculo com catálogo oficial */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#475569] mb-1">
                      Vínculo com o catálogo oficial 2026.2
                    </label>
                    <select
                      value={cand.matchedCatalogo?.id || ''}
                      onChange={(e) => handleSwapCandidateCatalog(cand.id, e.target.value)}
                      className="w-full min-h-[38px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-bold text-[#0E1A59]"
                    >
                      <option value="">Sem vínculo (usar dados lidos do print)</option>
                      {catalogoSortedForSelect.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          [{getPeriodoStyle(cat.periodo).shortLabel}] {cat.nome} ({cat.cargaHorariaTotal}h)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-[#475569]">
                    <span className="px-2 py-0.5 rounded-lg bg-[#E6E9F0] text-[#0E1A59] font-bold">
                      {cand.regraModo === 'diferente_por_dia'
                        ? 'Regra: Diferente por Dia'
                        : 'Regra: Horas Totais'}
                    </span>
                    {cand.subturmaNota && (
                      <span className="text-[#BE185D] font-sans font-bold">
                        {cand.subturmaNota}
                      </span>
                    )}
                  </div>

                  {/* Ajustar subturma / horários */}
                  <div className="space-y-1.5 pt-1 border-t border-[#CBD5E1]">
                    {cand.horarios.map((h, slotIdx) => (
                      <div key={slotIdx} className="grid grid-cols-4 gap-1.5 items-center text-xs">
                        <select
                          aria-label={`Dia da semana aula ${slotIdx + 1}`}
                          value={h.diaSemana}
                          onChange={(e) =>
                            handleUpdateCandidateHorario(cand.id, slotIdx, {
                              diaSemana: Number(e.target.value) as DiaSemana,
                            })
                          }
                          className="min-h-[34px] rounded-lg border border-[#CBD5E1] bg-white px-1.5 text-[11px] font-bold"
                        >
                          {DIAS_OPCOES.map((d) => (
                            <option key={d} value={d}>
                              {DIA_SEMANA_LABELS[d].short}
                            </option>
                          ))}
                        </select>
                        <input
                          type="time"
                          aria-label="Início"
                          value={h.horarioInicio}
                          onChange={(e) =>
                            handleUpdateCandidateHorario(cand.id, slotIdx, {
                              horarioInicio: e.target.value,
                            })
                          }
                          className="min-h-[34px] rounded-lg border border-[#CBD5E1] px-1.5 text-[11px] font-mono"
                        />
                        <input
                          type="time"
                          aria-label="Fim"
                          value={h.horarioFim}
                          onChange={(e) =>
                            handleUpdateCandidateHorario(cand.id, slotIdx, {
                              horarioFim: e.target.value,
                            })
                          }
                          className="min-h-[34px] rounded-lg border border-[#CBD5E1] px-1.5 text-[11px] font-mono"
                        />
                        <input
                          type="number"
                          aria-label="Horas"
                          min={0.5}
                          max={12}
                          step={0.5}
                          value={h.horas}
                          onChange={(e) =>
                            handleUpdateCandidateHorario(cand.id, slotIdx, {
                              horas: Number(e.target.value),
                            })
                          }
                          className="min-h-[34px] rounded-lg border border-[#CBD5E1] px-1.5 text-[11px] font-mono tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bento 2: + Adicionar Aula Individualmente (3 passos) */}
      <section className="bento-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#0E1A59]">
              Adicionar Aula Individualmente
            </h2>
            <p className="text-xs font-semibold text-[#475569]">
              Configure nome, período, horários semanais e escolha entre os 3 modos de cálculo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold inline-flex items-center gap-1.5 hover:bg-[#14267D] active:scale-95 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showAddForm ? 'Fechar formulário' : 'Adicionar Aula Individualmente'}</span>
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmitManual} className="space-y-5 pt-3 border-t-[1.5px] border-[#CBD5E1]">
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[#E6E9F0] border border-[#CBD5E1]">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStep(n as 1 | 2 | 3)}
                  className={`min-h-[38px] rounded-lg text-xs font-extrabold transition-colors ${
                    step === n ? 'bg-white text-[#0E1A59] shadow-sm' : 'text-[#475569]'
                  }`}
                >
                  {n === 1 && '1. Identidade'}
                  {n === 2 && '2. Horários'}
                  {n === 3 && '3. Regra de Falta'}
                </button>
              ))}
            </div>

            {step === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-7 space-y-3">
                  <div>
                    <label htmlFor="manual-nome" className="block text-xs font-bold text-[#475569] mb-1">
                      Nome da matéria
                    </label>
                    <input
                      id="manual-nome"
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex.: Farmacologia Clínica"
                      className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3.5 text-sm font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="manual-local" className="block text-xs font-bold text-[#475569] mb-1">
                        Local / Anfiteatro
                      </label>
                      <input
                        id="manual-local"
                        type="text"
                        value={local}
                        onChange={(e) => setLocal(e.target.value)}
                        placeholder="Ex.: HUGG 4º andar"
                        className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3.5 text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-periodo" className="block text-xs font-bold text-[#475569] mb-1">
                        Período / Optativa
                      </label>
                      <select
                        id="manual-periodo"
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value as PeriodoId)}
                        className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3.5 text-sm font-bold text-[#0E1A59]"
                      >
                        {PERIODOS.map((p) => (
                          <option key={p} value={p}>
                            {getPeriodoStyle(p).label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Live card color preview */}
                <div
                  style={{ borderLeftColor: previewStyle.borderColor }}
                  className="md:col-span-5 rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] border-l-4 p-4 space-y-2"
                >
                  <span className="text-[11px] font-bold text-[#475569]">Prévia do card</span>
                  <div>
                    <span
                      style={{ backgroundColor: previewStyle.badgeBg, color: previewStyle.badgeText }}
                      className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold"
                    >
                      {previewStyle.label}
                    </span>
                  </div>
                  <p className="text-[15px] font-extrabold text-[#0E1A59] line-clamp-2">
                    {nome.trim() || 'Nome da disciplina'}
                  </p>
                  <p className="text-xs text-[#475569]">{local.trim() || 'Local da aula'}</p>
                  {nome.trim() && (
                    <div className="pt-2 border-t border-[#CBD5E1] space-y-0.5">
                      <p className="text-[11px] font-mono tabular-nums font-bold text-[#0E1A59]">
                        Chave coletiva: {slugifyDisciplinaNome(nome)}
                      </p>
                      <p className="text-[10px] text-[#475569]">
                        Alunos que digitarem o mesmo nome entram na contagem de inscritos e recebem avisos coletivos.
                      </p>
                    </div>
                  )}
                </div>

                <div className="md:col-span-12 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="min-h-[42px] px-5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold"
                  >
                    Próximo: Horários
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {horarios.map((h, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-2xl bg-[#E6E9F0]/50 border border-[#CBD5E1] p-3 items-end"
                  >
                    <div>
                      <label className="block text-[11px] font-bold text-[#475569] mb-1">Dia</label>
                      <select
                        value={h.diaSemana}
                        onChange={(e) => {
                          const val = Number(e.target.value) as DiaSemana;
                          setHorarios((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, diaSemana: val } : item))
                          );
                        }}
                        className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-bold"
                      >
                        {DIAS_OPCOES.map((d) => (
                          <option key={d} value={d}>
                            {DIA_SEMANA_LABELS[d].full}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#475569] mb-1">Início</label>
                      <input
                        type="time"
                        value={h.horarioInicio}
                        onChange={(e) =>
                          setHorarios((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, horarioInicio: e.target.value } : item
                            )
                          )
                        }
                        className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#475569] mb-1">Fim</label>
                      <input
                        type="time"
                        value={h.horarioFim}
                        onChange={(e) =>
                          setHorarios((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, horarioFim: e.target.value } : item
                            )
                          )
                        }
                        className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#475569] mb-1">Carga (h)</label>
                      <input
                        type="number"
                        min={0.5}
                        max={12}
                        step={0.5}
                        value={h.horas}
                        onChange={(e) =>
                          setHorarios((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, horas: Number(e.target.value) } : item
                            )
                          )
                        }
                        className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-2.5 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      {horarios.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setHorarios((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remover horário"
                          className="w-full min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white text-xs text-[#EC1580] font-extrabold"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleAddHorarioRow}
                    className="min-h-[40px] px-3.5 rounded-xl border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59]"
                  >
                    + Outro dia da semana
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="min-h-[42px] px-5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold"
                  >
                    Próximo: Regra de Falta
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'horas_totais' as RegraModo,
                      title: 'Modo 1 — Horas Totais',
                      desc: 'Define CH total e % limite. Desconta as horas exatas da aula perdida.',
                    },
                    {
                      id: 'diferente_por_dia' as RegraModo,
                      title: 'Modo 2 — Diferente por Dia',
                      desc: 'Cargas diferentes por dia da semana, com opção de cota unificada ou isolada.',
                    },
                    {
                      id: 'por_encontros' as RegraModo,
                      title: 'Modo 3 — % de Encontros',
                      desc: 'Calcula pelo nº de dias de aula no semestre, ignorando horas.',
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRegraModo(m.id)}
                      className={`rounded-2xl border-[1.5px] p-4 text-left transition-all ${
                        regraModo === m.id
                          ? 'border-[#0E1A59] bg-[#E6E9F0]/60'
                          : 'border-[#CBD5E1] bg-white'
                      }`}
                    >
                      <p className="text-xs font-extrabold text-[#0E1A59]">{m.title}</p>
                      <p className="text-[11px] text-[#475569] mt-1 leading-relaxed">{m.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {regraModo === 'por_encontros' ? (
                    <div>
                      <label htmlFor="manual-enc" className="block text-xs font-bold text-[#475569] mb-1">
                        Total de encontros no semestre
                      </label>
                      <input
                        id="manual-enc"
                        type="number"
                        min={1}
                        max={400}
                        value={encontrosTotais}
                        onChange={(e) => setEncontrosTotais(Number(e.target.value))}
                        className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3.5 text-sm font-mono tabular-nums"
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="manual-ch" className="block text-xs font-bold text-[#475569] mb-1">
                        Carga horária total (h)
                      </label>
                      <input
                        id="manual-ch"
                        type="number"
                        min={1}
                        max={1000}
                        value={cargaTotal}
                        onChange={(e) => setCargaTotal(Number(e.target.value))}
                        className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3.5 text-sm font-mono tabular-nums"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="manual-pct" className="block text-xs font-bold text-[#475569] mb-1">
                      Percentual limite de faltas (%)
                    </label>
                    <input
                      id="manual-pct"
                      type="number"
                      min={1}
                      max={99}
                      value={pctLimite}
                      onChange={(e) => {
                        touchedPctRef.current = true;
                        setPctLimite(Number(e.target.value));
                      }}
                      className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3.5 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>

                {regraModo === 'diferente_por_dia' && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#0E1A59] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cotaIsoladaPorDia}
                      onChange={(e) => setCotaIsoladaPorDia(e.target.checked)}
                    />
                    <span>
                      Cota isolada por dia/modalidade (ex.: reprovar separado na prática e na teoria)
                    </span>
                  </label>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingMateria || !nome.trim()}
                    className="min-h-[44px] px-6 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] disabled:opacity-60"
                  >
                    {savingMateria ? 'Salvando...' : 'Salvar disciplina na grade'}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </section>

      {/* Bento 3: Disciplinas Atuais da Grade */}
      {materias.length > 0 && (
        <section className="bento-card p-5 sm:p-6 space-y-3">
          <h2 className="text-base font-extrabold text-[#0E1A59]">
            Suas disciplinas cadastradas ({materias.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {materias.map((m) => {
              const st = getPeriodoStyle(m.periodo);
              const inscritos = getEnrolledCountForMateria(m, comunidadeMap);
              const key = resolveDisciplinaKey(m);
              return (
                <div
                  key={m.id}
                  style={{ borderLeftColor: st.borderColor }}
                  className="rounded-2xl bg-white border-[1.5px] border-[#CBD5E1] border-l-4 p-3.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        style={{ backgroundColor: st.badgeBg, color: st.badgeText }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap"
                      >
                        {st.shortLabel}
                      </span>
                      <p className="text-xs font-extrabold text-[#0E1A59] truncate">{m.nome}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#475569] font-mono tabular-nums">
                      <span>
                        {m.cargaHorariaTotal}h · {m.regraModo}
                      </span>
                      {inscritos > 0 && (
                        <span className="inline-flex items-center gap-1 text-[#0E1A59] font-bold">
                          <Users className="w-3 h-3" aria-hidden="true" />
                          {inscritos}
                        </span>
                      )}
                      {!m.catalogoId && (
                        <span className="px-1.5 py-0.5 rounded bg-[#E6E9F0] text-[#0E1A59] text-[10px]">
                          {key}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onSelectMateria && (
                      <button
                        type="button"
                        onClick={() => onSelectMateria(m.id)}
                        aria-label={`Editar ${m.nome}`}
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] flex items-center justify-center text-[#0E1A59] hover:border-[#0E1A59]"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteMateria(m.id)}
                      aria-label={`Remover ${m.nome}`}
                      className="min-h-[38px] min-w-[38px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] flex items-center justify-center text-[#475569] hover:text-[#EC1580] hover:border-[#EC1580]/50"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bento 4: Área Admin Lazy (Exclusivo mat.ben.henrique@gmail.com) */}
      {isAdmin && (
        <Suspense
          fallback={
            <div className="bento-card p-6 text-xs font-semibold text-[#475569]">
              Carregando painel administrativo...
            </div>
          }
        >
          <AdminCatalogPanel
            semestreConfig={semestreConfig}
            catalogo={catalogo}
            onUpdateSemestreConfig={onUpdateSemestreConfig}
            onPublishCatalogUpdate={onPublishCatalogUpdate}
          />
        </Suspense>
      )}
    </div>
  );
};
