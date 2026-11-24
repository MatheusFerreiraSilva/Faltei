import React from 'react';
import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Compass,
  SlidersHorizontal,
} from 'lucide-react';
import { motion } from 'motion/react';

export type TabKey = 'hoje' | 'calendario' | 'materias' | 'simulador' | 'grade';

interface BottomDockProps {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  hasUnrecordedToday: boolean;
  criticalCount: number;
}

const TABS: Array<{ id: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'hoje', label: 'Hoje', icon: CalendarCheck2 },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'materias', label: 'Matérias', icon: BookOpen },
  { id: 'simulador', label: 'Simulador', icon: Compass },
  { id: 'grade', label: 'Grade', icon: SlidersHorizontal },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  activeTab,
  onChangeTab,
  hasUnrecordedToday,
  criticalCount,
}) => {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-16px)] sm:w-[calc(100%-24px)] max-w-[560px]"
    >
      <div className="rounded-full bg-white/95 backdrop-blur-md border-[1.5px] border-[#CBD5E1] p-1 sm:p-1.5 shadow-[0_4px_16px_-2px_rgba(14,26,89,0.14)] flex items-center justify-between gap-0.5 sm:gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex-1 min-h-[46px] sm:min-h-[44px] rounded-full flex items-center justify-center px-1 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-extrabold transition-transform active:scale-95 whitespace-nowrap ${
                isActive ? 'text-white' : 'text-[#475569] hover:text-[#0E1A59]'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="activeDockPill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-[#0E1A59]"
                />
              )}
              <span className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5">
                <span className="relative inline-flex items-center justify-center">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {tab.id === 'hoje' && hasUnrecordedToday && (
                    <span
                      aria-label="Aula hoje aguardando registro"
                      className="sm:hidden absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-[#EC1580]"
                    />
                  )}
                  {tab.id === 'materias' && criticalCount > 0 && (
                    <span
                      aria-label={`${criticalCount} matérias em zona crítica`}
                      className="sm:hidden absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#EC1580] text-white text-[9px] font-mono tabular-nums font-bold flex items-center justify-center"
                    >
                      {criticalCount}
                    </span>
                  )}
                </span>
                <span className="leading-none">{tab.label}</span>
                {tab.id === 'hoje' && hasUnrecordedToday && (
                  <span
                    aria-label="Aula hoje aguardando registro"
                    className="hidden sm:inline-block w-2 h-2 rounded-full bg-[#EC1580] shrink-0"
                  />
                )}
                {tab.id === 'materias' && criticalCount > 0 && (
                  <span
                    aria-label={`${criticalCount} matérias em zona crítica`}
                    className="hidden sm:flex min-w-[18px] h-[18px] px-1 rounded-full bg-[#EC1580] text-white text-[10px] font-mono tabular-nums font-bold items-center justify-center shrink-0"
                  >
                    {criticalCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
