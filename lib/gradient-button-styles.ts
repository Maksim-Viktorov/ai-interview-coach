const gradientButtonBaseClassName =
  'inline-flex items-center justify-center rounded-full font-display font-bold text-white bg-gradient-to-r from-brand-gradient-start to-brand-gradient-end transition duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

const gradientButtonSizeClassName = {
  default: 'px-6 py-3 text-base',
  large: 'px-8 py-4 text-lg',
} as const;

export type GradientButtonSize = keyof typeof gradientButtonSizeClassName;

export function gradientButtonClassName(
  size: GradientButtonSize = 'default',
): string {
  return `${gradientButtonBaseClassName} ${gradientButtonSizeClassName[size]}`.trim();
}
