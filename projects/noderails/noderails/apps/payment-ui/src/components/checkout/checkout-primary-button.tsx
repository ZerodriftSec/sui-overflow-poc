'use client';

import { Button, Spinner } from '@heroui/react';
import { ArrowRight } from 'lucide-react';

interface CheckoutPrimaryButtonProps {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'lg';
  showArrow?: boolean;
}

export function CheckoutPrimaryButton({
  children,
  disabled,
  loading,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'default',
  showArrow = false,
}: CheckoutPrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Button
      type={type}
      fullWidth
      size={size === 'lg' ? 'lg' : 'md'}
      variant={variant === 'secondary' ? 'secondary' : 'primary'}
      isDisabled={isDisabled}
      onPress={onClick}
      className="font-bold shadow-md shadow-indigo-500/20"
    >
      {loading ? <Spinner size="sm" color="current" /> : null}
      {children}
      {showArrow && !loading ? <ArrowRight className="h-4 w-4" /> : null}
    </Button>
  );
}

export function CheckoutButtonGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex gap-3 ${className ?? ''}`}>{children}</div>;
}
