const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const BadComponent = React.lazy(() => Promise.resolve({ default: undefined }));

try {
  renderToStaticMarkup(React.createElement(
      React.Suspense, 
      { fallback: 'loading' }, 
      React.createElement(BadComponent)
  ));
} catch(e) {
  console.log(e.message);
}
