import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'success'
    | 'warning'
    | 'success-subtle'
    | 'destructive-subtle'
    | 'info'
    | 'info-pulse';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        {
          'bg-primary text-primary-foreground': variant === 'default',
          'bg-muted text-muted-foreground': variant === 'secondary',
          'bg-destructive text-white': variant === 'destructive',
          'bg-success text-white': variant === 'success',
          'bg-warning text-white': variant === 'warning',
          'bg-green-500/15 text-green-500 border border-green-500/20': variant === 'success-subtle',
          'bg-red-500/15 text-red-500 border border-red-500/20': variant === 'destructive-subtle',
          'bg-blue-500/15 text-blue-500 border border-blue-500/20': variant === 'info',
          'bg-blue-500/15 text-blue-500 border border-blue-500/20 animate-pulse':
            variant === 'info-pulse',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
