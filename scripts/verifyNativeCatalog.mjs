import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('firebase-applet-config.json','utf8'));
for(const collection of ['albums','videos']){
 const response=await fetch('https://firestore.googleapis.com/v1/projects/'+config.projectId+'/databases/'+config.firestoreDatabaseId+'/documents:runQuery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:'isPrivate'},op:'EQUAL',value:{booleanValue:false}}},limit:100}})});
 if(!response.ok)throw Error(collection+' HTTP '+response.status);
 const rows=await response.json();const docs=rows.filter(r=>r.document);
 const tracks=docs.reduce((sum,r)=>sum+(r.document.fields?.tracks?.arrayValue?.values?.length||0),0);
 const playable=docs.reduce((sum,r)=>sum+(r.document.fields?.tracks?.arrayValue?.values||[]).filter(v=>{const f=v.mapValue?.fields||{};return ['browserCompatUrl','url','videoUrl'].some(k=>f[k]?.stringValue?.startsWith('https://'))}).length,0);
 console.log(collection+': HTTP 200, '+docs.length+' public documents; '+docs.filter(r=>r.document.fields?.title?.stringValue).length+' titled records; '+tracks+' tracks; '+playable+' directly playable HTTPS tracks');
}
