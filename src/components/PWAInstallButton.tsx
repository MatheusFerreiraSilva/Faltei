import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-[#0E1A59] text-white text-xs font-extrabold hover:bg-[#14267D] active:scale-95 transition-all whitespace-nowrap shrink-0 ${
          variant === 'full' ? 'w-full px-4 py-2.5 text-sm' : 'px-3 py-1.5'
        }`}
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Instalar app
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 min-h-[40px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white text-[#0E1A59] text-xs font-extrabold hover:border-[#94A3B8] active:scale-95 transition-all whitespace-nowrap shrink-0 ${
            variant === 'full' ? 'w-full px-4 py-2.5 text-sm' : 'px-3 py-1.5'
          }`}
        >
          <Share className="w-3.5 h-3.5 text-[#EC1580]" aria-hidden="true" />
          Instalar no iOS
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#09113B]/50 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="bento-card w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 id="ios-install-title" className="text-base font-extrabold text-[#0E1A59]">
                  Instalar faltei. no iPhone
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fechar instruções de instalação"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-[#475569] list-decimal list-inside">
                <li>
                  Toque no botão <strong className="text-[#0E1A59]">Compartilhar</strong> na barra do
                  Safari.
                </li>
                <li>
                  Role para baixo e escolha{' '}
                  <strong className="text-[#0E1A59]">Adicionar à Tela de Início</strong>.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-[#0E1A59] text-white text-sm font-extrabold"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
