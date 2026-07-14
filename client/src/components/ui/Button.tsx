import React from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'danger-text';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'full';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant,
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const baseClass = 'btn';
  const variantClass = variant ? `btn--${variant}` : '';
  const sizeClass = size !== 'md' ? `btn--${size}` : '';
  const loadingClass = isLoading ? 'btn--loading' : '';

  const combinedClassName = [baseClass, variantClass, sizeClass, loadingClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={combinedClassName} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <>
          <span className="btn-spinner" aria-hidden="true" />
          <span className="btn-content--hidden" style={{ opacity: 0 }}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
