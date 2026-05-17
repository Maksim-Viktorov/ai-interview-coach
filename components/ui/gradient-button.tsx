'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import {
  gradientButtonClassName,
  type GradientButtonSize,
} from '@/lib/gradient-button-styles';

export type { GradientButtonSize };
export { gradientButtonClassName };

type GradientButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: GradientButtonSize;
};

export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(
  function GradientButton(
    { className = '', size = 'default', children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`${gradientButtonClassName(size)} ${className}`.trim()}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
