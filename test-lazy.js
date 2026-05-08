import React, { lazy } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const BadComponent = lazy(() => Promise.resolve({ default: undefined }));

try {
  renderToStaticMarkup(React.createElement(
      React.Suspense, 
      { fallback: 'loading' }, 
      React.createElement(BadComponent)
  ));
} catch(e) {
  console.log(e.message);
}
