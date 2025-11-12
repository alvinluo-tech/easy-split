'use client';

import Link from 'next/link';
import React from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';
type As = 'button' | 'a' | 'link';

const base = 'inline-flex items-center justify-center rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-black dark:bg-white text-white dark:text-black hover:opacity-85 focus-visible:ring-black dark:focus-visible:ring-white',
  secondary: 'border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600',
  danger: 'bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-400 focus-visible:ring-red-600 dark:focus-visible:ring-red-400',
  ghost: 'bg-transparent text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600',
};

const sizes: Record<Size, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: React.ReactNode;
};

type ButtonProps = CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
type AnchorProps = CommonProps & React.AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a' };
type LinkProps = CommonProps & { as: 'link'; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function Button(props: ButtonProps | AnchorProps | LinkProps) {
  const { variant = 'primary', size = 'md', className, children } = props as CommonProps;
  const classes = clsx(base, variants[variant], sizes[size], className);

  if ('as' in props && props.as === 'a') {
    const { as, ...rest } = props as AnchorProps;
    return <a {...rest} className={classes}>{children}</a>;
  }
  if ('as' in props && props.as === 'link') {
    const { as, href, ...rest } = props as LinkProps;
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  const { as, type = 'button', ...rest } = props as ButtonProps;
  return (
    <button type={type} {...rest} className={classes}>
      {children}
    </button>
  );
}

export default Button;