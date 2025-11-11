'use client';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export default function AppHeader() {
  return (
    <div className="w-full p-3 flex justify-end bg-[hsl(var(--background))]">
      <ThemeSwitcher />
    </div>
  );
}