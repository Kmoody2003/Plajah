// ProviderIcons — the real brand marks for every identity provider Plajah supports.
//
// The landing page used to stand in generic lucide glyphs for these: a `LogIn` arrow for
// Google, `Minimize2` (two diagonal arrows) for Microsoft, and lucide's `X` — a thin
// dismiss cross — for X/Twitter. That last one is the one people misread: on a row of
// buttons a hairline cross reads as "close", not "sign in with X". Real marks remove the
// guesswork, so this is the one place they live.
//
// Each takes a `size` (square) and inherits nothing else — the brand colours are baked in,
// except X/Twitter which is monochrome and follows `currentColor`.

import React from 'react';

type IconProps = { size?: number; className?: string };

export const GoogleIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
    <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.165 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);

export const FacebookIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

export const MicrosoftIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" fill="none" className={className} aria-hidden>
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

/** The X wordmark glyph — solid, weighted, and unmistakably not a close button. */
export const XIcon: React.FC<IconProps> = ({ size = 15, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/** providerId → mark, for rendering "you signed up with ___" affordances generically. */
export const PROVIDER_ICON: Record<string, React.FC<IconProps>> = {
  'google.com': GoogleIcon,
  'facebook.com': FacebookIcon,
  'microsoft.com': MicrosoftIcon,
  'twitter.com': XIcon,
};
