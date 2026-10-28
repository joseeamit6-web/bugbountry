import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 32 }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0E172E" />
          <stop offset="100%" stopColor="#070B14" />
        </linearGradient>
        <linearGradient id="logoCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#logoBgGrad)" stroke="#1E293B" strokeWidth="2" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="url(#logoCyanGrad)" strokeWidth="2.5" opacity="0.9" />
      <circle cx="32" cy="32" r="18" fill="#0B1020" stroke="#334155" strokeWidth="1.5" />
      <path d="M 32 14 L 38 24 L 28 24 Z" fill="#67E8F9" opacity="0.85" />
      <path d="M 47 23 L 44 34 L 36 29 Z" fill="#67E8F9" opacity="0.75" />
      <path d="M 47 41 L 36 43 L 39 33 Z" fill="#67E8F9" opacity="0.85" />
      <path d="M 32 50 L 26 40 L 36 40 Z" fill="#67E8F9" opacity="0.75" />
      <path d="M 17 41 L 20 30 L 28 35 Z" fill="#67E8F9" opacity="0.85" />
      <path d="M 17 23 L 28 21 L 25 31 Z" fill="#67E8F9" opacity="0.75" />
      <circle cx="32" cy="32" r="7" fill="#0B1020" stroke="#67E8F9" strokeWidth="2" />
      <circle cx="30" cy="30" r="2.5" fill="#FFFFFF" opacity="0.9" />
    </svg>
  );
};
