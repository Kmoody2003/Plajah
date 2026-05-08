const React = require('react');
const ReactDOMServer = require('react-dom/server');

const UndefinedComp = undefined;
function App() {
  return React.createElement(UndefinedComp, null);
}

try {
  let html = ReactDOMServer.renderToString(React.createElement(App));
  console.log(html);
} catch (e) {
  console.log("react undefined element error:", e.message);
}
