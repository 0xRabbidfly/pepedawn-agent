import fs from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const D=process.env.SP+'/tel/';
const sr=fs.readFileSync(D+'smart-router-logs.jsonl','utf8').trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)
 .filter(x=>x.retrieval&&x.retrieval.totalCandidates>0&&x.userText&&x.userText.length>12);
const pick=(i,n)=>sr.filter(x=>x.intent===i).filter((_,k)=>k%3===0).slice(0,n).map(x=>x.userText);
const queries=[...pick('FACTS',70),...pick('LORE',30),...pick('CHAT',70)];
const emb=async t=>{const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:'text-embedding-3-small',input:t})});return (await r.json()).data.map(d=>d.embedding)};
const vecs=[];for(let i=0;i<queries.length;i+=64)vecs.push(...await emb(queries.slice(i,i+64)));

const db=new PGlite('/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/.eliza/.elizadb',{relaxedDurability:true,extensions:{vector}});
await db.waitReady;

// Corpus age profile: extract session year from the [DATES:...] marker on chunk 0
const corpus=await db.query(`
 SELECT substring(k.content->>'text' from '\\[DATES:(\\d{4})') AS yr, COUNT(*) n
 FROM memories k JOIN memories d ON d.id::text=k.metadata->>'documentId'
 WHERE k.type='knowledge' AND d.metadata->>'source'='telegram'
 GROUP BY 1 ORDER BY 1`);
console.log('### TG corpus by session year (chunk 0 only; NULL = continuation chunk)');
console.log(JSON.stringify(corpus.rows));

const hit={},simByYr={};
for(let i=0;i<queries.length;i++){
  const v='['+vecs[i].join(',')+']';
  const r=await db.query(`
   SELECT substring(k2.content->>'text' from '\\[DATES:(\\d{4})') AS yr,
          1-(e.dim_1536 <=> $1::vector) AS sim
   FROM embeddings e JOIN memories k ON k.id=e.memory_id
   JOIN memories d ON d.id::text=k.metadata->>'documentId'
   JOIN memories k2 ON k2.metadata->>'documentId'=k.metadata->>'documentId' AND (k2.metadata->>'position')::int=0
   WHERE k.type='knowledge' AND d.metadata->>'source'='telegram' AND e.dim_1536 IS NOT NULL
   ORDER BY e.dim_1536 <=> $1::vector LIMIT 10`,[v]);
  for(const row of r.rows){const y=row.yr||'?';hit[y]=(hit[y]||0)+1;simByYr[y]=(simByYr[y]||0)+Number(row.sim);}
}
console.log('\n### TG passages actually RETRIEVED, by session year (top-10 x 170 queries)');
const tot=Object.values(hit).reduce((a,b)=>a+b,0);
const corpTot=corpus.rows.reduce((a,b)=>a+Number(b.n),0);
const corpMap=Object.fromEntries(corpus.rows.map(r=>[r.yr||'?',Number(r.n)]));
console.log('year   retrieved   share   corpus-share   retrieval-lift   mean-sim');
for(const [y,v] of Object.entries(hit).sort()){
  const rs=100*v/tot, cs=100*(corpMap[y]||0)/corpTot;
  console.log(y.padEnd(7)+String(v).padStart(8)+(rs.toFixed(1)+'%').padStart(8)+(cs.toFixed(1)+'%').padStart(14)+
    (cs>0?(rs/cs).toFixed(2)+'x':'  -').padStart(16)+(simByYr[y]/v).toFixed(3).padStart(11));
}
await db.close();
