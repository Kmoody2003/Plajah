const React = require('react');
try {
  React.forwardRef(undefined);
} catch (e) {
  console.log("forwardRef:", e.message);
}

try {
  React.memo(undefined);
} catch (e) {
  console.log("memo:", e.message);
}
