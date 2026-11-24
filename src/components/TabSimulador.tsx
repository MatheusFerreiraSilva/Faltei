import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, Compass } from 'lucide-react';
import { DiaSemana, SemestreConfig, UserFalta, UserMateria } from '../types/domain';
import {
  addDaysIso,
  formatDatePtBr,
  formatNumberClean,
  getDiaSemanaFromIso,
  getPeriodoStyle,
  simulateAbsenceRange,
} from '../utils/attendance';

interface TabSimuladorProps {
  todayStr: string;
  semestreConfig: SemestreConfig;
  materias: UserMateria[];
  faltas: UserFalta[];
  onBulkProgramFaltas: (
    entries: Array<{ materiaId: string; data: string; diaSemana: DiaSemana; horas: number }>
  ) => Promise<number>;
  onOpenGrade: () => void;
}

export const TabSimulador: React.FC<TabSimuladorProps> = ({
  todayStr,
  semestreConfig,
  materias,
  faltas,
  onBulkProgramFaltas,
  onOpenGrade,
}) => {
  const tomorrow = useMemo(() => addDaysIso(todayStr, 1), [todayStr]);
  const [modoIntervalo, setModoIntervalo] = useState<'unico' | 'intervalo'>('unico');
  const [startDate, setStartDate] = useState<string>(tomorrow);
  const [endDate, setEndDate] = useState<string>(addDaysIso(tomorrow, 2));
  const [saving, setSaving] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{
    count: number;
    startDate: string;
    endDate: string;
  } | null>(null);

  const effectiveEnd = modoIntervalo === 'unico' ? startDate : endDate;

  const resultado = useMemo(
    () =>
      simulateAbsenceRange(
        materias,
        faltas,
        semestreConfig,
        startDate,
        effectiveEnd,
        todayStr
      ),
    [effectiveEnd, faltas, materias, semestreConfig, startDate, todayStr]
  );

  const handlePreset = (preset: 'amanha' | 'sexta' | 'emenda') => {
    setSavedSummary(null);
    if (preset === 'amanha') {
      setModoIntervalo('unico');
      setStartDate(tomorrow);
      return;
    }
    if (preset === 'sexta') {
      let cursor = tomorrow;
      for (let i = 0; i < 7; i++) {
        if (getDiaSemanaFromIso(cursor) === 5) break;
        cursor = addDaysIso(cursor, 1);
      }
      setModoIntervalo('unico');
      setStartDate(cursor);
      return;
    }
    setModoIntervalo('intervalo');
    setStartDate(tomorrow);
    setEndDate(addDaysIso(tomorrow, 3));
  };

  const handleConfirmAll = async () => {
    const entries = resultado.itens.flatMap((item) =>
      item.datasAfetadas.map((d) => ({
        materiaId: item.materia.id,
        data: d.data,
        diaSemana: d.diaSemana,
        horas: d.horas,
      }))
    );
    if (entries.length === 0) return;

    setSaving(true);
    try {
      const created = await onBulkProgramFaltas(entries);
      setSavedSummary({
        count: created,
        startDate,
        endDate: effectiveEnd,
      });
    } finally {
      setSaving(false);
    }
  };

  if (materias.length === 0) {
    return (
      <div className="bento-card p-8 text-center space-y-4">
        <h1 className="text-xl font-black text-[#0E1A59]">Simulador "Posso Faltar?"</h1>
        <p className="text-sm text-[#475569] max-w-md mx-auto">
          Carregue suas disciplinas na aba Grade primeiro para simular o impacto de faltas ou
          emendas de feriado.
        </p>
        <button
          type="button"
          onClick={onOpenGrade}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold"
        >
          Configurar Grade
        </button>
      </div>
    );
  }

  const verdictBg =
    resultado.vereditoRisco === 'perigo'
      ? 'bg-[#EC1580] text-white border-[#EC1580]'
      : resultado.vereditoRisco === 'atencao'
      ? 'bg-[#FCE7F3] text-[#0E1A59] border-[#EC1580]/50'
      : 'bg-white text-[#0E1A59] border-[#CBD5E1]';

  return (
    <div className="space-y-4">
      {/* Seletor Interativo de Datas */}
      <section className="bento-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#0E1A59] leading-tight">
              Simulador "Posso Faltar?"
            </h1>
            <p className="text-xs font-semibold text-[#475569]">
              Cruze folgas ou viagens com sua grade sem correr risco na chamada.
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-[#E6E9F0] border border-[#CBD5E1]">
            <button
              type="button"
              onClick={() => {
                setModoIntervalo('unico');
                setSavedSummary(null);
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-extrabold transition-colors whitespace-nowrap ${
                modoIntervalo === 'unico'
                  ? 'bg-white text-[#0E1A59] shadow-sm'
                  : 'text-[#475569]'
              }`}
            >
              Data única
            </button>
            <button
              type="button"
              onClick={() => {
                setModoIntervalo('intervalo');
                setSavedSummary(null);
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-extrabold transition-colors whitespace-nowrap ${
                modoIntervalo === 'intervalo'
                  ? 'bg-white text-[#0E1A59] shadow-sm'
                  : 'text-[#475569]'
              }`}
            >
              Intervalo / Viagem
            </button>
          </div>
        </div>

        {/* Presets rápidos */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePreset('amanha')}
            className="min-h-[36px] px-3.5 py-1 rounded-full border-[1.5px] border-[#CBD5E1] bg-[#E6E9F0]/60 text-xs font-extrabold text-[#0E1A59] hover:border-[#94A3B8]"
          >
            Amanhã
          </button>
          <button
            type="button"
            onClick={() => handlePreset('sexta')}
            className="min-h-[36px] px-3.5 py-1 rounded-full border-[1.5px] border-[#CBD5E1] bg-[#E6E9F0]/60 text-xs font-extrabold text-[#0E1A59] hover:border-[#94A3B8]"
          >
            Próxima Sexta
          </button>
          <button
            type="button"
            onClick={() => handlePreset('emenda')}
            className="min-h-[36px] px-3.5 py-1 rounded-full border-[1.5px] border-[#CBD5E1] bg-[#E6E9F0]/60 text-xs font-extrabold text-[#0E1A59] hover:border-[#94A3B8]"
          >
            Emenda de 4 dias
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sim-start" className="block text-xs font-bold text-[#475569] mb-1">
              {modoIntervalo === 'unico' ? 'Data da folga' : 'Início do intervalo'}
            </label>
            <input
              id="sim-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSavedSummary(null);
              }}
              className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3.5 text-sm font-mono tabular-nums text-[#0E1A59]"
            />
          </div>

          {modoIntervalo === 'intervalo' && (
            <div>
              <label htmlFor="sim-end" className="block text-xs font-bold text-[#475569] mb-1">
                Fim do intervalo
              </label>
              <input
                id="sim-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSavedSummary(null);
                }}
                className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3.5 text-sm font-mono tabular-nums text-[#0E1A59]"
              />
            </div>
          )}
        </div>
      </section>

      {/* Post-confirm Persistent Confirmation Banner */}
      {savedSummary ? (
        <section
          role="status"
          className="bento-card p-6 border-[#15803D]/40 bg-[#DCFCE7]/40 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#15803D] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-black text-[#0E1A59]">
                  {savedSummary.count} falta(s) programada(s) e salva(s) no seu radar!
                </h2>
                <p className="text-xs font-semibold text-[#475569] font-mono tabular-nums">
                  Período agendado: {formatDatePtBr(savedSummary.startDate)}
                  {savedSummary.endDate !== savedSummary.startDate
                    ? ` até ${formatDatePtBr(savedSummary.endDate)}`
                    : ''}
                  . Já aparece no Radar da Semana e nas barras de orçamento.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSavedSummary(null)}
              className="min-h-[40px] px-4 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] whitespace-nowrap"
            >
              Nova simulação
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Veredito Cômico */}
          <section className={`bento-card p-6 ${verdictBg} space-y-2`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {resultado.vereditoRisco === 'perigo' ? (
                    <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Compass
                      className={`w-5 h-5 shrink-0 ${
                        resultado.vereditoRisco === 'atencao' ? 'text-[#EC1580]' : 'text-[#0E1A59]'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <h2 className="text-lg font-black tracking-tight">
                    {resultado.vereditoTitulo}
                  </h2>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    resultado.vereditoRisco === 'perigo' ? 'text-white/95' : 'text-[#475569]'
                  }`}
                >
                  {resultado.vereditoTexto}
                </p>
              </div>

              <span className="font-mono tabular-nums text-xs font-extrabold whitespace-nowrap shrink-0">
                {resultado.totalFaltasAGerar} aula(s)
              </span>
            </div>

            {resultado.feriadosNoPeriodo.length > 0 && (
              <p
                className={`text-xs pt-1 ${
                  resultado.vereditoRisco === 'perigo' ? 'text-white/85' : 'text-[#475569]'
                }`}
              >
                Feriados ignorados automaticamente:{' '}
                {resultado.feriadosNoPeriodo
                  .map((f) => `${formatDatePtBr(f.data)} (${f.nome})`)
                  .join(', ')}
              </p>
            )}

            {resultado.itens.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`text-xs font-semibold ${
                    resultado.vereditoRisco === 'perigo' ? 'text-white/90' : 'text-[#475569]'
                  }`}
                >
                  {resultado.itens.length} matéria(s) afetada(s) no intervalo
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmAll}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 active:scale-[0.98] transition-all whitespace-nowrap disabled:opacity-60 ${
                    resultado.vereditoRisco === 'perigo'
                      ? 'bg-white text-[#0E1A59] hover:bg-slate-100'
                      : 'bg-[#EC1580] text-white hover:bg-[#d11170]'
                  }`}
                >
                  <span>
                    {saving ? 'Programando...' : 'Confirmar e Programar Todas essas Faltas'}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </section>

          {/* Relatório de Impacto por Matéria */}
          {resultado.itens.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-extrabold text-[#0E1A59] px-1">
                Impacto nas matérias afetadas ({resultado.itens.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resultado.itens.map((item) => {
                  const pStyle = getPeriodoStyle(item.materia.periodo);
                  const unit = item.antes.unidade === 'h' ? 'h' : ' enc.';
                  return (
                    <div
                      key={item.materia.id}
                      style={{ borderLeftColor: pStyle.borderColor }}
                      className="bento-card border-l-4 p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            style={{ backgroundColor: pStyle.badgeBg, color: pStyle.badgeText }}
                            className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold mb-1.5"
                          >
                            {pStyle.label}
                          </span>
                          <h4 className="text-[15px] font-extrabold text-[#0E1A59] leading-snug line-clamp-2">
                            {item.materia.nome}
                          </h4>
                        </div>
                        <span className="font-mono tabular-nums text-xs font-extrabold text-[#EC1580] whitespace-nowrap">
                          −
                          {item.antes.unidade === 'h'
                            ? `${formatNumberClean(item.horasSimuladas)}h`
                            : `${item.encontrosSimulados} enc.`}
                        </span>
                      </div>

                      <div className="rounded-xl bg-[#E6E9F0]/50 border border-[#CBD5E1] p-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[#475569] font-semibold">Antes</p>
                          <p className="font-mono tabular-nums font-bold text-[#0E1A59] mt-0.5">
                            {formatNumberClean(item.antes.restanteLivre)}
                            {unit} livres · {item.antes.status}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#475569] font-semibold">Depois</p>
                          <p
                            className={`font-mono tabular-nums font-bold mt-0.5 ${
                              item.depois.zonaCriticaTerracota ? 'text-[#EC1580]' : 'text-[#0E1A59]'
                            }`}
                          >
                            {formatNumberClean(item.depois.restanteLivre)}
                            {unit} livres · {item.depois.status}
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] font-mono tabular-nums text-[#475569]">
                        Datas: {item.datasAfetadas.map((d) => `${formatDatePtBr(d.data)} (${formatNumberClean(d.horas)}h)`).join(', ')}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Botão Único de Confirmação */}
              <div className="bento-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#475569]">
                  <CalendarRange className="w-4 h-4 text-[#0E1A59]" aria-hidden="true" />
                  <span>
                    Todas as {resultado.totalFaltasAGerar} aula(s) serão marcadas como programadas.
                  </span>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmAll}
                  className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#EC1580] text-white text-xs sm:text-sm font-extrabold hover:bg-[#d11170] active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
                >
                  <span>
                    {saving ? 'Programando...' : 'Confirmar e Programar Todas essas Faltas'}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
