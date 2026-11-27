import fs from 'fs'; import path from 'path'; import vm from 'vm';
import {fileURLToPath} from 'url'; const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SCRIPTS = ['src/data/official-names.js','src/data/move-aliases.js','src/data/name-aliases.js', 'src/engine/name-policy.js', 'src/engine/opponent-training.js', 'st-bridge/gender.js', 'st-bridge/battle-mechanics.js', 'src/engine/gear-resolve.js', 'st-bridge/ability-random.js', 'src/engine/ability-choice.js', 'src/engine/typechart.js', 'src/engine/mechanics.js', 'src/ui/mechanic-items.js', 'src/engine/move-lifecycle.js', 'src/engine/ps-move-data.js', 'src/engine/move-scripts.js', 'src/engine/team-selection.js', 'src/engine/battle.js', 'src/engine/showdown/ps-engine.js', 'src/engine/showdown/rule-text.js', 'src/engine/field-environment.js', 'src/engine/anime-mode.js', 'src/engine/battle-showdown-adapter.js', 'src/engine/team.js', 'src/data/presets.js'];
const quiet=console.log; console.log=()=>{};
for (const s of SCRIPTS) vm.runInThisContext(fs.readFileSync(path.join(ROOT,s),'utf8'),{filename:s});
console.log=quiet;
const J=n=>JSON.parse(fs.readFileSync(path.join(ROOT,'src/data',n+'.json')));
PKMBattle.setData(J('pokedex'),J('moves')); PKMTeam.setData(J('pokedex'),J('moves'),J('learnsets'));
const TEAM=[['blastoise',['hydropump','icebeam','surf','earthquake']],['pikachu',['thunderbolt','quickattack','irontail','thunderwave']],['charizard',['flamethrower','airslash','dragonpulse','earthquake']],['venusaur',['gigadrain','sludgebomb','earthquake','sleeppowder']]];
const mk=()=>TEAM.map(([s,m])=>PKMBattle.createPokemon(s,50,m,{generateIdentity:false}));
// player: greedy best-damage move, no commands
function pmove(b){const me=b._ps.sides[0].active[0],foe=b._ps.sides[1].active[0];let best=0,bv=-1;me.moveSlots.forEach((s,i)=>{if(s.pp<=0)return;const m=b._ps.dex.moves.get(s.id);let v=m.basePower||0;try{v*=Math.pow(2,b._ps.dex.getEffectiveness(m.type,foe))*(b._ps.dex.getImmunity(m.type,foe)?1:0)*(me.hasType(m.type)?1.5:1);}catch(e){}if(v>bv){bv=v;best=i;}});return best;}
export function run(tier,games,seed0=1,env='plain'){let w=0,used=0,turns=0,cnt={};
 for(let g=0;g<games;g++){const b=new PKMBattle.Battle(mk(),mk(),{double:false,encounterType:'trainer',seed:seed0+g,anime:tier==='none'?{env,tier:'novice'}:{env,tier}});
  for(let t=0;t<200&&b.winner===null;t++){if(b.pendingSwitch!==null){b.forceSwitch(b.replacementOptions()[0]);continue;}
   const log=b.turn({kind:'move',index:pmove(b)});for(const x of log){const m=/对手训练家：「.*?(躲开|借助|躲到|藏进|利用|全力|坚持)/.exec(x);if(m)cnt[m[1]]=(cnt[m[1]]||0)+1;}}
  if(b.winner===1)w++;used+=b.anime.used[1];turns+=b.turnCount;}
 return {tier,games,enemyWin:w/games,cmdsPerGame:used/games,turns:turns/games,cnt};}
const tiers=(process.argv[3]||'none,leader,ace,elite,champion,master').split(',');const N=+(process.argv[2]||60);
for(const t of tiers)console.log(JSON.stringify(run(t,N,1000,process.argv[4]||'plain')));
