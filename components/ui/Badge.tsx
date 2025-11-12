'use client';

import React from 'react';

type Variant = 'neutral' | 'primary' | 'success';

const base = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border';

const variants: Record<Variant, string> = {
  neutral: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-600',
  primary: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  success: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export type BadgeProps = {
  children?: React.ReactNode;
  variant?: Variant;
  className?: string;
};

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return <span className={clsx(base, variants[variant], className)}>{children}</span>;
}

export default Badge;