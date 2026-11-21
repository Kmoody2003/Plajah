import sharp from 'sharp';
const SRC='D:/plajah game assets deign from promtps/Shooter/';
const list=process.argv.slice(2);
const W=688,H=384;
const tiles=[];
for(let i=0;i<list.length;i++) tiles.push({input:await sharp(SRC+list[i]).resize(W,H).toBuffer(),left:(i%2)*W,top:Math.floor(i/2)*H});
await sharp({create:{width:W*2,height:H*Math.ceil(list.length/2),channels:3,background:'#000'}}).composite(tiles).jpeg({quality:80}).toFile('games/rift-realm/tools/_m.jpg');
