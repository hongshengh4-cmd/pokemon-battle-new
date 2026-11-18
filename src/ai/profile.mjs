// SPDX-License-Identifier: MIT
// Scene-local difficulty policy. No roster/stat/HP/item mutation.
export const AI_BUILD='20261118-foulplay-browser-ai-v1';
export const TIERS=Object.freeze(Object.assign(Object.create(null),{
 wild:Object.freeze({label:'野生本能',milliseconds:35,worlds:1,mistake:.32,window:.12,nativeDepth:1}),
 novice:Object.freeze({label:'新手',milliseconds:45,worlds:1,mistake:.24,window:.3,nativeDepth:1}),
 regular:Object.freeze({label:'普通训练家',milliseconds:100,worlds:2,mistake:.10,window:.55,nativeDepth:1}),
 veteran:Object.freeze({label:'资深训练家',milliseconds:220,worlds:3,mistake:.035,window:.7,nativeDepth:2}),
 leader:Object.freeze({label:'馆主',milliseconds:400,worlds:4,mistake:.01,window:.75,nativeDepth:2}),
 elite:Object.freeze({label:'天王',milliseconds:720,worlds:6,mistake:0,window:.75,nativeDepth:2}),
 champion:Object.freeze({label:'冠军',milliseconds:1200,worlds:8,mistake:0,window:.75,nativeDepth:2}),
}));
const aliases={wild:'wild','野生':'wild',novice:'novice',beginner:'novice',rookie:'novice','新手':'novice','新人':'novice','初学者':'novice',regular:'regular',normal:'regular','普通':'regular','普通训练家':'regular',veteran:'veteran',experienced:'veteran','资深':'veteran','精英训练家':'veteran',leader:'leader',gymleader:'leader','馆主':'leader','道馆馆主':'leader',elite:'elite',elitefour:'elite','天王':'elite','四天王':'elite',champion:'champion','冠军':'champion','地区冠军':'champion','联盟冠军':'champion'};
const clean=x=>String(x??'').trim().slice(0,180);
const norm=x=>clean(x).toLowerCase().replace(/[\s_\-·•]/g,'');
export const tierOf=x=>Object.hasOwn(aliases,norm(x))?aliases[norm(x)]:null;
const styles=new Set(['balanced','aggressive','defensive','setup','disruptive']);
function roleTier(text){const s=clean(text);if(!s||/(?:不是|并非|尚未|未曾|目标是|梦想是|想成为|击败过|挑战过|前往挑战).{0,8}(?:冠军|天王|馆主)/.test(s))return null;
 if(/冠军|champion/i.test(s))return'champion';if(/四天王|天王|elite\s*four/i.test(s))return'elite';if(/馆主|gym\s*leader/i.test(s))return'leader';if(/资深|老练|精英训练家|veteran/i.test(s))return'veteran';if(/新手|新人|初学|刚出发|novice|rookie/i.test(s))return'novice';return tierOf(s)}
export function resolveTrainerAI(cfg={},pkm={}){
 cfg=cfg&&typeof cfg==='object'?cfg:{};pkm=pkm&&typeof pkm==='object'?pkm:{};
 const ai=cfg.ai&&typeof cfg.ai==='object'?cfg.ai:{};
 const records=pkm.npcs?.records||{};const who=clean(cfg.opponent);
 const record=Object.values(records).find(r=>r&&clean(r.name)&&norm(who)===norm(r.name))||{};
 let tier=tierOf(ai.tier),source=tier?'scene-explicit':'';
 if(!tier){tier=roleTier(ai.rank||cfg.trainerRank||cfg.trainerClass);if(tier)source='scene-rank'}
 if(!tier){tier=tierOf(record.battleTier)||roleTier(record.trainerRank||record.trainerClass||record.role||record.title);if(tier)source='character-record'}
 if(!tier){tier=roleTier(who);if(tier)source='opponent-title'}
 if(!tier&&cfg.difficulty){tier=new Map([['easy','novice'],['normal','regular'],['hard','leader'],['expert','elite']]).get(cfg.difficulty)||null;if(tier)source='legacy-difficulty'}
 if(!tier){tier=cfg.type==='champion'?'champion':cfg.type==='elite'?'elite':cfg.type==='gym'?'leader':cfg.type==='league'?'veteran':cfg.type==='boss'?'veteran':'regular';source='encounter-default'}
 if(cfg.type==='wild'){tier='wild';source='wild'}
 const storyTier=tier;
 const rawIntent=clean(ai.intent).toLowerCase();const intent=['teaching','restrained','casual','serious'].includes(rawIntent)?rawIntent:'serious';
 const order=Object.keys(TIERS);let cap=intent==='teaching'?'regular':intent==='restrained'?'veteran':intent==='casual'?'leader':null;
 if(cap&&order.indexOf(tier)>order.indexOf(cap))tier=cap;
 return {version:AI_BUILD,tier,storyTier,label:TIERS[tier].label,style:styles.has(ai.style)?ai.style:'balanced',intent,source,reason:clean(ai.reason),opponent:who||'对手',settings:{...TIERS[tier]}};
}
export const STORY_AI_PROMPT='【对手AI·按剧情实力分档】每个 <pkm_battle> 可写 ai:{"tier":"novice|regular|veteran|leader|elite|champion","style":"balanced|aggressive|defensive|setup|disruptive","intent":"serious|casual|teaching|restrained","reason":"本场设定依据"}。tier 只依据人物档案与本场已成立的剧情实力，不因玩家等级、胜负需求或戏份自动升降：新人=novice，普通训练家=regular，资深=veteran，馆主=leader，天王=elite，冠军=champion。人物成长、失常、认真程度与指导赛以本场设定为准；放水/指导用 intent，不改阵容数值，不预定胜负。缺少明确依据不擅自标为冠军。正文不暴露这些内部术语。字段仅决定决策能力，不更改HP、能力、命中、伤害、道具或招式；不要让对手读取玩家未公开的招式、道具或当前选中的行动。';
