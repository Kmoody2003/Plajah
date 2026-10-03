import type { TelaDoc, TelaVectorObject } from '../../types';

export interface EventReviewTemplate {
  id:string; name:string; kind:'ticket'|'evite'; width:number; height:number;
  palette:[string,string,string,string]; description:string; tags:string[];
  build:()=>TelaVectorObject[];
  motion:{duration:number;tracks:Array<{objectId:string;property:'rotation'|'x'|'y'|'opacity';from:number;to:number;delay:number;duration:number}>};
  audio:{notes:number[];tempo:number};
  council:{lead:string;counterpoint:string;editor:string;rationale:string};
}
type Spec = [string,string,string,string,string,string,string,string,string,string,string];
// Each direction has its own spatial score. These are deliberately review assets,
// never registrations in a live event, ticket issuer, or template picker.
const tickets:Spec[] = [
 ['nocturne','Nocturne Society','NOCTURNE','After-hours chamber music','#101728','#e9dcca','#bc9658','#304566','CLASSICAL','BAROQUE','Engraved concentric stage rings; generous serif title and quiet side docket.'],
 ['signal','Signal / 09','SIGNAL / 09','Electronic listening room','#101010','#f5f2dc','#c6fc38','#40473d','FUTURIST','REBEL','A measured pulse field opposes a severe vertical information mast.'],
 ['paper','Paper Riot','PAPER RIOT','Independent print fair','#f1e5cd','#201d19','#d73a25','#dfa929','REBEL','CLASSICAL','Offset cut-paper blocks and torn-edge geometry retain visible pressure.'],
 ['orbital','Orbital Assembly','ORBITAL','A night of spatial sound','#111329','#f4eefb','#aaa4ff','#ed9290','FUTURIST','RADICAL_MINIMAL','Fine orbital ellipses rotate slowly behind an anchored nameplate.'],
 ['botanical','Glasshouse Sessions','GLASSHOUSE','Music among the leaves','#dfe8cd','#18372c','#557b47','#b8a56f','WORLD_ECLECTIC','CLASSICAL','Observed leaf silhouettes become a specimen grid, without borrowed cultural motifs.'],
 ['monument','Monument / Live','MONUMENT','Architecture of sound','#e9e7e1','#1b272b','#e44a32','#9fa9a8','RADICAL_MINIMAL','BAROQUE','An enormous cropped monogram and ruled ledger make scale the ornament.'],
 ['velvet','Velvet Hour','VELVET HOUR','An evening of cabaret','#391a32','#ffebd2','#df9b79','#772c4b','BAROQUE','CLASSICAL','Layered proscenium arches frame a warm theatrical reveal.'],
 ['tidal','Tidal Listening','TIDAL','Coastal sound studies','#e6f0ef','#174656','#2d91a1','#f3b97c','WORLD_ECLECTIC','FUTURIST','Contour lines translate an imagined coastal walk into a rolling score.'],
 ['kinetic','Kinetic Club','KINETIC','Movement / rhythm / collective','#fff0d8','#202020','#ff632f','#5949df','REBEL','FUTURIST','Diagonal racing cuts push against a steady information baseline.'],
 ['prism','Prism Cinema','PRISM','Expanded cinema premiere','#11132a','#f7eadd','#f67c96','#67d6dd','BAROQUE','FUTURIST','Faceted light planes give a dark field depth without faux holographic claims.'],
 ['atelier','Atelier Open House','ATELIER','Objects / process / conversation','#f4eee4','#422e25','#c6764c','#9baf9d','CLASSICAL','REBEL','A makers ledger pairs measured drawings with a single expressive brush-like stroke.'],
 ['afterimage','Afterimage','AFTERIMAGE','Experimental arts festival','#281a43','#f5eaaa','#fa765c','#9397ec','FUTURIST','REBEL','An interference disc and asymmetric stacked type leave a retinal trace.'],
];
const evites:Spec[] = [
 ['vow','Modern Vow','Together, always','A celebration of Mira & Ellis','#f8f1e8','#34372d','#8d9768','#d8beab','CLASSICAL','RADICAL_MINIMAL','Paired arcs suggest two lives meeting; typographic air preserves intimacy.'],
 ['supper','Supper Club','A seat for you','An intimate seasonal supper','#f4dfc4','#6a2c22','#c65738','#c79c54','BAROQUE','CLASSICAL','A sculpted plate and asymmetric menu-like hierarchy invite a tactile evening.'],
 ['rooftop','Above the City','Above the city','A rooftop gathering at dusk','#263246','#fff1d8','#ee9c78','#8da9bd','FUTURIST','RADICAL_MINIMAL','Stepped skyline blocks and a low sun create a measured vertical ascent.'],
 ['garden','Garden Party','In full bloom','An afternoon in the garden','#e6edd9','#25482f','#b16a79','#acbe79','WORLD_ECLECTIC','REBEL','Loose stems and individually placed petals suggest a freshly arranged bouquet.'],
 ['baby','Little Orbit','A little orbit','Welcoming a wonderful new arrival','#f3eade','#49415a','#b8b2d8','#d6a476','FUTURIST','CLASSICAL','Playful mobiles balance on visible threads; restrained motion suggests weight.'],
 ['birthday','Another Good Year','Make a wish','Celebrating another wonderful year','#ffdf57','#2e2561','#ee6959','#fff3d7','REBEL','BAROQUE','Large candle columns and an off-center party burst make joy structural.'],
 ['gallery','Private View','Private view','New work / an intimate first look','#efece6','#2a2a28','#aa4631','#9aa394','RADICAL_MINIMAL','REBEL','An empty framed field and a tiny displaced red square ask the eye to linger.'],
 ['jazz','Blue Note Evening','Into the blue','Jazz / conversation / late hours','#152e48','#f0e8ca','#d1a665','#518391','CLASSICAL','REBEL','Piano-key rhythms and an oversized blue moon set an unhurried tempo.'],
 ['wellness','Quiet Morning','A quieter morning','Breath, movement & good company','#e8e3d8','#3f5046','#aab7a1','#c5ab94','RADICAL_MINIMAL','WORLD_ECLECTIC','Balanced stones and spare lines make stillness a compositional decision.'],
 ['launch','Future / Present','Future / present','A new idea comes into the world','#15162c','#f0f4ed','#a9eecc','#a99ae8','FUTURIST','CLASSICAL','A modular perspective corridor stages an earned reveal.'],
 ['film','Picture House','One more scene','A private screening evening','#ebddc4','#342a27','#a83b2f','#b39a6d','CLASSICAL','BAROQUE','A wide cinema window and restrained reel perforations frame the invitation.'],
 ['book','Between the Lines','Between the lines','An evening with books & friends','#eee7d6','#332f2c','#916343','#7d8d83','CLASSICAL','REBEL','Open-book planes and marginal rules translate binding craft into space.'],
 ['dance','Body Electric','Body electric','Dance together / feel everything','#e6ff59','#292246','#d64bb2','#f8f5d4','REBEL','FUTURIST','Jointed abstract figures and displaced blocks retain bodily momentum.'],
 ['fundraiser','A Golden Cause','A golden cause','Gathering to make a difference','#173631','#f5e9c9','#cbb36c','#789786','BAROQUE','RADICAL_MINIMAL','A radiating gold fan expands from a grounded, readable statement.'],
 ['graduation','Next Chapter','The next chapter','A graduation celebration','#f2eee4','#253855','#cb573d','#a3b4ba','CLASSICAL','FUTURIST','Ascending steps turn progress into a graphic structure.'],
 ['housewarming','Open Door','The door is open','A new home / familiar faces','#f0d6bf','#53352d','#bf6246','#73917b','WORLD_ECLECTIC','CLASSICAL','An architectural doorway and small plant offer domestic warmth.'],
 ['picnic','Sunday Blanket','Under open skies','A long afternoon & a shared table','#fff0cd','#355547','#e57952','#87a6a0','WORLD_ECLECTIC','REBEL','A woven-check base and hand-spaced fruit circles evoke a picnic cloth.'],
 ['midnight','Midnight Masque','Behind the velvet','A masked evening of mystery','#23132a','#f1d9b5','#b67569','#6d4273','BAROQUE','CLASSICAL','A sculpted eye-shaped mask sits above a theatrical title.'],
 ['workshop','Make Something','Make something','A hands-on creative workshop','#f2edda','#283d50','#e27542','#73949e','REBEL','CLASSICAL','Measured ruler marks collide with intentionally scattered paper shapes.'],
 ['tea','Tea & Time','Take your time','Tea, small treats & conversation','#e5dedf','#51434a','#9c7583','#acba9c','CLASSICAL','RADICAL_MINIMAL','A drawn cup and fine rising steam leave room for quiet conversation.'],
 ['stargaze','Night Observatory','Meet the night','Stargazing under an open sky','#101e35','#e1e7da','#e0b969','#536b90','FUTURIST','WORLD_ECLECTIC','A chart of invented constellations preserves the human act of looking upward.'],
 ['pool','Poolside','Poolside, please','Sunshine / cool water / good people','#cbe9e9','#174f69','#ef965c','#f8edbe','REBEL','RADICAL_MINIMAL','Tile lines, ripples and a tilted floating ring create summer buoyancy.'],
 ['anniversary','Still Us','Still us','A celebration of years together','#f2e6d5','#592d37','#b86d72','#c6a67c','CLASSICAL','BAROQUE','Interlocking rings and a narrow portrait panel give memory a lasting shape.'],
 ['salon','The Listening Salon','Come a little closer','Music, stories & a small gathering','#d7c8b2','#352c37','#8a4c42','#6e827a','WORLD_ECLECTIC','BAROQUE','Concentric speaker forms meet warm acoustic slats and intimate editorial type.'],
];

function buildObjects(id:string,kind:'ticket'|'evite',index:number,p:[string,string,string,string],title:string,subtitle:string):TelaVectorObject[]{
 const w=kind==='ticket'?900:600,h=kind==='ticket'?420:800,[bg,ink,accent,muted]=p,objects:TelaVectorObject[]=[];
 const add=(key:string,k:TelaVectorObject['kind'],x:number,y:number,ow:number,oh:number,fill:string,extra:Partial<TelaVectorObject>={})=>{const o:TelaVectorObject={id:`${id}-${key}`,kind:k,x,y,w:ow,h:oh,fill,stroke:'none',strokeWidth:0,rotation:0,opacity:1,...extra};objects.push(o);return o;};
 const rect=(key:string,x:number,y:number,ow:number,oh:number,c=accent,extra:Partial<TelaVectorObject>={})=>add(key,'RECT',x,y,ow,oh,c,extra);
 const ellipse=(key:string,x:number,y:number,ow:number,oh:number,c=accent,extra:Partial<TelaVectorObject>={})=>add(key,'ELLIPSE',x,y,ow,oh,c,extra);
 const line=(key:string,x:number,y:number,ex:number,ey:number,c=accent,sw=2)=>add(key,'LINE',Math.min(x,ex),Math.min(y,ey),Math.abs(ex-x),Math.abs(ey-y),'none',{points:[x,y,ex,ey],stroke:c,strokeWidth:sw,templateRole:'RULE'});
 const poly=(key:string,points:number[],c=accent)=>{const xs=points.filter((_,i)=>!(i%2)),ys=points.filter((_,i)=>i%2);return add(key,'PATH',Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),c,{points,pathClosed:true,templateRole:'ORNAMENT'});};
 const text=(key:string,t:string,x:number,y:number,size:number,c=ink,f='Georgia',width=w-100)=>add(key,'TEXT',x,y,width,size*1.35,c,{text:t,fontSize:size,fontFamily:f,fontWeight:f==='Arial'?700:400,templateRole:key==='title'?'HEADLINE':'LABEL'});
 rect('ground',0,0,w,h,bg,{templateRole:'GROUND'});
 if(kind==='ticket'){
  // Artwork is kept in the upper/right field; the main event and admission data remain steady.
  switch(index){
   case 0: for(let j=0;j<6;j++)ellipse(`ring-${j}`,480+j*13,30+j*13,290-j*26,290-j*26,'none',{stroke:accent,strokeWidth:j===0?3:1});line('axis',625,14,625,330);break;
   case 1: for(let j=0;j<32;j++)rect(`pulse-${j}`,405+j*10,85+Math.sin(j*.7)*30,4,100+Math.cos(j*.55)*70,j%4?muted:accent);rect('mast',760,0,140,h,accent);text('mast-label','09',786,95,68,bg,'Arial',100);break;
   case 2: poly('cut',[390,30,716,17,751,160,432,201],accent);poly('tear',[430,150,741,119,734,137,755,155,731,178,756,207,727,248,423,230],muted);text('print','PRINT',459,105,57,bg,'Arial',300);break;
   case 3: for(let j=0;j<5;j++)ellipse(`orbit-${j}`,422,45+j*20,300,145,'none',{stroke:j%2?muted:accent,strokeWidth:1.4,rotation:j*26});ellipse('satellite',643,81,18,18,ink);break;
   case 4: for(let j=0;j<9;j++){line(`stem-${j}`,465+j%3*90,240,455+j%3*90,60+Math.floor(j/3)*40,ink,1);ellipse(`leaf-${j}`,432+j%3*90,50+Math.floor(j/3)*60,58,25,j%2?muted:accent,{rotation:j%2?35:-35});}break;
   case 5: text('monogram','M',442,-45,330,muted,'Arial',320);line('red-rule',430,256,736,256,accent,8);break;
   case 6: for(let j=0;j<6;j++)rect(`arch-${j}`,440+j*20,26+j*12,292-j*40,238-j*20,j%2?bg:muted,{rx:140-j*18});ellipse('stage-light',559,100,56,56,accent);break;
   case 7: for(let j=0;j<15;j++){const pts:number[]=[];for(let k=0;k<12;k++)pts.push(398+k*31,35+j*14+Math.sin(k*.6+j*.13)*21);add(`wave-${j}`,'PATH',398,30,345,250,'none',{points:pts,stroke:j%3?muted:accent,strokeWidth:1.5});}break;
   case 8: for(let j=0;j<5;j++)poly(`speed-${j}`,[420+j*53,35,455+j*53,35,370+j*53,267,335+j*53,267],j%2?muted:accent);break;
   case 9: poly('facet-a',[570,24,730,247,407,247],accent);poly('facet-b',[570,24,594,247,407,247],muted);poly('facet-c',[570,24,730,247,594,247],ink);line('light',378,161,775,72,accent,3);break;
   case 10: rect('drawing',449,49,222,178,'none',{stroke:muted,strokeWidth:1});ellipse('study',481,63,139,139,'none',{stroke:ink,strokeWidth:1});for(let j=0;j<5;j++)line(`gesture-${j}`,420+j*4,213+j*5,711-j*4,88+j*7,accent,4);break;
   case 11: for(let j=0;j<22;j++)ellipse(`echo-${j}`,435+j*5,30+j*5,246-j*10,246-j*10,'none',{stroke:j%2?muted:accent,strokeWidth:2});rect('occlusion',560,18,24,276,bg,{rotation:22});break;
  }
  text('edition','CHORA / LIVE CULTURE',40,30,13,ink,'Arial',350);
  text('title',title,40,112,title.length>12?36:45,ink,index===1||index===5||index===8?'Arial':'Georgia',420);
  text('subtitle',subtitle,42,176,17,ink,'Arial',350);
  line('baseline',40,298,735,298,muted,1);
  text('date','SAT 18 OCT · 7:30 PM',40,322,17,ink,'Arial',310);
  text('venue','THE STUDIO / SAMPLE CITY',40,351,13,ink,'Arial',380);
  if(index!==1){line('stub',765,24,765,392,muted,1);text('admit','ADMIT',785,61,12,ink,'Arial',100);text('quantity','01',779,102,62,accent,'Georgia',110);text('tier','GENERAL',783,211,12,ink,'Arial',108);text('tier-2','ADMISSION',783,232,12,ink,'Arial',110);}
  text('sample','DESIGN PREVIEW · NOT VALID FOR ENTRY',40,389,10,ink,'Arial',690);
 }else{
  switch(index){
   case 0: ellipse('arc-a',106,80,248,300,'none',{stroke:accent,strokeWidth:2});ellipse('arc-b',246,80,248,300,'none',{stroke:muted,strokeWidth:2});rect('arc-mask',50,261,500,140,bg);text('initials','M & E',187,168,50,ink);break;
   case 1: ellipse('plate',172,75,330,270,muted);ellipse('plate-inner',187,90,300,240,bg,{stroke:accent,strokeWidth:2});line('fork',96,125,96,325,ink,4);for(let j=0;j<4;j++)line(`prong-${j}`,84+j*8,110,84+j*8,154,ink,2);break;
   case 2: ellipse('sun',363,76,123,123,accent);for(let j=0;j<7;j++)rect(`building-${j}`,60+j*70,190+(j%3)*32,54,170-(j%3)*32,j%2?muted:ink);break;
   case 3: for(let j=0;j<7;j++){const x=120+j*58,y=125+(j%3)*52;line(`stem-${j}`,300,366,x,y,accent,2);for(let k=0;k<5;k++)ellipse(`petal-${j}-${k}`,x+Math.cos(k*1.256)*18-13,y+Math.sin(k*1.256)*18-13,26,26,j%2?accent:muted);ellipse(`seed-${j}`,x-6,y-6,12,12,ink);}break;
   case 4: line('mobile',110,100,490,100,ink,2);for(let j=0;j<4;j++){const y=170+j%2*90;line(`thread-${j}`,152+j*98,100,152+j*98,y,ink,1);ellipse(`mobile-${j}`,128+j*98,y,48+j%2*20,48+j%2*20,j%2?accent:muted);}break;
   case 5: for(let j=0;j<5;j++){rect(`candle-${j}`,125+j*72,185+j%2*35,33,145-j%2*35,j%2?muted:accent);ellipse(`flame-${j}`,132+j*72,145+j%2*35,19,30,ink);}break;
   case 6: rect('frame',95,86,410,274,'none',{stroke:ink,strokeWidth:2});rect('small-work',365,230,44,44,accent);line('caption-rule',95,384,160,384,ink,1);break;
   case 7: ellipse('moon',303,65,200,200,muted);for(let j=0;j<10;j++)rect(`key-${j}`,77+j*45,262,38,94,ink);for(let j=0;j<9;j++)if(j%3!==2)rect(`black-key-${j}`,103+j*45,262,20,54,accent);break;
   case 8: ellipse('stone-low',130,273,338,66,muted);ellipse('stone-mid',205,205,216,69,accent);ellipse('stone-top',236,144,136,64,ink);line('still-water',81,361,519,361,accent,1);break;
   case 9: for(let j=0;j<8;j++)rect(`portal-${j}`,80+j*21,63+j*16,440-j*42,310-j*32,'none',{stroke:j%2?muted:accent,strokeWidth:2});break;
   case 10: rect('screen',70,91,460,260,ink);ellipse('projection',231,145,138,138,accent);for(let j=0;j<12;j++){rect(`perf-top-${j}`,84+j*38,72,18,9,ink);rect(`perf-bottom-${j}`,84+j*38,361,18,9,ink);}break;
   case 11: poly('left-page',[92,111,294,151,294,348,92,307],muted);poly('right-page',[306,151,508,111,508,307,306,348],accent);for(let j=0;j<6;j++){line(`page-a-${j}`,115,148+j*23,272,179+j*23,bg,2);line(`page-b-${j}`,329,178+j*23,485,147+j*23,bg,2);}break;
   case 12: ellipse('head',259,86,52,52,ink);line('body',285,145,332,246,ink,22);line('arm-a',286,154,188,209,accent,19);line('arm-b',286,154,408,120,ink,19);line('leg-a',329,239,224,352,ink,24);line('leg-b',329,239,455,322,accent,24);break;
   case 13: for(let j=0;j<19;j++){const a=Math.PI+j*Math.PI/18;line(`ray-${j}`,300,354,300+237*Math.cos(a),354+237*Math.sin(a),accent,j%3?2:5);}ellipse('hub',283,337,34,34,ink);break;
   case 14: for(let j=0;j<5;j++)rect(`step-${j}`,94+j*83,299-j*44,83,59+j*44,j%2?muted:accent);break;
   case 15: rect('doorframe',173,62,254,300,ink,{rx:120});rect('door',192,83,216,279,accent,{rx:104});ellipse('knob',358,239,10,10,bg);line('plant-stem',474,344,474,192,ink,3);for(let j=0;j<4;j++)ellipse(`plant-${j}`,j%2?473:436,210+j*24,40,19,muted,{rotation:j%2?-30:30});break;
   case 16: for(let j=0;j<9;j++){rect(`warp-${j}`,76+j*51,111,24,248,accent,{opacity:.35});rect(`weft-${j}`,76,111+j*29,447,14,muted,{opacity:.4});}ellipse('fruit-a',190,149,82,82,accent);ellipse('fruit-b',335,228,75,75,muted);break;
   case 17: poly('mask',[74,154,230,112,300,162,370,112,526,154,490,250,368,288,300,243,232,288,110,250],accent);ellipse('eye-a',151,168,98,55,bg,{rotation:15});ellipse('eye-b',351,168,98,55,bg,{rotation:-15});line('mask-string',300,246,300,344,muted,3);break;
   case 18: rect('ruler',86,85,428,37,muted);for(let j=0;j<35;j++)line(`tick-${j}`,92+j*12,86,92+j*12,j%5?99:113,ink,1);rect('paper-a',115,169,171,160,accent,{rotation:-9});poly('paper-b',[349,149,490,323,309,339],ink);ellipse('cutout',171,210,76,76,bg);break;
   case 19: ellipse('saucer',159,302,300,35,accent);rect('cup',200,198,185,118,muted,{rx:48});ellipse('handle',355,216,66,62,'none',{stroke:muted,strokeWidth:13});for(let j=0;j<3;j++)add(`steam-${j}`,'PATH',240+j*39,84,20,88,'none',{points:[240+j*39,171,231+j*39,143,249+j*39,116,241+j*39,89],stroke:accent,strokeWidth:2});break;
   case 20: {const pts=[110,234,174,139,263,206,334,103,429,151,485,282,373,322];for(let j=0;j<6;j++)line(`constellation-${j}`,pts[j*2],pts[j*2+1],pts[j*2+2],pts[j*2+3],muted,1);for(let j=0;j<7;j++)ellipse(`star-${j}`,pts[j*2]-4,pts[j*2+1]-4,8,8,accent);ellipse('chart',70,50,460,340,'none',{stroke:muted,strokeWidth:1});break;}
   case 21: for(let j=0;j<9;j++)line(`tile-x-${j}`,77+j*56,90,77+j*56,365,muted,1);for(let j=0;j<6;j++)line(`tile-y-${j}`,77,90+j*55,523,90+j*55,muted,1);ellipse('float',210,120,194,194,accent,{rotation:22});ellipse('float-hole',258,168,98,98,bg);break;
   case 22: rect('portrait-panel',170,52,260,318,muted,{rx:125});ellipse('ring-a',160,151,172,172,'none',{stroke:ink,strokeWidth:3});ellipse('ring-b',268,151,172,172,'none',{stroke:accent,strokeWidth:3});break;
   case 23: for(let j=0;j<14;j++)rect(`slat-${j}`,76+j*34,69,11,293,muted);ellipse('speaker',179,107,240,240,ink);for(let j=0;j<5;j++)ellipse(`cone-${j}`,201+j*17,129+j*17,196-j*34,196-j*34,j%2?accent:bg);break;
  }
  text('eyebrow','YOU ARE INVITED',52,32,12,ink,'Arial',496);
  line('divider',52,410,548,410,muted,1);
  text('title',title,52,446,title.length>20?32:41,ink,[6,9,12,14,18].includes(index)?'Arial':'Georgia',496);
  text('subtitle',subtitle,54,511,16,ink,'Arial',492);
  text('date','SATURDAY, 18 OCTOBER',54,588,14,ink,'Arial',492);
  text('time','7:30 PM · THE STUDIO',54,617,14,ink,'Arial',492);
  text('venue','24 GARDEN LANE · SAMPLE CITY',54,646,12,ink,'Arial',492);
  text('rsvp','Kindly RSVP by 10 October',54,704,18,ink,'Georgia',490);
  text('sample','FICTIONAL EVENT · DESIGN PREVIEW',54,765,10,ink,'Arial',490);
 }
 if(kind==='evite'){
  if([0,3,4,8,13,19,22].includes(index))for(const o of objects.filter(o=>o.kind==='TEXT'))o.textAlign='center';
  // A second editorial rhythm: title first, followed by the illustrated field.
  if([2,6,9,12,14,18,20].includes(index)){
   for(const o of objects){
    if(o.id===`${id}-title`)o.y=87;
    else if(o.id===`${id}-subtitle`)o.y=147;
    else if(o.id===`${id}-divider`){o.y=553;o.points=[52,553,548,553];}
    else if(o.kind!=='TEXT'&&o.id!==`${id}-ground`){o.y+=155;if(o.points)o.points=o.points.map((v,i)=>i%2?v+155:v);}
   }
  }
 }
 return objects;
}

function create(spec:Spec,index:number,kind:'ticket'|'evite'):EventReviewTemplate{
 const [slug,name,title,subtitle,a,b,c,d,lead,counterpoint,description]=spec;
 const id=`review-${kind}-${slug}`,palette:[string,string,string,string]=[a,b,c,d];
 const build=()=>buildObjects(id,kind,index,palette,title,subtitle);
 const artwork=build().filter(o=>o.kind!=='TEXT'&&!['ground','baseline','stub','divider'].some(key=>o.id===`${id}-${key}`));
 // Slow decorative motion is separated from all event details. At rest every
 // invitation is complete; reduced-motion renderers can omit every track.
 const tracks=artwork.slice(0,kind==='ticket'?6:5).map((o,i)=>({objectId:o.id,property:(index%3===0?'rotation':index%3===1?'opacity':'y') as 'rotation'|'opacity'|'y',from:index%3===0?o.rotation:index%3===1?o.opacity:o.y,to:index%3===0?o.rotation+(i%2?3:-3):index%3===1?Math.max(.65,o.opacity-.2):o.y+(i%2?5:-5),delay:i*140,duration:2800+i*260}));
 return {id,name,kind,width:kind==='ticket'?900:600,height:kind==='ticket'?420:800,palette,description,tags:[kind,lead.toLowerCase(),'native-vector','review-only'],build,motion:{duration:6000,tracks},audio:{notes:[48+index%12,55+index%12,60+index%12,62+index%12],tempo:68+index%5*8},council:{lead,counterpoint,editor:'RADICAL_MINIMAL',rationale:`${description} ${counterpoint} challenges the lead's default; Radical Minimal edits redundant marks. Writing preserves date/place hierarchy; motion uses a slow reversible decorative phrase; music uses an original four-note cue, opt-in only. All motifs are original geometry; no external cultural or artist attribution is implied.`}};
}

export const EVENT_REVIEW_TEMPLATES:EventReviewTemplate[]=[...tickets.map((s,i)=>create(s,i,'ticket')),...evites.map((s,i)=>create(s,i,'evite'))];

export function buildEventTemplateDocument(id:string,ownerId:string):TelaDoc{
 const template=EVENT_REVIEW_TEMPLATES.find(t=>t.id===id);
 if(!template)throw new Error(`Unknown event review template: ${id}`);
 const deviceId=`${id}-vector`,now=Date.now();
 return {id:`${id}-copy-${globalThis.crypto.randomUUID()}`,ownerId,title:`${template.name} · review copy`,createdAt:now,updatedAt:now,frames:[{id:`${id}-frame`,kind:'BOARD',preset:'FREE',x:0,y:0,w:template.width,h:template.height,deviceIds:[deviceId],label:template.name}],devices:{[deviceId]:{id:deviceId,type:'VECTOR',name:template.name,width:template.width,height:template.height,objects:template.build()}},bindings:[]};
}

/** Native editing document plus portable time/audio metadata, without publishing. */
export function buildEventTemplateBundle(id:string,ownerId:string){
 const template=EVENT_REVIEW_TEMPLATES.find(t=>t.id===id);
 if(!template)throw new Error(`Unknown event review template: ${id}`);
 return {schemaVersion:1 as const,status:'REVIEW' as const,templateId:id,document:buildEventTemplateDocument(id,ownerId),motion:structuredClone(template.motion),audio:structuredClone(template.audio),council:{...template.council}};
}

