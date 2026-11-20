import {ECOLOGY_DATA as DATA} from './local-ecology-data.mjs?v=20261118-local-ecology-v1';

// Pure location ecology. No host API, random global, map-display alias, team
// evolution, save mutation or region-wide fallback participates in selection.
export const LOCAL_ECOLOGY_VERSION = DATA.version;
export const LOCAL_HABITAT_LABELS = Object.freeze({
 land:'陆地',urban:'城镇户外',grass:'草地',forest:'林地',rock:'岩地',snow:'冰雪地带',
 cave:'洞窟',ruin:'废弃建筑／遗迹',tower:'塔内',garden:'花园植被区',shore:'沙滩',
 wetland:'湿地岸滩',river:'河流',lake:'湖泊／水潭',sea:'近海／海域',estuary:'入海口',
 freshwater:'淡水水域',unknownWater:'尚未明确的水边',indoor:'人类设施内'
});
export const RARITY_LABELS = Object.freeze({high:'高概率',medium:'中概率',low:'低概率',rare:'稀有',ultra:'极稀有'});
const WET = new Set(['river','lake','sea','estuary']);
const SITES = new Map(DATA.sites.map(s=>[s.name,s]));
const IDS = new Map(DATA.sites.map(s=>[s.id,s]));
const featureRules = {
 outskirts:/外围|外侧|郊外|城郊|镇郊|村外|镇外|城外|远端|野外|后山|后坡|周边|边缘|外面|外部|附近|庭院|后院|近海|外海|远海|海滩|沙滩|观测平台|观测海域|野生区/,
 deep:/深处|深林|最深|深层|内层|腹地|深水|深部|深山|幽深|深谷/,
 secluded:/僻静|安静|幽静|偏僻|隐蔽|隐秘|人迹|远离|幽深|深处|角落|幽暗/,
 backhill:/后山|后坡/,canopy:/树冠|树顶|林冠|高处枝|高树|高大古木|最高层|树梢/,
 treehole:/树洞|土穴|树穴/,flower:/花田|花丛|花海|花圃|花坛|葵田/,
 garden:/植物园|温室|花圃|花园|植被区/,entrance:/洞口|入口|谷口|出口|门口/,
 highland:/高地|高处|山顶|高海拔|山脊|高空|高层/,
 highSky:/高空|云层|云间|空域高处/,offshore:/外海|离岸|远海|离港|深海/,
 shipwreck:/沉船|船骸/,territory:/领地|族群核心/,
 pokemonTower:/宝可梦塔/,pokemonMansion:/宝可梦屋|宝可梦宅邸/,
 powerPlant:/发电厂|发电站|电厂/,intake:/进水口|取水口|进水管/,
 sewer:/下水道|地下管网|地下管道|污水通道/,
 trialForest:/试炼林|修行林|忍术林|学园外.*林|学园.*外围.*林/,
 burnedTower:/烧焦塔/,bellTower:/铃铛塔/,sproutTower:/喇叭芽之塔|喇叭芽塔/,
 farm:/哞哞牧场|牧场外围|牧场外|野生牧草|野外草甸/,
 dryPool:/干涸池|干池|干塘|干涸.*池底/,
 undergroundSpring:/地下涌泉|地下泉|涌泉通道/,
 restoredWetland:/复原湿地|复刻湿地|研究公园.*(?:湿地|水潭)|古环境.*(?:湿地|水潭)/,
 caveEntrance:/洞口|洞窟附近|洞窟旁|洞穴附近|洞穴旁/,
 riverbank:/河岸|河畔|岸边|林间树桩|河边|溪岸/,
 forestEdge:/林缘|森林边缘|林地边缘|密林外围/,
 dragonDen:/龙穴|龙之圣域/,
 centerOutskirts:/中心附近|中心外围|中心外|中心周边/
};
const FEATURE_LABELS = Object.freeze({outskirts:'外围的野生区域',deep:'深处',secluded:'偏僻安静处',backhill:'后山',canopy:'高层树冠',treehole:'隐蔽树洞',flower:'花田',garden:'花园植被区',entrance:'洞口／入口',highland:'高地',highSky:'高空云层',offshore:'离岸海域',shipwreck:'沉船区域',territory:'族群领地',pokemonTower:'宝可梦塔',pokemonMansion:'宝可梦屋',powerPlant:'发电厂',intake:'海水进水口',sewer:'下水道',trialForest:'试炼林区',burnedTower:'烧焦塔',bellTower:'铃铛塔外围',sproutTower:'喇叭芽之塔',farm:'哞哞牧场外围',dryPool:'干涸池底',undergroundSpring:'地下涌泉',restoredWetland:'研究公园复原湿地',caveEntrance:'温泉洞口附近',riverbank:'河岸枯木区',forestEdge:'林缘',dragonDen:'龙穴',centerOutskirts:'中心附近的户外冰区'});
const CONDITION_RULES = Object.freeze({
 butterflyBreeding:/巴大蝶.*(?:产卵季|繁殖季|求偶季)|(?:产卵季|繁殖季).*巴大蝶/,
 bulbasaurFestival:/妙蛙(?:种子|草).*祭典|不思议花园.*祭典|妙蛙种子进化祭/,
 ancientAwake:/古代宝可梦已苏醒|化石(?:盔|宝可梦).*已苏醒|古代族群.*苏醒/,
 magikarpMigration:/鲤鱼王洄游|洄游之夜|鲤鱼王.*(?:迁徙季|产卵季)/,
 chinchouMigration:/灯笼鱼迁徙|灯笼鱼.*迁徙季|迁徙季.*灯笼鱼/,
 calmWater:/风平浪静|风浪平缓|海流平稳|平静海面|无风浪|水流平稳/,
 calmSnow:/风雪停歇|风雪暂停|风雪短暂停歇|雪停|风雪已停/
});
const CONDITION_LABELS = Object.freeze({butterflyBreeding:'巴大蝶繁殖季',bulbasaurFestival:'妙蛙种子祭典',ancientAwake:'古代族群明确苏醒',magikarpMigration:'鲤鱼王洄游之夜',chinchouMigration:'灯笼鱼迁徙季',calmWater:'风浪／海流平稳',calmSnow:'风雪停歇'});
const facility = /宝可梦中心|神奇宝贝中心|精灵中心|研究所|实验室|旅馆|酒店|育幼院|保育园|训练所|道馆|商店|百货大楼|学校|学园|民居|阿彻的家|家中|卧室|客房|诊室|大厅|前台/;
const outdoors = /外围|外侧|外面|外部|附近|周边|庭院|后院|花园|后山|后坡|室外|户外|门口|楼外|院外|野外|海滩|沙滩|近海|远海|海域|海面|河边|河岸|湖边|林区|树林|森林|草坡|花田|湿地|观测平台/;
const regionName = x=>/橘子|橘子群岛|orange/i.test(String(x||''))?'orange':/城都|johto/i.test(String(x||''))?'johto':/关都|kanto/i.test(String(x||''))?'kanto':'';
function chineseRoute(n){const d={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};if(n==='十')return 10;if(n.includes('十')){const [a,b]=n.split('十');return (d[a]||1)*10+(d[b]||0);}return d[n]||n;}
const normalize = x=>String(x??'').normalize('NFKC').replace(/([一二三四五六七八九十]{1,3})号(道路|水路|航路)/g,(_,n,k)=>chineseRoute(n)+'号'+k).replace(/神奇宝贝|神奇寶貝|寶可夢/g,'宝可梦').replace(/常磐市/g,'常青市').replace(/常磐森林/g,'常青森林').replace(/喇叭芽塔/g,'喇叭芽之塔').replace(/(^|[^\d])(19|20|21|40|41)\s*号\s*(道路|航路)/g,'$1$2号水路').replace(/[\s·•・—–\-→>「」『』【】\[\]，,。:：/\\]/g,'').toUpperCase();
const named=[];
for(const s of DATA.sites)for(const a of s.aliases)named.push({alias:normalize(a),site:s,name:s.name,region:s.region});
for(const [name,region] of Object.entries(DATA.anchors))if(!SITES.has(name))named.push({alias:normalize(name),site:null,name,region});
const adjacency=new Map();
for(const [a,b] of DATA.edges){if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a).add(b);adjacency.get(b).add(a);}
function namedAt(text){
 const s=normalize(text),matches=[];
 for(const n of named){let pos=s.lastIndexOf(n.alias);while(pos>0&&/^\d/.test(n.alias)&&/\d/.test(s[pos-1]))pos=s.lastIndexOf(n.alias,pos-1);if(pos>=0)matches.push({...n,pos,end:pos+n.alias.length});}
 const maximal=matches.filter(a=>!matches.some(b=>b!==a&&b.alias.length>a.alias.length&&b.pos<=a.pos&&b.end>=a.end));
 maximal.sort((a,b)=>b.pos-a.pos||b.alias.length-a.alias.length||Number(!!b.site)-Number(!!a.site));
 return maximal[0]||null;
}
function hourAt(time){
 if(typeof time==='object'&&time!==null){if(time.hasTime===false&&time.h==null)return null;const h=Number(time.h??time.hour);return Number.isFinite(h)&&h>=0&&h<24?h:null;}
 const t=String(time||''),m=t.match(/(?:T|\s|日|^)(\d{1,2})\s*[:：时點点]/);if(m)return Number(m[1]);
 if(/凌晨/.test(t))return 2;if(/清晨|黎明|拂晓/.test(t))return 6;if(/黄昏|傍晚|日落/.test(t))return 18;if(/夜间|夜晚|深夜|晚上/.test(t))return 22;if(/白天|日间|中午|午后|上午|下午/.test(t))return 12;return null;
}
function periodAt(time){const h=hourAt(time);return h==null?'unknown':h>=5&&h<8?'dawn':h>=8&&h<17?'day':h>=17&&h<20?'dusk':'night';}
function weatherAt(value){const s=String(value||'');return /暴风雪/.test(s)?'snowstorm':/雷雨|雷暴|暴风雨|storm/i.test(s)?'storm':/风雪|下雪|雪天|降雪|snow/i.test(s)?'snow':/下雨|雨天|降雨|雨|rain/i.test(s)?'rain':/晴|sun|clear/i.test(s)?'clear':/雾|fog/i.test(s)?'fog':/大风|强风|烈风|狂风/.test(s)?'wind':'';}
function activeConditions(options,location){
 const v=options.conditions,explicit=Array.isArray(v)?v.join(' '):v&&typeof v==='object'?Object.keys(v).filter(k=>v[k]===true).join(' '):String(v||'');
 const text=String(location||'')+' '+explicit+' '+String(options.weather||'');const set=new Set();
 for(const [key,re] of Object.entries(CONDITION_RULES))if(re.test(text)||new RegExp('(?:^|[\\s,;，；])'+key+'(?:$|[\\s,;，；])','i').test(explicit))set.add(key);
 return set;
}
function featuresAt(location,options){
 const text=String(location||'')+' '+String(options.microhabitat||'');const set=new Set(Object.entries(featureRules).filter(([,re])=>re.test(text)).map(([k])=>k));
 if(set.has('offshore'))set.add('outskirts');
 if(set.has('highSky'))set.add('highland');
 if(set.has('deep'))set.add('secluded');
 if(set.has('centerOutskirts'))set.add('outskirts');
 return set;
}
const dryDefaults={urban:['urban','grass'],grass:['grass','forest'],forest:['forest','grass'],rock:['rock','grass'],snow:['snow','rock'],cave:['cave'],ruin:['ruin','cave'],shore:['shore','sea'],garden:['grass','forest','garden'],lake:['lake','wetland','grass','forest'],river:['river','wetland','grass','forest'],sea:['sea'],indoor:[]};
function sceneAt(location,options,primary){
 const text=String(location||''),detail=String(options.habitat||'')+' '+String(options.microhabitat||'')+' '+text;
 const features=featuresAt(text,options),signals=[];
 const add=(hab,re)=>{for(const m of detail.matchAll(new RegExp(re,'g')))signals.push({hab,pos:m.index,end:m.index+m[0].length});};
 add('cave','洞窟|洞内|山洞|岩窟|岩穴|岩洞|洞穴|冰洞|地下通道|地下岩道|地底|山腹');
 add('ruin','废墟|废弃建筑|荒废建筑|宝可梦屋(?:敷)?|宝可梦塔|烧焦塔|下水道|地下管网|地下管道|古堡闲置房间|神殿|幽暗石室');
 add('tower','喇叭芽之塔|喇叭芽塔');
 add('river','河边|河畔|河岸|河中|河道|河流|河面|河湾|小河|溪流|溪边|溪畔|溪涧|小溪|山涧|运河|水道|河滩|地下涌泉');
 add('lake','湖边|湖畔|湖泊|湖中|湖面|湖岸|湖心|青湖|水潭|池塘|水塘|蓄水池|水库|浅塘|静水潭');
 add('sea','海边|海岸|海域|海湾|海中|海面|海上|海水|海滨|近海|远海|外海|深海|港口|码头|珊瑚礁|礁石水域|水路');
 add('estuary','入海口|河口|海水进水口');
 add('shore','沙滩|海滩|沙岸');
 add('forest','森林|树林|林地|密林|丛林|林间|林缘|果林|树冠|树梢|林冠|树洞|试炼林|修行林|忍术林|林区');
 add('garden','庭院|后院|花园|公园植被区');
 add('grass','草地|草丛|草甸|草原|草坪|长草|花田|花海|草坡|花圃|草带');
 add('rock','岩坡|岩地|岩区|岩壁|岩层|岩脊|岩滩|碎石|崖壁|山道|裸岩|岩场');
 add('snow','雪线|冰原|冰谷|积雪|雪地|冰雪地|冰面|冰区|冰缘|雪山');
 add('wetland','湿地|泥滩|泥岸|芦苇丛|积水洼|淤泥浅滩');
 // A known site supplies its default only; its name is not a blanket grant
 // for every habitat named in a compound suffix. The rightmost subscene wins.
 const n=normalize(text),p=primary,site=p?.site;
 const baseEnd=p?.end||0;
 const suffix=p?String(n.slice(baseEnd)):n;
 const hasSpecificSuffix=!!suffix&&signals.some(s=>s.pos>=Math.max(0,detail.length-suffix.length-3));
 signals.sort((a,b)=>b.pos-a.pos||b.end-a.end);
 let specific=signals[0]?.hab;
 if(!options.habitat&&!options.microhabitat&&site&&!hasSpecificSuffix&&normalize(primary.alias)===normalize(site.name))specific=null;
 if(options.habitat){const h=String(options.habitat).toLowerCase();if(Object.hasOwn(LOCAL_HABITAT_LABELS,h))specific=h;}
 let base=specific||site?.env||(/(?:[1-9]|[1-4]\d)号水路/.test(text)?'sea':/道路|[0-9]+号路/.test(text)?'grass':/市|镇|村/.test(text)?'urban':null);
 let habitats=[...(dryDefaults[base]||[base].filter(Boolean))];
 if(specific){
  habitats=[specific];
  if(['river','lake','estuary'].includes(specific)&&/边|畔|岸|浅湾|河滩/.test(detail))habitats.push('wetland','grass','forest');
  if(specific==='sea'&&/海边|海岸|海滨|港口|码头/.test(detail))habitats.push('shore','urban');
  if(specific==='forest')habitats.push('grass');
  if(specific==='garden')habitats.push('urban','grass','forest');
  if(specific==='ruin'&&site?.env==='cave')habitats.push('cave');
  if(specific==='snow'&&site?.env==='cave'&&!/洞外|外面|外部/.test(detail))habitats.push('cave');
 }
 if(features.has('caveEntrance')||features.has('entrance')&&/洞口|洞窟入口|洞穴入口/.test(detail)){
  base='rock';habitats=['rock','grass'];features.add('entrance');
  // Zubat near the entrance and explicit entry-edge residents can still be
  // encountered; deep-cave rows are never admitted through this edge alone.
 }
 if(features.has('powerPlant')&&site?.name==='黑云市'){base='urban';habitats=['urban','ruin'];}
 if(features.has('intake')&&site?.name==='黑云市'){base='estuary';habitats=['estuary','ruin'];}
 if(features.has('restoredWetland')){base='lake';habitats=['lake','wetland','grass'];}
 if(features.has('dryPool')){base='rock';habitats=['rock'];}
 const particularAllowed=!facility.test(suffix)&&(features.has('pokemonTower')||features.has('pokemonMansion')||features.has('burnedTower')||features.has('sewer')||features.has('sproutTower')||site?.env==='garden'&&/温室|花圃|植被/.test(detail));
 const fpos=[...text.matchAll(new RegExp(facility.source,'g'))].at(-1)?.index;
 const outside=fpos!==undefined&&outdoors.test(text.slice(fpos+1));
 const humanInterior=(site?.env==='indoor'&&!outdoors.test(suffix+' '+String(options.habitat||'')+' '+String(options.microhabitat||'')))||(fpos!==undefined&&!outside);
 const explicitInterior=/室内|大厅|客房|卧室|诊室|前台|研究室|室中|屋内|内部/.test(suffix)&&facility.test(text);
 if((humanInterior||explicitInterior)&&!particularAllowed){base='indoor';habitats=[];}
 const ambiguous=/水边|岸边|水域|水畔/.test(detail)&&!specific&&!['lake','river','sea','shore'].includes(site?.env);
 if(ambiguous){base='unknownWater';habitats=[];}
 return {habitat:base||'land',habitats:[...new Set(habitats)],features,specific:!!specific,ambiguous,humanInterior:(humanInterior||explicitInterior)&&!particularAllowed};
}
function reasonsFor(e,scene,options,ignoreAvailability=false){
 const reasons=[];if(!e.h.some(h=>scene.habitats.includes(h)))reasons.push('子环境不符');
 for(const n of e.needs||[])if(!scene.features.has(n))reasons.push('需'+(FEATURE_LABELS[n]||n));
 if(ignoreAvailability)return reasons;
 const period=periodAt(options.time),weather=weatherAt(options.weather),conditions=activeConditions(options,options.location);
 if(e.time&&!e.time.includes(period))reasons.push('仅'+e.time.map(t=>({day:'白天',dawn:'清晨',dusk:'黄昏',night:'夜间'})[t]).join('／'));
 const cond=e.condition==='calmWater'?'calmWater':e.condition;
 if(cond&&!conditions.has(cond))reasons.push('需'+(CONDITION_LABELS[cond]||cond));
 if(e.method==='headbutt'&&!/headbutt|头锤|头撞|撞树/i.test(String(options.method||'')+' '+String(options.conditions||'')+' '+String(options.location||'')))reasons.push('需实际头锤撞树');
 if(e.weather&&!(e.weather===weather||e.weather==='snow'&&weather==='snowstorm'))reasons.push(e.weather==='storm'?'仅雷雨天气':'仅风雪天气');
 if(e.avoidWeather&&(e.avoidWeather===weather||e.avoidWeather==='rain'&&weather==='storm'||e.avoidWeather==='storm'&&weather==='wind'))reasons.push('当前天气会躲藏');
 return reasons;
}
function entriesFor(site,scene,options,ignoreAvailability=false){
 if(site.blocked)return [];
 const out=[];
 for(const e of site.entries){if(reasonsFor(e,scene,options,ignoreAvailability).length)continue;
  const matched=e.h.filter(h=>scene.habitats.includes(h));const fishRequired=!!e.waterborne&&matched.some(h=>WET.has(h))&&!matched.some(h=>!WET.has(h));
  let weight=DATA.weights[e.r]||1;
  if(!ignoreAvailability){const period=periodAt(options.time),weather=weatherAt(options.weather);if(e.preferTime&&period!=='unknown')weight*=e.preferTime===period?1.6:.7;if(e.preferWeather&&weather===e.preferWeather)weight*=1.8;}
  out.push({species:e.s,rarity:e.r,weight,min:site.levels[0],max:site.levels[1],fishRequired,habitat:matched.find(h=>fishRequired?WET.has(h):!WET.has(h))||matched[0],sourceId:site.id,sourceName:site.name,sourceLine:e.line,zone:e.zone||'',...(e.time?{time:e.time}:{}),...(e.condition?{condition:e.condition}:{}),...(e.method?{method:e.method}:{})});
 }
 return out;
}
function mergeEntries(entries){
 const map=new Map();for(const e of entries){const key=e.species+'|'+e.fishRequired;const old=map.get(key);if(!old||e.weight>old.weight)map.set(key,e);}return [...map.values()];
}
function inferWater(scene,sources){
 if(!scene.ambiguous)return scene;
 const water=new Set(sources.flatMap(s=>s.entries.flatMap(e=>e.waterborne?e.h.filter(h=>WET.has(h)):[])));
 const marine=water.has('sea')||water.has('estuary'),fresh=water.has('river')||water.has('lake');
 if(marine&&fresh||!water.size)return scene;
 return {...scene,habitat:marine?'sea':'freshwater',habitats:marine?['sea','estuary','shore']:['river','lake','wetland','grass','forest'],ambiguous:false};
}
function nearSites(name,region,scene,options){
 const visited=new Set([name]),queue=[[name,0]],found=[];let firstDistance=Infinity;
 while(queue.length){const [n,d]=queue.shift();if(d>3||d>firstDistance)continue;
  const s=SITES.get(n);if(d>0&&s&&s.region===region&&!s.blocked&&entriesFor(s,inferWater(scene,[s]),options,true).length){found.push({site:s,distance:d});firstDistance=d;continue;}
  if(d===3)continue;
  for(const next of adjacency.get(n)||[]){if(visited.has(next))continue;const reg=SITES.get(next)?.region||DATA.anchors[next];if(reg!==region)continue;visited.add(next);queue.push([next,d+1]);}
 }
 return found;
}
/** A source table that is recorded but currently empty NEVER borrows another
 * city's pool. Unknown locations DO borrow nearby compatible reference sites
 * when an actual parent, adjacency edge or explicit nearby anchor identifies
 * them. Display-map aliases and episode chronology are not geographic proof. */
export function resolveLocalEcology(location,options={}){
 const loc=String(location||'').trim();options={...options,location:loc};
 const empty={version:LOCAL_ECOLOGY_VERSION,loc,habitat:'land',habitatLabel:'陆地',entries:[],residentEntries:[],table:[],waterTable:null,sources:[],mode:'unresolved',withheld:[]};
 if(!loc)return {...empty,reason:'还不知道当前位置，请先记录所在地点。'};
 const primary=namedAt(loc);let scene=sceneAt(loc,options,primary);
 const base={...empty,habitat:scene.habitat,habitatLabel:LOCAL_HABITAT_LABELS[scene.habitat]||'当地环境',habitats:scene.habitats};
 const site=primary?.site;
 if(site?.blocked)return {...base,mode:'reference',siteId:site.id,sourceName:site.name,region:site.region,reason:site.blocked};
 if(/保护区|禁止捕捉|禁止捕获|禁捕区|保育中的|驯养区|饲养区|救助区/.test(loc))return {...base,reason:'这里是保护／管理中的区域，不生成普通可战或可捕的野生遭遇。'};
 if(scene.humanInterior)return {...base,reason:'当前位置是人类设施内部；表中的外围野生族群不会刷进室内。到明确的庭院、外围林地或水域后再查看。'};
 let sources=[],mode='unresolved',region=primary?.region||regionName(options.region)||regionName(loc);
 if(site){sources=[{site,distance:0}];mode=normalize(loc)===normalize(primary.alias)?'reference':'subarea';}
 else{
  if(primary)sources=nearSites(primary.name,region,scene,options);
  if(!sources.length){const explicit=Array.isArray(options.nearbyLocation)?options.nearbyLocation:[options.nearbyLocation];for(const value of explicit){const n=namedAt(value);if(!n||region&&region!==n.region)continue;region=region||n.region;if(n.site&&!n.site.blocked&&entriesFor(n.site,inferWater(scene,[n.site]),options,true).length)sources.push({site:n.site,distance:1,explicit:true});else if(n.name)sources.push(...nearSites(n.name,region,scene,options));}}
  if(sources.length)mode='nearby';
 }
 if(!sources.length){const ambiguous=/无名岛/.test(loc)&&!site;return {...base,region,reason:ambiguous?'无名岛有 EP093、EP099、EP111 三份不同记录。请补上集数、岛屿特征或明确的邻近地点，不能任选一个岛的族群。':'本地点未收录，暂时也无法确认同地区相邻且环境相符的参考地点。请补充所在道路、岛屿、附近城镇或“附近地点”，确认后会按附近分布刷新。'};}
 scene=inferWater(scene,sources.map(x=>x.site));
 if(scene.ambiguous)return {...base,region,mode,sourceName:sources.map(x=>x.site.name).join('／'),reason:'这里同时有不同类型水域，仅写“水边”还不够。请注明河流、湖泊或海域，避免混用当地淡水和近海族群。'};
 const all=sources.flatMap(({site})=>entriesFor(site,scene,options)),residents=sources.flatMap(({site})=>entriesFor(site,scene,options,true));
 const entries=mergeEntries(all),residentEntries=mergeEntries(residents);
 const withheld=[];for(const {site:s} of sources)for(const e of s.entries){const why=reasonsFor(e,scene,options);if(why.length&&!why.includes('子环境不符'))withheld.push({species:e.s,why:why.join('；')});}
 const table=entries.map(e=>[e.species,e.min,e.max,e.weight]),waterTable=entries.filter(e=>e.fishRequired).map(e=>[e.species,e.min,e.max,e.weight]);
 const sourceNames=sources.map(x=>x.site.name),reason=entries.length?'':withheld.length?'当地有分布记录，但当前子环境、时段或明确条件尚不符合：'+[...new Set(withheld.map(x=>x.why))].slice(0,4).join('；')+'。':'当地表没有记录与当前子环境相符的普通野生族群；不会从别的城镇或通用池补入。';
 return {...base,mode,region:region||sources[0].site.region,siteId:site?.id||null,sourceName:sourceNames.join('／'),sources:sources.map(x=>({id:x.site.id,name:x.site.name,region:x.site.region,distance:x.distance,explicit:!!x.explicit})),habitat:scene.habitat,habitatLabel:LOCAL_HABITAT_LABELS[scene.habitat]||'当地环境',habitats:scene.habitats,period:periodAt(options.time),entries,residentEntries,table,waterTable:waterTable.length?waterTable:null,withheld,reason};
}
export function ecologySummary(ecology){
 const e=ecology,header='【所在地野生分布·以用户地点表为准】';if(!e)return header+'\n尚无明确位置，不编造野生遭遇。';
 const lead=`位置：${e.loc||'未知'}；环境：${e.habitatLabel||'待确认'}。`;
 if(e.reason&&!e.entries.length)return header+'\n'+lead+e.reason+' 不把有主、受保护、剧情专属个体变成普通野生，也不凭等级替换成表外进化型。';
 const tiers=Object.keys(RARITY_LABELS).map(r=>{const names=[...new Set(e.entries.filter(x=>x.rarity===r).map(x=>x.species))];return names.length?RARITY_LABELS[r]+'：'+names.join('、'):'';}).filter(Boolean);
 return [header,lead+(e.mode==='nearby'?`未收录地点，按同地区相邻的${e.sourceName}中环境相符的记录回退。`:`采用${e.sourceName}的当地记录。`),...tiers,'只在当前符合条件的物种中描述常规遭遇；水域个体先钓起再对战／捕捉。所有权与保护规则按具体个体区分；提及某训练家持有不代表删除当地明确的野生族群，也不把该训练家的个体复制进池。等级不会令物种自动变成表外进化型。'].join('\n');
}
export function canRetainFishingPending(ecology,pending){
 if(!ecology||!pending||pending.location!==ecology.loc)return false;
 const species=DATA.speciesAliases[pending.species]||pending.species;
 // The night/weather in which an individual was landed may have passed. It
 // remains the SAME pending catch, but must still belong to this locality and
 // this water subscene. A migrated universal-pool fish is never admitted.
 return ecology.residentEntries.some(e=>e.species===species&&e.fishRequired&&(!pending.sourceId||pending.sourceId===e.sourceId)&&(!e.condition||pending.ecologyVersion===LOCAL_ECOLOGY_VERSION||ecology.entries.some(x=>x.species===species&&x.sourceLine===e.sourceLine)));
}
export const localEcologyStatistics=Object.freeze({sites:DATA.sites.length,sourceSections:DATA.sites.reduce((n,s)=>n+s.lines.length,0),weights:Object.freeze({...DATA.weights}),sourceSHA256:DATA.sourceSHA256});
