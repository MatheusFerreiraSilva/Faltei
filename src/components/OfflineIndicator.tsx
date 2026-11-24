import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-[#0E1A59] px-4 py-2 text-xs font-bold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#EC1580]" aria-hidden="true" />
      <span>Offline — alterações salvas no aparelho e sincronizadas ao reconectar</span>
    </div>
  );
};
