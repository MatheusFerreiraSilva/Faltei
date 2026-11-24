import React from 'react';

export type CumpliceMood = 'seguro' | 'programado' | 'atencao' | 'critico' | 'sem_aula';

interface CumpliceIconProps {
  mood?: CumpliceMood;
  size?: number;
  withBg?: boolean;
  className?: string;
}

export const CumpliceIcon: React.FC<CumpliceIconProps> = ({
  mood = 'seguro',
  size = 38,
  withBg = true,
  className = '',
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    width={size}
    height={size}
    fill="none"
    className={className}
    aria-hidden="true"
  >
    {withBg && <rect width="64" height="64" rx="16" fill="#0E1A59" />}
    {mood === 'seguro' && (
      <>
        <circle cx="19.5" cy="21.5" r="5.2" fill="#FFFFFF" />
        <path
          d="M48 16.5L38 21.5L48 26.5"
          stroke="#EC1580"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 34.5Q32 37.5 48 34.5C47 52.5 17 52.5 16 34.5Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
      </>
    )}
    {mood === 'programado' && (
      <>
        <path
          d="M14.5 22.5C17.5 27.5 23.5 27.5 26.5 22.5"
          stroke="#FFFFFF"
          strokeWidth="5.2"
          strokeLinecap="round"
        />
        <path
          d="M37.5 22.5C40.5 27.5 46.5 27.5 49.5 22.5"
          stroke="#EC1580"
          strokeWidth="5.2"
          strokeLinecap="round"
        />
        <path
          d="M17 35Q32 38 47 35C46 51.5 18 51.5 17 35Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
      </>
    )}
    {mood === 'atencao' && (
      <>
        <path
          d="M14 15L26 17.5"
          stroke="#EC1580"
          strokeWidth="4.4"
          strokeLinecap="round"
        />
        <circle cx="20.5" cy="24.5" r="4.8" fill="#FFFFFF" />
        <circle cx="43.5" cy="24.5" r="4.8" fill="#FFFFFF" />
        <path d="M19 42.5H45" stroke="#EC1580" strokeWidth="5.2" strokeLinecap="round" />
      </>
    )}
    {mood === 'critico' && (
      <>
        <path
          d="M16 18.5L25 27.5M25 18.5L16 27.5"
          stroke="#EC1580"
          strokeWidth="5.2"
          strokeLinecap="round"
        />
        <path
          d="M39 18.5L48 27.5M48 18.5L39 27.5"
          stroke="#EC1580"
          strokeWidth="5.2"
          strokeLinecap="round"
        />
        <path
          d="M18 43C22.5 38 27.5 46.5 32 41.5C36.5 36.5 41.5 46.5 46 41.5"
          stroke="#FFFFFF"
          strokeWidth="4.8"
          strokeLinecap="round"
        />
      </>
    )}
    {mood === 'sem_aula' && (
      <>
        <path
          d="M14.5 25.5L20.5 18.5L26.5 25.5"
          stroke="#FFFFFF"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M37.5 25.5L43.5 18.5L49.5 25.5"
          stroke="#EC1580"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 34.5Q32 37.5 48 34.5C47 52.5 17 52.5 16 34.5Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
      </>
    )}
  </svg>
);
