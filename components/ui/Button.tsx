import React from 'react';

/**
 * Plajah design-system Button — the single source of button geometry.
 *
 * Every button on the platform should be this component. Geometry (height,
 * padding, radius, gap, icon size, type ramp) comes from the control tokens in
 * styles/plajah-ds.css, so a `sm` button in Chora is pixel-identical to a `sm`
 * button in Academia and buttons on the same row always align.
 *
 * Spec + migration guide: docs/PLAJAH_DESIGN_SYSTEM.md
 *
 *   <Button variant="primary" size="lg" icon={<Play />}>Play</Button>
 *   <Button variant="ghost" size="sm" iconOnly aria-label="Close"><X /></Button>
 *   <Button variant="secondary" loading>Saving</Button>
 *   <Button as="a" href="/chora" variant="outline">Open Chora</Button>
 */

export type ButtonVariant =
  | 'primary'        // brand gradient — the one main action on a view
  | 'accent'         // orange signal — play / go live / record
  | 'secondary'      // glass surface — the workhorse
  | 'outline'        // hairline, no fill
  | 'ghost'          // lowest weight — toolbars, dense rows, dismissals
  | 'danger'         // destructive, prominent
  | 'danger-quiet'   // destructive inside a dense list
  | 'success';       // confirmed / verified

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Icon pixel size per control size — keeps lucide icons optically balanced. */
export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = {
  xs: 12, sm: 14, md: 16, lg: 20, xl: 24,
};

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. Sized automatically — do not set width/height on it. */
  icon?: React.ReactNode;
  /** Trailing icon (chevrons, external-link marks). */
  iconRight?: React.ReactNode;
  /** Square control with no label. Requires `aria-label`. */
  iconOnly?: boolean;
  /** Swaps the leading icon for a spinner and disables the control. Width is preserved. */
  loading?: boolean;
  /** Stretches to the container. On narrow screens prefer `.pj-actions` instead. */
  fullWidth?: boolean;
  /** Rounded-rect instead of a pill — for controls docked into a toolbar or grid. */
  square?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ButtonProps = ButtonOwnProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & { as?: 'button' };

type AnchorProps = ButtonOwnProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps> & { as: 'a' };

/** Sizes an arbitrary icon node to the control's icon scale. */
function sizeIcon(node: React.ReactNode, size: ButtonSize): React.ReactNode {
  if (!React.isValidElement(node)) return node;
  const px = BUTTON_ICON_SIZE[size];
  const el = node as React.ReactElement<{ size?: number; width?: number; height?: number }>;
  // lucide-react takes `size`; raw SVG/img take width/height. Set both, harmlessly.
  return React.cloneElement(el, { size: el.props.size ?? px, width: el.props.width ?? px, height: el.props.height ?? px });
}

function buildClassName(p: ButtonOwnProps): string {
  const { variant = 'secondary', size = 'md', iconOnly, fullWidth, square, className = '' } = p;
  return [
    'pj-btn',
    `pj-btn--${variant}`,
    `pj-btn--${size}`,
    iconOnly && 'pj-btn--icon',
    fullWidth && 'pj-btn--block',
    square && 'pj-btn--square',
    // xs/sm fall below the 44px comfortable hit area; `.tap` restores it without
    // changing the visual size of the control.
    (size === 'xs' || size === 'sm') && 'tap',
    className,
  ].filter(Boolean).join(' ');
}

function Content({ icon, iconRight, iconOnly, loading, size = 'md', children }: ButtonOwnProps) {
  const spinner = <span className="pj-btn__spinner" aria-hidden="true" />;
  return (
    <>
      {loading ? spinner : icon ? sizeIcon(icon, size) : null}
      {!iconOnly && children}
      {!loading && iconRight ? sizeIcon(iconRight, size) : null}
    </>
  );
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps | AnchorProps>(
  function Button(props, ref) {
    // The public type is a discriminated union; internally we widen once so the
    // shared destructure is legal (intersecting the two arms collapses `as` to never).
    type AnyButtonProps = ButtonOwnProps & { as?: 'button' | 'a' } & Record<string, any>;
    const {
      as = 'button', variant, size = 'md', icon, iconRight, iconOnly,
      loading, fullWidth, square, className, children, ...rest
    } = props as AnyButtonProps;

    const cls = buildClassName({ variant, size, iconOnly, fullWidth, square, className });
    const content = <Content {...{ icon, iconRight, iconOnly, loading, size, children }} />;

    if (as === 'a') {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={cls}
          aria-busy={loading || undefined}
          {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </a>
      );
    }

    const btnRest = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        // Buttons inside forms default to submit, which has caused accidental
        // submits across the codebase. Opt in explicitly instead.
        type={btnRest.type ?? 'button'}
        className={cls}
        disabled={btnRest.disabled || loading}
        aria-busy={loading || undefined}
        {...btnRest}
      >
        {content}
      </button>
    );
  }
);

/** Icon-only button. Enforces `aria-label` at the type level. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'iconOnly' | 'children'> & { 'aria-label': string; children: React.ReactNode }
>(function IconButton({ children, ...rest }, ref) {
  // The glyph goes through `icon`, not children — `iconOnly` suppresses children
  // so the control stays square and label-free.
  return <Button ref={ref as React.Ref<HTMLButtonElement>} iconOnly icon={children} {...rest} />;
});

export default Button;
