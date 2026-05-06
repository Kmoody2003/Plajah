import * as framer from 'motion/react';
const elements = ['article', 'aside', 'button', 'div', 'footer', 'header', 'img', 'main', 'p', 'section'];
let hasError = false;
for (const e of elements) {
  if (!framer.motion[e]) {
    console.error('motion.' + e + ' is undefined!');
    hasError = true;
  }
}
if (!hasError) console.log('All motion elements exist!');
