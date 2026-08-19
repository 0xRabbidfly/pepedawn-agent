import fs from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const D=process.env.SP+'/tel/';
const sr=fs.readFileSync(D+'smart-router-logs.jsonl','utf8').trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)
 .filter(x=>x.retrieval&&x.retrieval.totalCandidates>0&&x.userText&&x.userText.length>12);
const pick=(i,n)=>sr.filter(x=>x.intent===i).filter((_,k)=>k%3===0).slice(0,n).map(x=>({q:x.userText,intent:i}));
const Q=[...pick('FACTS',60),...pick('LORE',30),...pick('CHAT',60)];
const emb=async t=>{const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:'text-embedding-3-small',input:t})});return (await r.json()).data.map(d=>d.embedding)};
const V=[];for(let i=0;i<Q.length;i+=64)V.push(...await emb(Q.slice(i,i+64).map(x=>x.q)));
const db=new PGlite('/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/.eliza/.elizadb',{relaxedDurability:true,extensions:{vector}});
await db.waitReady;

const SRC=`CASE WHEN k.metadata->>'source'='card-visual' THEN 'card' WHEN d.metadata->>'source'='telegram' THEN 'tg' ELSE 'wiki' END`;
const top5=async(v,excludeTg)=>{
  const r=await db.query(`SELECT 1-(e.dim_1536 <=> $1::vector) sim FROM embeddings e
    JOIN memories k ON k.id=e.memory_id LEFT JOIN memories d ON d.id::text=k.metadata->>'documentId'
    WHERE k.type='knowledge' AND e.dim_1536 IS NOT NULL ${excludeTg?`AND ${SRC}<>'tg'`:''}
    ORDER BY e.dim_1536 <=> $1::vector LIMIT 5`,[v]);
  return r.rows.map(x=>Number(x.sim));
};
const agg={};
for(let i=0;i<Q.length;i++){
  const v='['+V[i].join(',')+']';
  const [w,wo]=[await top5(v,false),await top5(v,true)];
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const it=Q[i].intent; agg[it]=agg[it]||{n:0,with:0,without:0,drop:0,severe:0};
  const a=mean(w),b=mean(wo);
  agg[it].n++;agg[it].with+=a;agg[it].without+=b;agg[it].drop+=(a-b);
  if(a-b>0.08)agg[it].severe++;
}
console.log('### top-5 mean similarity: full corpus vs TG removed');
console.log('intent   n    with-TG   without-TG   drop    queries degraded >0.08');
for(const [i,s] of Object.entries(agg))
  console.log(i.padEnd(8)+String(s.n).padStart(3)+(s.with/s.n).toFixed(3).padStart(10)+(s.without/s.n).toFixed(3).padStart(13)+
    (s.drop/s.n).toFixed(3).padStart(8)+String(s.severe).padStart(14)+' / '+s.n);
await db.close();
