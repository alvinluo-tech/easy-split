'use client';

import React from 'react';
import { Button } from './Button';

export type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onClose }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative z-10 w-[90%] max-w-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-lg">
        {title && <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">{title}</h3>}
        <p className="text-sm text-zinc-700 dark:text-zinc-200 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>{cancelText}</Button>
          <Button variant="danger" size="md" onClick={onConfirm}>{confirmText}</Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;