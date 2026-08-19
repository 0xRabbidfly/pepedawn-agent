import fs from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n')
  .filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));

const D=process.env.SP+'/tel/';
const sr=fs.readFileSync(D+'smart-router-logs.jsonl','utf8').trim().split('\n')
  .map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)
  .filter(x=>x.retrieval&&x.retrieval.totalCandidates>0&&x.userText&&x.userText.length>12);

// Stratified sample of real user queries by intent
const pick=(intent,n)=>sr.filter(x=>x.intent===intent).filter((_,i)=>i%3===0).slice(0,n).map(x=>({q:x.userText,intent}));
const queries=[...pick('FACTS',70),...pick('LORE',30),...pick('CHAT',70)];
console.log(`embedding ${queries.length} real production queries...`);

const emb = async (texts) => {
  const res = await fetch('https://api.openai.com/v1/embeddings',{method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.OPENAI_API_KEY}`},
    body:JSON.stringify({model:'text-embedding-3-small',input:texts})});
  if(!res.ok) throw new Error('embed failed: '+res.status+' '+(await res.text()).slice(0,200));
  return (await res.json()).data.map(d=>d.embedding);
};
const vecs=[];
for(let i=0;i<queries.length;i+=64) vecs.push(...await emb(queries.slice(i,i+64).map(x=>x.q)));

const db=new PGlite('/home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/.eliza/.elizadb',{relaxedDurability:true,extensions:{vector}});
await db.waitReady;

const stats={}; const perQ=[];
for(let i=0;i<queries.length;i++){
  const v='['+vecs[i].join(',')+']';
  const r=await db.query(`
    SELECT CASE WHEN k.metadata->>'source'='card-visual' THEN 'card_facts'
                WHEN d.metadata->>'source'='telegram' THEN 'telegram'
                WHEN d.metadata->>'source'='rag-service-main-upload' THEN 'wiki_md'
                ELSE 'other' END AS true_src,
           1-(e.dim_1536 <=> $1::vector) AS sim
    FROM embeddings e JOIN memories k ON k.id=e.memory_id
    LEFT JOIN memories d ON d.id::text=k.metadata->>'documentId'
    WHERE k.type='knowledge' AND e.dim_1536 IS NOT NULL
    ORDER BY e.dim_1536 <=> $1::vector LIMIT 20`,[v]);
  const it=queries[i].intent; stats[it]=stats[it]||{n:0,src:{},top1:{},simSum:{}};
  stats[it].n++;
  r.rows.forEach((row,rank)=>{
    stats[it].src[row.true_src]=(stats[it].src[row.true_src]||0)+1;
    stats[it].simSum[row.true_src]=(stats[it].simSum[row.true_src]||0)+Number(row.sim);
    if(rank===0) stats[it].top1[row.true_src]=(stats[it].top1[row.true_src]||0)+1;
  });
  perQ.push({q:queries[i].q.slice(0,60),intent:it,top:r.rows.slice(0,3).map(x=>x.true_src+':'+Number(x.sim).toFixed(2))});
}
console.log('\n### TRUE source of top-20 retrieved passages, by intent');
for(const [it,s] of Object.entries(stats)){
  const tot=Object.values(s.src).reduce((a,b)=>a+b,0);
  console.log(`\n${it} (${s.n} queries)`);
  for(const [k,v] of Object.entries(s.src).sort((a,b)=>b[1]-a[1]))
    console.log('  '+k.padEnd(12)+((100*v/tot).toFixed(1)+'%').padStart(7)+
      '   top1 hits: '+String(s.top1[k]||0).padStart(3)+
      '   mean sim '+(s.simSum[k]/v).toFixed(3));
}
console.log('\n### sample: top-3 true sources per query');
for(const p of perQ.slice(0,12)) console.log(`  [${p.intent}] "${p.q}" -> ${p.top.join('  ')}`);
await db.close();
