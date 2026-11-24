import React from 'react';
import { Cloud, LogOut, Settings, UserCheck } from 'lucide-react';
import { CumpliceIcon, CumpliceMood } from './CumpliceIcon';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  displayName?: string;
  isPreviewMode: boolean;
  mood?: CumpliceMood;
  onOpenConfig: () => void;
  onAuthAction: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  displayName,
  isPreviewMode,
  mood = 'seguro',
  onOpenConfig,
  onAuthAction,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#E6E9F0]/90 backdrop-blur-md border-b-[1.5px] border-[#CBD5E1]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <CumpliceIcon mood={mood} size={34} />
          <span className="text-xl font-black tracking-tight text-[#0E1A59] whitespace-nowrap">
            faltei<span className="text-[#EC1580]">.</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={onOpenConfig}
            aria-label="Configurações da conta e sincronização"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-extrabold text-[#0E1A59] hover:border-[#0E1A59] active:scale-95 transition-all whitespace-nowrap shrink-0"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isPreviewMode ? 'bg-[#D97706]' : 'bg-[#16A34A]'
              }`}
              aria-hidden="true"
            />
            <span className="max-w-[96px] sm:max-w-[140px] truncate">
              {displayName || 'Estudante'}
            </span>
            <Settings className="w-3.5 h-3.5 text-[#475569] shrink-0" aria-hidden="true" />
          </button>

          {isPreviewMode ? (
            <button
              type="button"
              onClick={onAuthAction}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] active:scale-95 transition-all whitespace-nowrap shrink-0"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#EC1580]" aria-hidden="true" />
              <span className="hidden sm:inline">Entrar na conta</span>
              <span className="sm:hidden">Entrar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAuthAction}
              aria-label={`Sair da conta ${displayName || ''}`}
              title="Sincronizado com seu e-mail · Clique para sair"
              className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-xs font-bold text-[#475569] hover:text-[#0E1A59] hover:border-[#94A3B8] active:scale-95 transition-all whitespace-nowrap shrink-0"
            >
              <Cloud className="w-3.5 h-3.5 text-[#15803D] hidden sm:inline" aria-hidden="true" />
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
