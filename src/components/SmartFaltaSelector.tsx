import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Minus, Plus, Slash } from 'lucide-react';
import {
  DiaSemana,
  FaltaDetalheTipo,
  FaltaTipo,
  UserMateria,
} from '../types/domain';
import {
  formatNumberClean,
  getDayAttendanceOptions,
} from '../utils/attendance';

export interface SmartFaltaPayload {
  materiaId: string;
  data: string;
  diaSemana: DiaSemana;
  horas: number;
  tipo: FaltaTipo;
  tipoFalta: FaltaDetalheTipo;
  horasAbatidas: number;
  blocoId?: string;
}

interface SmartFaltaSelectorProps {
  materia: UserMateria;
  isoDate: string;
  defaultBlocoId?: string;
  busy?: boolean;
  compact?: boolean;
  onSubmit: (payload: SmartFaltaPayload) => Promise<void> | void;
}

export const SmartFaltaSelector: React.FC<SmartFaltaSelectorProps> = ({
  materia,
  isoDate,
  defaultBlocoId,
  busy = false,
  compact = false,
  onSubmit,
}) => {
  const summary = useMemo(
    () => getDayAttendanceOptions(materia, isoDate),
    [materia, isoDate]
  );

  const initialChoice = useMemo<FaltaDetalheTipo>(() => {
    if (defaultBlocoId && summary.hasTurnosDistintos) {
      const matchedOpt = summary.options.find((o) => o.blocoId === defaultBlocoId);
      if (matchedOpt) return matchedOpt.tipoFalta;
    }
    return 'dia_completo';
  }, [defaultBlocoId, summary.hasTurnosDistintos, summary.options]);

  const [selectedTipoFalta, setSelectedTipoFalta] =
    useState<FaltaDetalheTipo>(initialChoice);
  const [parcialHoras, setParcialHoras] = useState<number>(1);
  const [submittingTipo, setSubmittingTipo] = useState<FaltaTipo | null>(null);

  useEffect(() => {
    setSelectedTipoFalta(initialChoice);
    setParcialHoras(1);
  }, [initialChoice, isoDate, materia.id]);

  const canShowParcial = summary.totalHorasDia >= 2 && summary.maxParcialHoras >= 1;
  const activeOption =
    summary.options.find((o) => o.tipoFalta === selectedTipoFalta) ||
    summary.options[0];

  const resolvedHoras =
    selectedTipoFalta === 'parcial'
      ? Math.max(1, Math.min(summary.maxParcialHoras, parcialHoras))
      : activeOption?.horasAbatidas || summary.totalHorasDia;

  const resolvedBlocoId =
    selectedTipoFalta === 'parcial' ? undefined : activeOption?.blocoId;

  const handleAction = async (tipo: FaltaTipo) => {
    setSubmittingTipo(tipo);
    try {
      await onSubmit({
        materiaId: materia.id,
        data: isoDate,
        diaSemana: summary.diaSemana,
        horas: resolvedHoras,
        tipo,
        tipoFalta: selectedTipoFalta,
        horasAbatidas: resolvedHoras,
        ...(resolvedBlocoId ? { blocoId: resolvedBlocoId } : {}),
      });
    } finally {
      setSubmittingTipo(null);
    }
  };

  const showOptionsRow = summary.hasTurnosDistintos || canShowParcial;

  return (
    <div
      className={compact ? 'space-y-2' : 'space-y-3'}
      data-testid={`smart-falta-selector-${materia.id}`}
    >
      {showOptionsRow && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tipo de falta no dia">
            {summary.options.map((opt) => {
              const active = selectedTipoFalta === opt.tipoFalta;
              return (
                <button
                  key={opt.tipoFalta}
                  type="button"
                  disabled={busy || submittingTipo !== null}
                  onClick={() => setSelectedTipoFalta(opt.tipoFalta)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl border-[1.5px] text-[11px] font-extrabold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#0E1A59] text-white border-[#0E1A59]'
                      : 'bg-white text-[#0E1A59] border-[#CBD5E1] hover:border-[#0E1A59]'
                  }`}
                >
                  {compact ? opt.shortLabel : opt.label}
                </button>
              );
            })}

            {canShowParcial && (
              <button
                type="button"
                disabled={busy || submittingTipo !== null}
                onClick={() => setSelectedTipoFalta('parcial')}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl border-[1.5px] text-[11px] font-extrabold transition-colors whitespace-nowrap ${
                  selectedTipoFalta === 'parcial'
                    ? 'bg-[#EC1580] text-white border-[#EC1580]'
                    : 'bg-white text-[#0E1A59] border-[#CBD5E1] hover:border-[#EC1580]'
                }`}
              >
                Parcial / Atraso
              </button>
            )}
          </div>

          {selectedTipoFalta === 'parcial' && canShowParcial && (
            <div className="rounded-xl bg-[#FCE7F3]/55 border border-[#EC1580]/30 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-[#0E1A59]">
                Abater quantas horas?
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Diminuir 1 hora parcial"
                  disabled={parcialHoras <= 1}
                  onClick={() => setParcialHoras((h) => Math.max(1, h - 1))}
                  className="min-h-[32px] min-w-[32px] rounded-lg bg-white border border-[#CBD5E1] text-[#0E1A59] flex items-center justify-center disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span
                  data-testid="parcial-horas-value"
                  className="font-mono tabular-nums text-xs font-black text-[#EC1580] min-w-[54px] text-center"
                >
                  {formatNumberClean(resolvedHoras)}h / {formatNumberClean(summary.totalHorasDia)}h
                </span>
                <button
                  type="button"
                  aria-label="Aumentar 1 hora parcial"
                  disabled={parcialHoras >= summary.maxParcialHoras}
                  onClick={() =>
                    setParcialHoras((h) => Math.min(summary.maxParcialHoras, h + 1))
                  }
                  className="min-h-[32px] min-w-[32px] rounded-lg bg-white border border-[#CBD5E1] text-[#0E1A59] flex items-center justify-center disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={busy || submittingTipo !== null}
          onClick={() => handleAction('falta')}
          className="col-span-2 sm:col-span-1 min-h-[40px] rounded-xl bg-[#0E1A59] text-white text-[11px] font-extrabold hover:bg-[#14267D] active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 px-2.5 whitespace-nowrap disabled:opacity-60"
        >
          <Slash className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {compact
              ? `Faltei (${formatNumberClean(resolvedHoras)}h)`
              : `Registrar Falta (${formatNumberClean(resolvedHoras)}h)`}
          </span>
        </button>

        <button
          type="button"
          disabled={busy || submittingTipo !== null}
          onClick={() => handleAction('programada')}
          className="min-h-[40px] rounded-xl bg-[#EC1580] text-white text-[11px] font-extrabold hover:bg-[#d11170] active:scale-95 transition-all inline-flex items-center justify-center gap-1 px-2 whitespace-nowrap disabled:opacity-60"
        >
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{compact ? 'Programar' : 'Programar Falta'}</span>
        </button>

        <button
          type="button"
          disabled={busy || submittingTipo !== null}
          onClick={() => handleAction('sem_aula')}
          className="min-h-[40px] rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-[#0E1A59] text-[11px] font-extrabold hover:border-[#0E1A59] active:scale-95 transition-all inline-flex items-center justify-center gap-1 px-2 whitespace-nowrap disabled:opacity-60"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#15803D]" aria-hidden="true" />
          <span>{compact ? 'Sem Aula' : 'Marcar Sem Aula'}</span>
        </button>
      </div>
    </div>
  );
};
