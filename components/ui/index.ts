/**
 * Plajah UI primitives — the design-system entry point.
 *
 *   import { Button, IconButton, Surface, Actions, Input, Chip } from '../components/ui';
 *
 * New UI uses these. Existing screens migrate opportunistically — see the
 * migration table in docs/PLAJAH_DESIGN_SYSTEM.md.
 *
 * Layout, type roles and motion presets live in src/lib/designSystem.tsx
 * (TYPE, MOTION, Container, AdaptiveGrid, useSafeArea) and are re-exported here
 * so there is one import path for the whole system.
 */

export { Button, IconButton, BUTTON_ICON_SIZE } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';

export { Surface, Actions, Eyebrow } from './Surface';
export type { SurfaceLevel, SurfaceShape } from './Surface';

export { Input, Textarea, Chip } from './Field';

export {
  TYPE,
  MOTION,
  Container,
  AdaptiveGrid,
  TouchTarget,
  useSafeArea,
} from '../../src/lib/designSystem';
