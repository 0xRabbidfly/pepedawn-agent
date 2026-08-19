import fs from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const D=process.env.SP+'/tel/';
const sr=fs.readFileSync(D+'smart-router-logs.jsonl','utf8').trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)
 .filter(x=>x.retrieval&&x.retrieval.totalCandidates>0&&x.userText&&x.userText.length>12);
const pick=(i,n)=>sr.filter(x=>x.intent===i).filter((_,k)=>k%3===0).slice(0,n).map(x=>({q:x.userText,intent:i}));
const Q=[...pick('FACTS',60),...pick('LORE',30)];
const emb=async t=>{const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:'text-embedding-3-small',input:t})});return (await r.json()).data.map(d=>d.embedding)};
const V=[];for(let i=0;i<Q.length;i+=64)V.push(...await emb(Q.slice(i,i+64).map(x=>x.q)));
const db=new PGlite('/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/.eliza/.elizadb',{relaxedDurability:true,extensions:{vector}});
await db.waitReady;
const SRC=`CASE WHEN k.metadata->>'source'='card-visual' THEN 'card' WHEN d.metadata->>'source'='telegram' THEN 'tg' ELSE 'wiki' END`;
const t5=async(v,x)=>{const r=await db.query(`SELECT 1-(e.dim_1536 <=> $1::vector) sim FROM embeddings e JOIN memories k ON k.id=e.memory_id LEFT JOIN memories d ON d.id::text=k.metadata->>'documentId' WHERE k.type='knowledge' AND e.dim_1536 IS NOT NULL ${x?`AND ${SRC}<>'tg'`:''} ORDER BY e.dim_1536 <=> $1::vector LIMIT 5`,[v]);return r.rows.reduce((a,b)=>a+Number(b.sim),0)/r.rows.length};
const out=[];
for(let i=0;i<Q.length;i++){const v='['+V[i].join(',')+']';const a=await t5(v,false),b=await t5(v,true);out.push({...Q[i],a,b,d:a-b});}
out.sort((x,y)=>y.d-x.d);
console.log('### FACTS/LORE queries most degraded by removing TG');
for(const o of out.slice(0,10)) console.log(`  -${o.d.toFixed(3)} [${o.intent}] ${o.a.toFixed(2)}->${o.b.toFixed(2)}  "${o.q.replace(/\n/g,' ').slice(0,72)}"`);
console.log('\n### least affected (TG contributes nothing)');
for(const o of out.slice(-5)) console.log(`  -${o.d.toFixed(3)} [${o.intent}] "${o.q.replace(/\n/g,' ').slice(0,72)}"`);
await db.close();
