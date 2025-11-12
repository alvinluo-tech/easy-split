'use client';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/Button';

export default function AppHeader() {
  return (
    <div className="w-full p-3 flex justify-end items-center gap-3 bg-[hsl(var(--background))]">
      <Button
        as="a"
        href="https://alvin-luo.me/posts/projects/easy-split/"
        target="_blank"
        rel="noopener noreferrer"
        variant="secondary"
        size="sm"
      >
        用户指南
      </Button>
      <ThemeSwitcher />
    </div>
  );
}