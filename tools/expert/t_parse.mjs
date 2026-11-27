import fs from 'fs'; import zlib from 'zlib';
import {parseReplay} from './parse.mjs'; import {candidates,FEATURES} from '../../src/ai/expert/features.mjs';
const db={dex:JSON.parse(fs.readFileSync(new URL('../../src/data/pokedex.json', import.meta.url))),moves:JSON.parse(fs.readFileSync(new URL('../../src/data/moves.json', import.meta.url)))};
const fmt=process.argv[2]||'gen9ou';
const lines=zlib.gunzipSync(fs.readFileSync(`replays/${fmt}.jsonl.gz`)).toString().split('\n').filter(Boolean);
const rep=JSON.parse(lines[+process.argv[3]||0]);
const ds=parseReplay(db,rep);
console.log(rep.id,'decisions',ds.length);
for(const d of ds.slice(0,14)){
  const legal=d.kind==='turn'?d.me.active.moves:[];
  const {cx,out}=candidates(db,d,legal,d.me.bench,d.kind!=='turn');
  const lab=d.label.kind==='move'?d.label.move:'→'+d.me.bench.find(b=>b.idx===d.label.idx)?.mon.species;
  console.log(`T${d.turn} ${d.kind} ${d.me.active.species}(${(d.me.active.hp*100|0)}%) vs ${d.foe.active.species}(${(d.foe.active.hp*100|0)}%) thr=${cx.threat.toFixed(2)} myBest=${cx.myBest.toFixed(2)} fast=${cx.faster} | moves=${legal.join(',')} bench=${d.me.bench.map(b=>b.mon.species).join(',')} => ${lab}`);
}
