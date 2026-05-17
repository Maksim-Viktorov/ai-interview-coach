'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

export const outlineButtonClassName =
  'inline-flex items-center justify-center rounded-full border border-brand bg-surface px-4 py-2 font-display text-sm font-bold text-brand transition duration-200 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

type OutlineButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const OutlineButton = forwardRef<HTMLButtonElement, OutlineButtonProps>(
  function OutlineButton({ className = '', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={`${outlineButtonClassName} ${className}`.trim()}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
