import React, { useId } from 'react';

/**
 * Plajah design-system form controls.
 *
 * Height and radius come from the same control tokens as <Button>, so an input
 * and the button next to it are exactly the same height — the single most
 * common alignment bug in the codebase today.
 *
 * Spec: docs/PLAJAH_DESIGN_SYSTEM.md
 */

interface FieldShellProps {
  label?: string;
  /** Helper text below the control. Replaced by `error` when invalid. */
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

const Shell: React.FC<FieldShellProps & { id: string; children: React.ReactNode }> = ({
  label, hint, error, required, id, className = '', children,
}) => (
  <div className={`pj-stack-2 ${className}`}>
    {label && (
      <label htmlFor={id} className="type-label-lg" style={{ display: 'block', color: 'var(--text-primary)' }}>
        {label}
        {required && <span style={{ color: 'var(--pj-danger)', marginLeft: 4 }} aria-hidden="true">*</span>}
      </label>
    )}
    {children}
    {(error || hint) && (
      <p
        className="type-body-sm"
        style={{ color: error ? 'var(--pj-danger)' : 'var(--on-surface-variant)' }}
        role={error ? 'alert' : undefined}
      >
        {error || hint}
      </p>
    )}
  </div>
);

type InputProps = FieldShellProps & React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, className, ...rest }, ref
) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Shell {...{ label, hint, error, required, id, className }}>
      <input
        ref={ref}
        id={id}
        className="pj-input"
        aria-invalid={error ? true : undefined}
        required={required}
        {...rest}
      />
    </Shell>
  );
});

type TextareaProps = FieldShellProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, ...rest }, ref
) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Shell {...{ label, hint, error, required, id, className }}>
      <textarea
        ref={ref}
        id={id}
        className="pj-input"
        aria-invalid={error ? true : undefined}
        required={required}
        {...rest}
      />
    </Shell>
  );
});

interface ChipProps extends React.HTMLAttributes<HTMLElement> {
  selected?: boolean;
  brand?: boolean;
  /** Renders as a <button> so filter chips are keyboard-operable. */
  interactive?: boolean;
}

export const Chip: React.FC<ChipProps> = ({ selected, brand, interactive, className = '', ...rest }) => {
  const cls = ['pj-chip', selected && 'pj-chip--selected', brand && 'pj-chip--brand', className]
    .filter(Boolean).join(' ');
  if (interactive) {
    return (
      <button
        type="button"
        className={cls}
        aria-pressed={selected}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      />
    );
  }
  return <span className={cls} {...(rest as React.HTMLAttributes<HTMLSpanElement>)} />;
};

export default Input;
