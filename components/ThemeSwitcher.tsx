'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder with the same dimensions to avoid layout shift
    return (
      <div className="w-[68px] h-[38px] rounded border border-zinc-300 dark:border-zinc-600" />
    );
  }

  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  return (
    <button
      onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
      className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
      title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
    >
      <span className="text-lg leading-none">
        {currentTheme === 'dark' ? '☀️' : '🌙'}
      </span>
      <span className="text-sm font-medium text-zinc-900 dark:text-white">
        {currentTheme === 'dark' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}
