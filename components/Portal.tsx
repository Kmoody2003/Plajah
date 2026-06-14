import { createPortal } from 'react-dom';
import React from 'react';

/**
 * Portal — render children into <body>, escaping any ancestor that has a CSS
 * transform (the app's page transitions). A `position: fixed` overlay inside a
 * transformed ancestor anchors to that ancestor instead of the viewport, which
 * makes fullscreen lightboxes/modals appear at the TOP of the page instead of
 * centered in view. Wrapping the overlay in <Portal> fixes that everywhere.
 */
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  typeof document !== 'undefined' ? createPortal(children, document.body) : null;

export default Portal;
