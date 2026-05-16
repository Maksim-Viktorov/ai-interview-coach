'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

export const gradientButtonClassName =
  'inline-flex items-center justify-center rounded-full px-6 py-3 font-display text-base font-bold text-white bg-gradient-to-r from-brand-gradient-start to-brand-gradient-end transition duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

type GradientButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(
  function GradientButton({ className = '', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={`${gradientButtonClassName} ${className}`.trim()}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
