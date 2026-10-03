import type { TelaDoc, TelaVectorObject } from '../../types';

export interface TickerReviewTemplate {
  id:string; name:string; kind:'ticker'; width:number; height:number;
  palette:[string,string,string,string]; description:string; tags:string[];
  build:()=>TelaVectorObject[];
  motion:{duration:number;tracks:Array<{objectId:string;property:'rotation'|'x'|'y'|'opacity';from:number;to:number;delay:number;duration:number;loop?:'restart'}>};
  audio:{notes:number[];tempo:number};
  council:{lead:string;counterpoint:string;editor:string;rationale:string};
}
type Direction={id:string;name:string;palette:[string,string,string,string];label:string;headline:string;crawl:string;description:string;motif:'broadcast'|'event'|'news'|'art'|'stock'|'score'|'culture'|'faith'|'runway'|'tech'|'tour'|'cinema';serif?:boolean;notes:number[];tempo:number};
const directions:Direction[]=[
  {id:'ticker-aperture',name:'Aperture Broadcast',palette:['#111B2C','#F2F5FA','#FB633D','#8897AF'],label:'APERTURE',headline:'A wider view of the story',crawl:'PROGRAM PREVIEW  /  IDEAS IN FOCUS  /  CONVERSATIONS THAT MATTER',description:'Architectural broadcast frame with a warm signal rail and cool newsroom hierarchy.',motif:'broadcast',notes:[48,55,60,67],tempo:92},
  {id:'ticker-afterglow',name:'Afterglow Festival',palette:['#311044','#FFF3D9','#FF9956','#F169B1'],label:'AFTERGLOW',headline:'Meet us where the music begins',crawl:'FESTIVAL PREVIEW  /  MAIN STAGE  /  GOOD SOUND, GOOD COMPANY',description:'Sunset circles, oversized festival lettering and a bright flowing information lane.',motif:'event',notes:[57,64,69,76],tempo:112},
  {id:'ticker-dispatch',name:'The Daily Dispatch',palette:['#F3EEE3','#242323','#BF322E','#C7BCA7'],label:'DISPATCH',headline:'The edition for curious minds',crawl:'EDITORIAL DEMO  /  CULTURE  /  DESIGN  /  SCIENCE  /  PUBLIC LIFE',description:'Newspaper typography, disciplined rules and a printed red edition marker.',motif:'news',serif:true,notes:[60,64,67],tempo:86},
  {id:'ticker-gallery-line',name:'Gallery Line',palette:['#EAE6DD','#222221','#3854D8','#D5C3A4'],label:'ON VIEW',headline:'Form, light and everything between',crawl:'EXHIBITION PREVIEW  /  ARTIST CONVERSATIONS  /  THE GALLERY IS OPEN',description:'Museum label scale, cobalt sculptural glyph and wide typographic breathing room.',motif:'art',serif:true,notes:[48,55,62,69],tempo:72},
  {id:'ticker-market-grid',name:'Market Grid',palette:['#071F26','#DBF8EE','#68DFC0','#567E86'],label:'MARKET LAB',headline:'An illustrative view of the market',crawl:'SAMPLE DATA ONLY  /  ALPHA +1.20%  /  BETA −0.40%  /  GAMMA +0.80%',description:'Terminal precision with graph grids and clear, explicitly illustrative market data.',motif:'stock',notes:[48,60,67,72],tempo:100},
  {id:'ticker-matchpoint',name:'Matchpoint Arena',palette:['#1D2049','#F8F4E8','#DFFF38','#676EA1'],label:'MATCHPOINT',headline:'HOME  02  :  01  AWAY',crawl:'SCOREBOARD DEMO  /  SECOND HALF  /  TEAM STORIES  /  MATCH HIGHLIGHTS',description:'Sharp stadium geometry, oversized score cells and an acid-lime results crawl.',motif:'score',notes:[50,57,62,69],tempo:120},
  {id:'ticker-culture-club',name:'Culture Club',palette:['#E9B5BE','#442937','#A72D50','#F7D6A1'],label:'CULTURE CLUB',headline:'Good things happening around us',crawl:'CITY GUIDE PREVIEW  /  INDEPENDENT SPACES  /  NEW IDEAS  /  LOCAL VOICES',description:'Playful rose collage with rounded markers and editorial personality.',motif:'culture',serif:true,notes:[55,62,65,74],tempo:98},
  {id:'ticker-sanctuary',name:'Sanctuary Notes',palette:['#173B36','#F5EEDC','#D6BA77','#668A75'],label:'SANCTUARY',headline:'A moment to gather. A place to belong.',crawl:'COMMUNITY PREVIEW  /  WELCOME TO ALL  /  GATHER  /  REFLECT  /  SERVE',description:'Quiet evergreen architecture, an arched light motif and warm community typography.',motif:'faith',serif:true,notes:[48,55,60,64],tempo:66},
  {id:'ticker-atelier',name:'Atelier Runway',palette:['#ECE7E1','#252020','#B13E32','#B5A098'],label:'ATELIER',headline:'The shape of what comes next',crawl:'COLLECTION PREVIEW  /  FORM & TEXTURE  /  STUDIO NOTES  /  CRAFT IN MOTION',description:'Fashion-house serif lettering, cropped editorial geometry and a narrow caption lane.',motif:'runway',serif:true,notes:[57,60,64,71],tempo:84},
  {id:'ticker-protocol',name:'Protocol Interface',palette:['#101C49','#F0F5FF','#86F9F0','#5165A6'],label:'PROTOCOL',headline:'Build the next possible',crawl:'TECHNOLOGY PREVIEW  /  IDEAS TO PROTOTYPES  /  OPEN CONVERSATIONS',description:'Blueprint nodes, segmented progress and cool technical typography.',motif:'tech',notes:[60,67,72,79],tempo:108},
  {id:'ticker-roadbook',name:'Roadbook Live',palette:['#DDBE85','#332F27','#995432','#8B8766'],label:'ROADBOOK',headline:'Every city has a sound',crawl:'TOUR PREVIEW  /  YOUR CITY NEXT  /  VENUE STORIES  /  ON THE ROAD AGAIN',description:'Travel-stamp styling with route lines and warm ticket-stock colors.',motif:'tour',notes:[52,59,64,71],tempo:94},
  {id:'ticker-cinematheque',name:'Cinémathèque',palette:['#231B26','#F6E4D1','#DA9F6C','#796474'],label:'CINÉMATHÈQUE',headline:'Stories made for the big screen',crawl:'SCREENING PREVIEW  /  DIRECTOR CONVERSATIONS  /  BEHIND THE FRAME',description:'Film perforations, a widescreen inset and warm luminous typography.',motif:'cinema',serif:true,notes:[48,55,63,70],tempo:76},
];

function buildObjects(d:Direction):TelaVectorObject[]{
  const [bg,ink,accent,muted]=d.palette, objects:TelaVectorObject[]=[];
  let n=0;
  const base=(kind:TelaVectorObject['kind'],label:string,x:number,y:number,w:number,h:number,fill:string,patch:Partial<TelaVectorObject>={})=>{const o:TelaVectorObject={id:`${d.id}-${n++}`,kind,objectLabel:label,x,y,w,h,fill,stroke:'none',strokeWidth:0,rotation:0,opacity:1,...patch};objects.push(o);return o;};
  const rect=(label:string,x:number,y:number,w:number,h:number,fill:string,patch:Partial<TelaVectorObject>={})=>base('RECT',label,x,y,w,h,fill,{rx:0,...patch});
  const text=(label:string,x:number,y:number,w:number,value:string,size:number,fill=ink,patch:Partial<TelaVectorObject>={})=>base('TEXT',label,x,y,w,size*1.25,fill,{text:value,fontFamily:d.serif?'Georgia, serif':'Outfit, sans-serif',fontSize:size,fontWeight:600,wrap:false,lineHeight:1.1,...patch});
  const ellipse=(label:string,x:number,y:number,w:number,h:number,fill:string,patch:Partial<TelaVectorObject>={})=>base('ELLIPSE',label,x,y,w,h,fill,patch);
  const path=(label:string,svgPathData:string,stroke=accent,width=3)=>base('PATH',label,0,0,1920,320,'none',{svgPathData,pathOriginX:0,pathOriginY:0,pathOriginW:1920,pathOriginH:320,stroke,strokeWidth:width});
  rect('Ticker ground',0,0,1920,320,bg,{templateRole:'GROUND'});
  if(d.motif==='broadcast'){
    rect('Signal rail',0,0,18,320,accent);rect('Identity plaque',40,35,326,152,ink);
    rect('Signal pulse',58,52,14,14,accent,{id:`${d.id}-ornament`});
    text('Brand',89,51,248,d.label,34,bg);text('Edition',60,122,270,'BROADCAST / 01',20,bg,{fontFamily:'monospace'});
    text('Headline',414,64,1440,d.headline,58);rect('Baseline',414,159,1438,2,muted);
  }else if(d.motif==='event'){
    for(let i=0;i<5;i++)ellipse('Sunset ring '+i,1440+i*42,-170+i*24,460-i*46,460-i*46,'none',{stroke:i%2?accent:muted,strokeWidth:14,opacity:.42});
    ellipse('Orbit jewel',1610,64,32,32,ink,{id:`${d.id}-ornament`});
    text('Brand',46,24,980,d.label,78,accent,{fontWeight:900});text('Headline',51,132,1430,d.headline,40);
  }else if(d.motif==='news'){
    rect('Masthead rule',40,28,1840,4,ink);text('Brand',42,50,482,d.label,66,ink,{fontWeight:400});
    rect('Column rule',563,49,2,133,muted);text('Headline',609,70,1250,d.headline,49,ink,{fontWeight:400});
    rect('Edition marker',1650,158,220,28,accent,{id:`${d.id}-ornament`});text('Edition',52,156,425,'THE CULTURE EDITION',18,accent,{fontFamily:'monospace'});
  }else if(d.motif==='art'){
    rect('Sculpture block',57,51,106,106,accent,{rotation:12,id:`${d.id}-ornament`});ellipse('Sculpture counterform',107,85,65,65,bg);
    text('Brand',225,37,360,d.label,32,accent,{fontFamily:'monospace'});text('Headline',224,93,1570,d.headline,59,ink,{fontWeight:400});
    rect('Museum rule',224,183,1596,1,ink);
  }else if(d.motif==='stock'){
    for(let i=0;i<15;i++)rect('Terminal grid '+i,930+i*66,20,1,182,muted,{opacity:.18});
    for(let i=0;i<5;i++)rect('Terminal axis '+i,930,23+i*42,924,1,muted,{opacity:.18});
    path('Market trace','M950 160L1050 120L1150 142L1250 82L1350 106L1460 54L1590 83L1720 44L1850 62');
    ellipse('Terminal cursor',1840,52,20,20,accent,{id:`${d.id}-ornament`});
    text('Brand',47,26,740,d.label,54,accent,{fontFamily:'monospace'});text('Headline',49,108,850,d.headline,33,ink,{fontFamily:'monospace'});text('Disclosure',49,168,850,'ILLUSTRATIVE DATA • NOT A LIVE FEED',19,muted,{fontFamily:'monospace'});
  }else if(d.motif==='score'){
    base('PATH','Stadium wedge',0,0,1920,320,accent,{svgPathData:'M0 0H500L385 211H0Z',pathOriginX:0,pathOriginY:0,pathOriginW:1920,pathOriginH:320});
    text('Brand',42,47,366,d.label,44,bg,{fontWeight:900});text('Edition',46,123,305,'ARENA / DEMO',23,bg);
    text('Headline',570,50,1210,d.headline,76,ink,{fontWeight:900});
    rect('Stadium signal',572,159,170,8,accent,{id:`${d.id}-ornament`});
  }else if(d.motif==='culture'){
    ellipse('Culture disc',1550,-35,245,245,accent,{opacity:.16});rect('Collage ticket',1625,33,208,130,muted,{rotation:-8,id:`${d.id}-ornament`});
    text('Brand',45,24,1380,d.label,67,accent,{fontStyle:'italic',fontWeight:400});text('Headline',51,120,1430,d.headline,47,ink,{fontWeight:400});
    ellipse('Culture punctuation',1840,164,17,17,accent);
  }else if(d.motif==='faith'){
    ellipse('Sanctuary arch',59,25,130,175,'none',{stroke:accent,strokeWidth:3});rect('Arch base',54,140,145,62,bg);
    rect('Quiet light',121,72,6,102,accent,{id:`${d.id}-ornament`});
    text('Brand',245,31,900,d.label,35,accent,{letterSpacing:.1});text('Headline',245,97,1620,d.headline,50,ink,{fontWeight:400});
  }else if(d.motif==='runway'){
    text('Brand',45,16,694,d.label,99,ink,{fontWeight:400,letterSpacing:-.04});
    rect('Atelier divider',752,33,1,151,muted);text('Headline',806,55,1010,d.headline,48,ink,{fontStyle:'italic',fontWeight:400});
    rect('Atelier swatch',810,148,102,22,accent,{id:`${d.id}-ornament`});text('Edition',944,145,770,'COLLECTION / STUDIO EDITION',19,ink,{fontFamily:'monospace'});
  }else if(d.motif==='tech'){
    for(let i=0;i<9;i++)rect('Protocol segment '+i,1340+i*59,52,39,7,i<5?accent:muted);
    path('Circuit trace','M1395 174H1500V109H1640V155H1850',muted,2);ellipse('Protocol node',1628,97,24,24,accent,{id:`${d.id}-ornament`});
    text('Brand',50,23,1250,d.label,59,accent,{fontFamily:'monospace'});text('Headline',53,113,1210,d.headline,46);
  }else if(d.motif==='tour'){
    rect('Passport stamp',39,28,366,158,'none',{stroke:accent,strokeWidth:3,rotation:-2});text('Brand',59,63,330,d.label,49,accent,{fontFamily:'monospace'});
    text('Edition',64,131,315,'LIVE / ON THE ROAD',18,ink,{fontFamily:'monospace'});text('Headline',470,44,1310,d.headline,61,ink,{fontFamily:'Georgia, serif',fontWeight:400});
    path('Route line','M474 158H1120L1160 143H1770',accent,2);ellipse('Route marker',1758,131,24,24,accent,{id:`${d.id}-ornament`});
  }else{
    for(let i=0;i<22;i++)rect('Film perforation '+i,27+i*86,14,40,12,muted,{rx:3});
    rect('Cinema inset',36,46,1848,137,'none',{stroke:muted,strokeWidth:1});
    text('Brand',59,62,810,d.label,56,accent,{fontWeight:400});text('Headline',920,81,905,d.headline,38,ink,{fontWeight:400});
    rect('Projector glow',1866,54,5,120,accent,{id:`${d.id}-ornament`});
  }
  // Full-width, clipped lane has no fixed label to obscure moving text. Two
  // identical copies one lane apart make the restart seam continuous.
  rect('Crawl lane',0,216,1920,104,d.motif==='score'||d.motif==='event'?accent:ink);
  const crawlInk=d.motif==='score'||d.motif==='event'?bg:bg;
  const content=d.crawl+'     •     ';
  for(let i=0;i<2;i++)text('Continuous crawl '+i,i*1920+48,246,1824,content,28,crawlInk,{id:`${d.id}-crawl-${i}`,fontFamily:'Outfit, sans-serif',fontWeight:500,templateRole:'DECK'});
  return objects;
}

export const TICKER_REVIEW_TEMPLATES:TickerReviewTemplate[]=directions.map(d=>({
  id:d.id,name:d.name,kind:'ticker',width:1920,height:320,palette:d.palette,description:d.description,tags:['review-only',d.motif,'continuous-crawl','native-tela'],
  build:()=>buildObjects(d),
  motion:{duration:24000,tracks:[
    ...[0,1].map(i=>({objectId:`${d.id}-crawl-${i}`,property:'x' as const,from:i*1920+48,to:(i-1)*1920+48,delay:0,duration:24000,loop:'restart' as const})),
    {objectId:`${d.id}-ornament`,property:'opacity',from:.4,to:1,delay:0,duration:d.motif==='faith'?6000:d.motif==='score'?1500:3200},
  ]},
  audio:{notes:d.notes,tempo:d.tempo},
  council:{lead:`${d.motif} art direction`,counterpoint:'Motion and information hierarchy',editor:'Accessibility and native production',rationale:'Anchored identity remains readable above a separate continuous crawl. Native vectors preserve editability. Sample editorial content avoids implying a live information feed. Audio is an optional authored MIDI motif.'},
}));

export function buildTickerTemplateDocument(id:string):TelaDoc{
  const t=TICKER_REVIEW_TEMPLATES.find(x=>x.id===id);if(!t)throw new Error('Unknown ticker template: '+id);
  const deviceId=id+'-device';
  return {id:id+'-review',ownerId:'local',title:t.name+' · Review',createdAt:0,updatedAt:0,frames:[{id:id+'-frame',kind:'BOARD',preset:'FREE',x:0,y:0,w:t.width,h:t.height,deviceIds:[deviceId],label:t.name}],devices:{[deviceId]:{id:deviceId,type:'VECTOR',name:t.name,width:t.width,height:t.height,objects:t.build()}}};
}
export function buildTickerTemplateBundle(){return {format:'plajah-tela-review',version:1,status:'review-only',templates:TICKER_REVIEW_TEMPLATES.map(t=>({id:t.id,name:t.name,kind:t.kind,document:buildTickerTemplateDocument(t.id),motion:t.motion,audio:t.audio,council:t.council}))};}
