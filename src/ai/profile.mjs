// SPDX-License-Identifier: MIT
// Scene-local difficulty policy. No roster/stat/HP/item mutation.
export const AI_BUILD='20261118-ai-elite-v3';
export const NATIVE_BUILD='20261118-foulplay-browser-ai-v1';
// `elite` has ALWAYS meant Elite Four in saved configurations. Do not rename it
// to Ace Trainer: the new, separate, backwards-compatible identifier is `ace`.
export const TIERS=Object.freeze(Object.assign(Object.create(null),{
 wild:Object.freeze({label:'野生本能',milliseconds:35,worlds:1,mistake:.32,window:.12,nativeDepth:1}),
 novice:Object.freeze({label:'新手',milliseconds:45,worlds:1,mistake:.24,window:.3,nativeDepth:1}),
 regular:Object.freeze({label:'普通训练家',milliseconds:100,worlds:2,mistake:.10,window:.55,nativeDepth:1}),
 veteran:Object.freeze({label:'资深训练家',milliseconds:220,worlds:3,mistake:.035,window:.7,nativeDepth:2}),
 leader:Object.freeze({label:'馆主',milliseconds:1200,worlds:6,mistake:.01,window:.75,nativeDepth:2,canonical:true,lookahead:2}),
 ace:Object.freeze({label:'精英训练家',milliseconds:5000,worlds:12,mistake:0,window:.75,nativeDepth:2,canonical:true,lookahead:3}),
 elite:Object.freeze({label:'天王',milliseconds:7000,worlds:16,mistake:0,window:.75,nativeDepth:2,canonical:true,lookahead:4}),
 champion:Object.freeze({label:'冠军',milliseconds:9000,worlds:20,mistake:0,window:.75,nativeDepth:2,canonical:true,lookahead:4}),
}));
const aliases={wild:'wild','野生':'wild',novice:'novice',beginner:'novice',rookie:'novice','新手':'novice','新人':'novice','初学者':'novice',regular:'regular',normal:'regular','普通':'regular','普通训练家':'regular',veteran:'veteran',experienced:'veteran','资深':'veteran','资深训练家':'veteran',leader:'leader',gymleader:'leader','馆主':'leader','道馆馆主':'leader',ace:'ace',acetrainer:'ace',elitetrainer:'ace','精英':'ace','精英训练家':'ace','大会冠军':'ace','联盟大会冠军':'ace',elite:'elite',elitefour:'elite','天王':'elite','四天王':'elite',champion:'champion','冠军':'champion','地区冠军':'champion','联盟冠军':'champion'};
const clean=x=>typeof x==='string'||typeof x==='number'?String(x).trim().slice(0,240):'';
const norm=x=>clean(x).toLowerCase().replace(/[\s_\-·•]/g,'');
export const tierOf=x=>Object.hasOwn(aliases,norm(x))?aliases[norm(x)]:null;
const order=Object.keys(TIERS),higher=(a,b)=>order.indexOf(a)>=order.indexOf(b)?a:b;
const styles=new Set(['balanced','aggressive','defensive','setup','disruptive']);
const denied=s=>/(?:不是|并非|尚未|未曾|目标是|梦想是|想成为|争取|力争|冲击|未进入|止步十六强).{0,12}(?:冠军|天王|馆主|精英|八强|四强|决赛)/.test(s);
function tournamentRank(s){
 if(denied(s))return null;
 // A tournament winner/quarterfinalist is not automatically the regional
 // Champion. Stronger, explicitly established titles are handled separately.
 return /(?:联盟|大会|大赛|锦标赛).{0,16}(?:八强|四强|决赛|冠亚军|亚军|季军|冠军|前[248]名)|(?:八强|四强|决赛).{0,8}(?:选手|参赛者)|(?:league|tournament).{0,16}(?:quarterfinal|semifinal|finalist|winner|top\s*[248])|(?:大会|大赛)(?:总)?冠军/i.test(s)?'ace':null;
}
function roleTier(text){const s=clean(text);if(!s||denied(s))return null;
 // References to somebody else's title, fan names and rumours are not an
 // established rank. In particular, challenging a Champion grants no title.
 if(/(?:挑战(?:过)?|击败(?:过)?|战胜(?:过)?|见过|听说|传闻|据说|自称|号称).{0,8}(?:冠军|天王|馆主)|(?:冠军|天王|馆主)(?:的)?(?:粉丝|迷|崇拜者|挑战者|追随者)|冠军之路/i.test(s))return null;
 if(/地区冠军|区域冠军|regional\s*champion|world\s*champion/i.test(s))return'champion';
 if(/四天王|天王|elite\s*four/i.test(s))return'elite';
 if(tournamentRank(s))return'ace';
 if(/现任.{0,8}冠军/i.test(s))return'champion';
 if(/冠军|champion/i.test(s))return'champion';
 if(/精英训练家|ace\s*trainer|elite\s*trainer/i.test(s))return'ace';
 if(/馆主|gym\s*leader/i.test(s))return'leader';
 if(/资深|老练|veteran/i.test(s))return'veteran';
 if(/新手|新人|初学|刚出发|novice|rookie/i.test(s))return'novice';return tierOf(s);
}
const stageAliases=new Map([
 ['quarterfinal','quarterfinal'],['quarterfinals','quarterfinal'],['roundof8','quarterfinal'],['top8','quarterfinal'],['八强','quarterfinal'],['八强赛','quarterfinal'],['四分之一决赛','quarterfinal'],['1/4决赛','quarterfinal'],
 ['semifinal','semifinal'],['semifinals','semifinal'],['roundof4','semifinal'],['top4','semifinal'],['四强','semifinal'],['四强赛','semifinal'],['半决赛','semifinal'],['1/2决赛','semifinal'],
 ['final','final'],['finals','final'],['决赛','final'],['总决赛','final'],['冠军赛','final'],['冠亚军决赛','final'],['thirdplace','third-place'],['季军赛','third-place'],
]);
export function leagueStageOf(cfg={}){
 const type=norm(cfg.type||cfg.encounter?.type),tour=cfg.tournament&&typeof cfg.tournament==='object'?cfg.tournament:{},league=cfg.league&&typeof cfg.league==='object'?cfg.league:{};
 const context=[cfg.title,cfg.eventName,cfg.competition,cfg.tournamentName,tour.name,league.name].map(clean).join(' ');
 const formal=type==='league'||type==='tournament'||norm(tour.type)==='league'||/联盟|大会|锦标赛|league|tournament/i.test(context);
 if(!formal||cfg.exhibition===true||cfg.rules?.exhibition===true||tour.exhibition===true)return null;
 const values=[cfg.leagueStage,cfg.tournamentStage,league.stage,tour.stage,tour.round,cfg.rules?.leagueStage,cfg.rules?.stage,cfg.stage,cfg.round];
 for(const value of values){const s=clean(value);if(!s||denied(s))continue;const exact=stageAliases.get(norm(s));if(exact)return exact;
  if(/八强赛|八强对决|四分之一决赛|quarter[- ]?final|round\s*of\s*8/i.test(s))return'quarterfinal';
  if(/四强赛|半决赛|semi[- ]?final|round\s*of\s*4/i.test(s))return'semifinal';
  if(/^(?:联盟|大会|大赛)?.{0,12}(?:总决赛|冠亚军决赛|决赛阶段)$/.test(s))return'final';
 }
 // A round NUMBER (e.g. round:8 = the eighth round) or teamSize:8 never
 // establishes a quarterfinal. Entrant count is explicit and separately named.
 const size=Number(tour.remainingEntrants??league.remainingEntrants??cfg.remainingEntrants);
 if(Number.isInteger(size)&&size>=2&&size<=8)return size<=2?'final':size<=4?'semifinal':'quarterfinal';
 if(!denied(context)){
  if(/八强赛|四分之一决赛/.test(context))return'quarterfinal';
  if(/四强赛|半决赛/.test(context))return'semifinal';
  if(/(?:总决赛|冠亚军决赛)|(?:大会|联盟|大赛).{0,8}决赛/.test(context))return'final';
 }
 return null;
}
export function resolveTrainerAI(cfg={},pkm={}){
 cfg=cfg&&typeof cfg==='object'?cfg:{};pkm=pkm&&typeof pkm==='object'?pkm:{};
 const ai=cfg.ai&&typeof cfg.ai==='object'?cfg.ai:{};
 const records=pkm.npcs?.records||{};const who=clean(cfg.opponent);
 const record=Object.values(records).find(r=>r&&clean(r.name)&&norm(who)===norm(r.name))||{};
 let tier=tierOf(ai.tier),source=tier?'scene-explicit':'';
 if(!tier){tier=roleTier(ai.rank||cfg.trainerRank||cfg.trainerClass);if(tier)source='scene-rank';}
 if(!tier){tier=tierOf(record.battleTier)||roleTier(record.trainerRank||record.trainerClass||record.role||record.title);if(tier)source='character-record';}
 if(!tier){tier=roleTier(who);if(tier)source='opponent-title';}
 if(!tier&&cfg.difficulty){tier=new Map([['easy','novice'],['normal','regular'],['hard','leader'],['expert','elite']]).get(cfg.difficulty)||null;if(tier)source='legacy-difficulty';}
 if(!tier){tier=cfg.type==='champion'?'champion':cfg.type==='elite'?'elite':cfg.type==='ace'?'ace':cfg.type==='gym'?'leader':cfg.type==='league'?'veteran':cfg.type==='boss'?'veteran':'regular';source='encounter-default';}
 const leagueStage=leagueStageOf(cfg),competitive=!!leagueStage&&cfg.type!=='wild';
 if(competitive){
  // A stale explicit low tier must not erase an independently established
  // Elite Four / regional Champion title in this formal competitive scene.
  const ranks=[roleTier(ai.rank),roleTier(cfg.trainerRank),roleTier(cfg.trainerClass),tierOf(record.battleTier),roleTier(record.trainerRank||record.trainerClass||record.role||record.title),roleTier(who)];
  for(const rank of ranks)if(rank==='elite'||rank==='champion')tier=higher(tier,rank);
  const raised=higher(tier,'ace');if(raised!==tier)source+=' + league-quarterfinal-floor';tier=raised;
 }
 if(cfg.type==='wild'){tier='wild';source='wild';}
 const storyTier=tier;
 const rawIntent=clean(ai.intent).toLowerCase();const intent=['teaching','restrained','casual','serious'].includes(rawIntent)?rawIntent:'serious';
 const cap=intent==='teaching'?'regular':intent==='restrained'?'veteran':intent==='casual'?'leader':null;
 if(cap&&order.indexOf(tier)>order.indexOf(cap))tier=cap;
 // Official quarterfinals onward are competitive: a stale low tier / casual
 // hint may not silently reduce the contestant below Ace. Higher established
 // Elite Four/Champion ranks are never downgraded by tournament inference.
 if(competitive)tier=higher(storyTier,'ace');
 return{version:AI_BUILD,tier,storyTier,label:TIERS[tier].label,style:styles.has(ai.style)?ai.style:'balanced',intent:competitive?'serious':intent,source,reason:clean(ai.reason),opponent:who||'对手',leagueStage:competitive?leagueStage:null,minimumTier:competitive?'ace':null,settings:{...TIERS[tier]}};
}
export const STORY_AI_PROMPT='【对手AI·按剧情实力分档】每个 <pkm_battle> 可写 ai:{"tier":"novice|regular|veteran|leader|ace|elite|champion","style":"balanced|aggressive|defensive|setup|disruptive","intent":"serious|casual|teaching|restrained","reason":"本场设定依据"}。顺序为新人=novice、普通训练家=regular、资深=veteran、馆主=leader、精英训练家=ace、天王=elite、地区冠军=champion。精英训练家高于馆主、低于天王；elite 仍专指天王，不能拿它代替 ace。正式联盟大会八强赛/半决赛/决赛写 type:"league" 及 leagueStage:"quarterfinal|semifinal|final"，参赛者最低 ace，不因缺字段或旧 difficulty 自动降为普通/资深；已成立的天王/地区冠军保留更高档。大会冠军不自动等于地区冠军；愿望、传闻、挑战过冠军不构成头衔。tier 只依据人物档案与本场已成立的剧情实力，不因玩家等级、胜负需求或戏份自动升降。指导/切磋用 intent，正式八强及以上不放水。不要改阵容数值或预定胜负。正文不暴露内部术语，不读取玩家未公开的招式、道具或当前行动。';
export const STORY_MECHANIC_PROMPT='【对手机制必须落到配置】仅当剧情已确立对手有对应资格/装备时，在 <pkm_battle> 的 team 对应宝可梦对象中写入实际配置，不能只在正文里提到机制。示例：超级进化 mechanic:"mega",megaForm:"steelixmega",item:"steelixite"；Ｚ招式 mechanic:"z",zType:"Electric",item:"electriumz"；极巨化 mechanic:"dynamax"（超极巨可另写 dynamaxForm:"gmax"）；太晶化 mechanic:"tera",teraType:"Fire"。megaForm 必须是该物种合法形态，Ｚ纯晶必须匹配实际可用招式；不能凭空给无资格的对手装备或额外机制。缺少形态/属性等信息时先补明已成立的设定，不猜测赠送。写入的是本场使用资格，由AI选择合法且有收益的时机；未实际回传前正文不要把尚未执行的机制、招式和胜负写成已发生。';
