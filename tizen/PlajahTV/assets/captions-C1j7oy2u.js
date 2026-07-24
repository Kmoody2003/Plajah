function o(e,t,n){if(!e)return"...";if(e.timeCodedLyrics&&e.timeCodedLyrics.length>0){const i=[...e.timeCodedLyrics].reverse().find(s=>s.time<=t);return i?i.text:"..."}if(e.lyrics){const i=e.lyrics.split(`
`);return i[Math.floor(t/(n||1)*i.length)]||"..."}return"..."}function r(e){return!!(e&&(e.timeCodedLyrics&&e.timeCodedLyrics.length>0||e.lyrics))}export{o as g,r as t};
