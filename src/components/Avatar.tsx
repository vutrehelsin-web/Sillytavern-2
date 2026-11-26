import { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-xl',
};

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const safeSrc =
    src &&
    (src.startsWith('/') ||
      src.startsWith('https://') ||
      src.startsWith('http://') ||
      src.startsWith('blob:'))
      ? src
      : '';

  if (!safeSrc || failed) {
    return (
      <div
        aria-label={name}
        className={`shrink-0 rounded-lg bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center font-display font-semibold text-amber-200/90 select-none ${SIZE_CLASSES[size]} ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-lg object-cover border border-slate-700/70 bg-slate-900 ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}
