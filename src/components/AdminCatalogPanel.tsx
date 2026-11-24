import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileUp, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/firebase';
import { CatalogDiffItem, CatalogoDisciplina, SemestreConfig } from '../types/domain';
import { diffCatalogs, formatDatePtBr } from '../utils/attendance';

interface AdminCatalogPanelProps {
  semestreConfig: SemestreConfig;
  catalogo: CatalogoDisciplina[];
  onUpdateSemestreConfig: (config: SemestreConfig) => Promise<void>;
  onPublishCatalogUpdate: (
    nextSemestre: SemestreConfig,
    nextDisciplinas: CatalogoDisciplina[]
  ) => Promise<void>;
}

export const AdminCatalogPanel: React.FC<AdminCatalogPanelProps> = ({
  semestreConfig,
  catalogo,
  onUpdateSemestreConfig,
  onPublishCatalogUpdate,
}) => {
  const [adminInicio, setAdminInicio] = useState(semestreConfig.dataInicio);
  const [adminFim, setAdminFim] = useState(semestreConfig.dataFim);
  const [novoFeriadoData, setNovoFeriadoData] = useState('');
  const [novoFeriadoNome, setNovoFeriadoNome] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminStatusMsg, setAdminStatusMsg] = useState<string | null>(null);

  const [semestreHint, setSemestreHint] = useState('2027.1');
  const [catalogText, setCatalogText] = useState('');
  const [parsingCatalog, setParsingCatalog] = useState(false);
  const [parseCatalogError, setParseCatalogError] = useState<string | null>(null);
  const [extractedPayload, setExtractedPayload] = useState<{
    semestre: SemestreConfig;
    disciplinas: CatalogoDisciplina[];
  } | null>(null);

  useEffect(() => {
    setAdminInicio(semestreConfig.dataInicio);
    setAdminFim(semestreConfig.dataFim);
  }, [semestreConfig.dataFim, semestreConfig.dataInicio]);

  const diffPreview: CatalogDiffItem[] = useMemo(() => {
    if (!extractedPayload) return [];
    return diffCatalogs(catalogo, extractedPayload.disciplinas);
  }, [catalogo, extractedPayload]);

  const handleAdminSaveDates = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSaving(true);
    setAdminStatusMsg(null);
    try {
      await onUpdateSemestreConfig({
        ...semestreConfig,
        dataInicio: adminInicio,
        dataFim: adminFim,
      });
      setAdminStatusMsg('Datas do semestre atualizadas no Firestore.');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleAddFeriado = async () => {
    if (!novoFeriadoData || !novoFeriadoNome.trim()) return;
    setAdminSaving(true);
    try {
      const nextFeriados = [
        ...semestreConfig.feriados.filter((f) => f.data !== novoFeriadoData),
        { data: novoFeriadoData, nome: novoFeriadoNome.trim() },
      ].sort((a, b) => a.data.localeCompare(b.data));
      await onUpdateSemestreConfig({ ...semestreConfig, feriados: nextFeriados });
      setNovoFeriadoData('');
      setNovoFeriadoNome('');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleRemoveFeriado = async (dataStr: string) => {
    setAdminSaving(true);
    try {
      await onUpdateSemestreConfig({
        ...semestreConfig,
        feriados: semestreConfig.feriados.filter((f) => f.data !== dataStr),
      });
    } finally {
      setAdminSaving(false);
    }
  };

  const handleCatalogFileUpload = async (file?: File) => {
    setParseCatalogError(null);
    setParsingCatalog(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Autenticação obrigatória para processar documentos com IA.');
      }

      let fileBase64: string | undefined;
      let mimeType: string | undefined;

      if (file) {
        mimeType = file.type || 'text/plain';
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Falha ao ler o documento selecionado.'));
          reader.readAsDataURL(file);
        });
      }

      const res = await fetch('/api/gemini/parse-catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fileBase64,
          mimeType,
          textContent: catalogText,
          semestreHint,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Falha ao extrair novo catálogo.');
      }
      const nextSem: SemestreConfig = {
        id: json.semestre?.id || semestreHint || '2027.1',
        nome: json.semestre?.nome || `${semestreHint} — Medicina UNIRIO`,
        dataInicio: json.semestre?.dataInicio || '2027-03-01',
        dataFim: json.semestre?.dataFim || '2027-07-10',
        feriados: Array.isArray(json.semestre?.feriados) ? json.semestre.feriados : [],
      };
      const nextDiscs: CatalogoDisciplina[] = (
        Array.isArray(json.disciplinas) ? json.disciplinas : []
      ).map((d: CatalogoDisciplina) => ({
        ...d,
        semestreId: nextSem.id,
      }));
      setExtractedPayload({ semestre: nextSem, disciplinas: nextDiscs });
    } catch (err) {
      setParseCatalogError(err instanceof Error ? err.message : 'Erro ao analisar documento.');
    } finally {
      setParsingCatalog(false);
    }
  };

  const handlePublishExtracted = async () => {
    if (!extractedPayload) return;
    setAdminSaving(true);
    try {
      await onPublishCatalogUpdate(extractedPayload.semestre, extractedPayload.disciplinas);
      setAdminStatusMsg(
        `Semestre ${extractedPayload.semestre.id} (${extractedPayload.disciplinas.length} disciplinas) publicado globalmente!`
      );
      setExtractedPayload(null);
      setCatalogText('');
    } finally {
      setAdminSaving(false);
    }
  };

  return (
    <section className="bento-card p-6 space-y-6 border-[#0E1A59]/35">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#EC1580]" aria-hidden="true" />
        <div>
          <h2 className="text-base font-black text-[#0E1A59]">
            Atualizar Semestre / Catálogo (Admin)
          </h2>
          <p className="text-xs font-semibold text-[#475569]">
            Edite calendário, feriados e faça upload do documento de 2027.1 com diff antes de publicar.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdminSaveDates} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label htmlFor="adm-inicio" className="block text-xs font-bold text-[#475569] mb-1">
            Início do semestre
          </label>
          <input
            id="adm-inicio"
            type="date"
            value={adminInicio}
            onChange={(e) => setAdminInicio(e.target.value)}
            className="w-full min-h-[42px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="adm-fim" className="block text-xs font-bold text-[#475569] mb-1">
            Fim do semestre
          </label>
          <input
            id="adm-fim"
            type="date"
            value={adminFim}
            onChange={(e) => setAdminFim(e.target.value)}
            className="w-full min-h-[42px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono tabular-nums"
          />
        </div>
        <button
          type="submit"
          disabled={adminSaving}
          className="min-h-[42px] rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold"
        >
          Salvar calendário
        </button>
      </form>

      <div className="space-y-2.5 border-t-[1.5px] border-[#CBD5E1] pt-4">
        <h3 className="text-xs font-extrabold text-[#0E1A59]">Feriados e Pontos Facultativos</h3>
        <div className="flex flex-wrap gap-2">
          {semestreConfig.feriados.map((f) => (
            <div
              key={f.data}
              className="inline-flex items-center gap-2 rounded-full bg-[#E6E9F0]/60 border border-[#CBD5E1] px-3 py-1 text-xs"
            >
              <span className="font-mono tabular-nums font-bold text-[#0E1A59]">
                {formatDatePtBr(f.data)}
              </span>
              <span className="text-[#475569]">{f.nome}</span>
              <button
                type="button"
                onClick={() => handleRemoveFeriado(f.data)}
                aria-label={`Remover feriado ${f.nome}`}
                className="text-[#EC1580] font-extrabold"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="date"
            aria-label="Data do novo feriado"
            value={novoFeriadoData}
            onChange={(e) => setNovoFeriadoData(e.target.value)}
            className="min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono"
          />
          <input
            type="text"
            aria-label="Nome do feriado"
            value={novoFeriadoNome}
            onChange={(e) => setNovoFeriadoNome(e.target.value)}
            placeholder="Nome do feriado"
            className="min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs"
          />
          <button
            type="button"
            onClick={handleAddFeriado}
            className="min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#94A3B8]"
          >
            + Cadastrar feriado
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t-[1.5px] border-[#CBD5E1] pt-4">
        <h3 className="text-sm font-extrabold text-[#0E1A59]">
          Importar Novo Semestre (ex.: 2027.1) via Documento
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="adm-sem-hint" className="block text-xs font-bold text-[#475569] mb-1">
              Identificador alvo
            </label>
            <input
              id="adm-sem-hint"
              type="text"
              value={semestreHint}
              onChange={(e) => setSemestreHint(e.target.value)}
              placeholder="2027.1"
              className="w-full min-h-[42px] rounded-xl border-[1.5px] border-[#CBD5E1] px-3 text-xs font-mono"
            />
          </div>
          <div className="flex items-end">
            <label className="w-full min-h-[42px] rounded-xl border-[1.5px] border-dashed border-[#0E1A59]/40 bg-[#E6E9F0]/60 flex items-center justify-center gap-2 px-3 text-xs font-extrabold text-[#0E1A59] cursor-pointer">
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>{parsingCatalog ? 'Analisando documento...' : 'Upload PDF, CSV ou Imagem'}</span>
              <input
                type="file"
                accept=".pdf,.csv,.txt,image/*"
                disabled={parsingCatalog}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCatalogFileUpload(f);
                  e.target.value = '';
                }}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <textarea
          rows={3}
          value={catalogText}
          onChange={(e) => setCatalogText(e.target.value)}
          placeholder="Ou cole aqui o texto/CSV da nova grade de 2027.1..."
          className="w-full rounded-xl border-[1.5px] border-[#CBD5E1] p-3 text-xs"
        />
        {catalogText.trim() && (
          <button
            type="button"
            disabled={parsingCatalog}
            onClick={() => handleCatalogFileUpload()}
            className="min-h-[40px] px-4 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold"
          >
            {parsingCatalog ? 'Processando...' : 'Gerar prévia comparativa (Diff)'}
          </button>
        )}

        {parseCatalogError && (
          <p role="alert" className="text-xs font-bold text-[#EC1580] bg-[#FCE7F3] rounded-xl p-3">
            {parseCatalogError}
          </p>
        )}

        {extractedPayload && (
          <div className="rounded-2xl border-[1.5px] border-[#CBD5E1] bg-[#E6E9F0]/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold text-[#0E1A59]">
                  Prévia: {extractedPayload.semestre.nome} ({extractedPayload.disciplinas.length} matérias)
                </p>
                <p className="text-xs font-mono tabular-nums text-[#475569]">
                  {diffPreview.filter((d) => d.status === 'added').length} novas ·{' '}
                  {diffPreview.filter((d) => d.status === 'updated').length} alteradas ·{' '}
                  {diffPreview.filter((d) => d.status === 'removed').length} removidas
                </p>
              </div>
              <button
                type="button"
                disabled={adminSaving}
                onClick={handlePublishExtracted}
                className="min-h-[42px] px-4 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Publicar Semestre Global (1 Clique)
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
              {diffPreview.slice(0, 60).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 border border-[#CBD5E1]"
                >
                  <span className="font-bold text-[#0E1A59] truncate">{item.nome}</span>
                  <span
                    className={`font-mono text-[11px] font-extrabold ${
                      item.status === 'added'
                        ? 'text-[#15803D]'
                        : item.status === 'removed'
                        ? 'text-[#EC1580]'
                        : item.status === 'updated'
                        ? 'text-[#B45309]'
                        : 'text-[#475569]'
                    }`}
                  >
                    {item.status === 'added' && '+ NOVA'}
                    {item.status === 'updated' && '~ ALTERADA'}
                    {item.status === 'removed' && '- REMOVIDA'}
                    {item.status === 'unchanged' && '= IGUAL'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminStatusMsg && (
          <p className="text-xs font-bold text-[#15803D] bg-[#DCFCE7] rounded-xl p-3">
            {adminStatusMsg}
          </p>
        )}
      </div>
    </section>
  );
};

export default AdminCatalogPanel;
