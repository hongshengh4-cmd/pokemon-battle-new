/* Read-only badge records. Art indices are NOT save IDs or acquisition rules.
 * Only fields explicitly containing earned records are inspected. No story,
 * location, inventory, totals, league qualification or writes are involved.
 */
export const BADGE_CATALOGUE = Object.freeze([
  ['灰色徽章','kanto','关都','indigo',1], ['蓝色徽章','kanto','关都','indigo',2],
  ['橙色徽章','kanto','关都','indigo',3], ['彩虹徽章','kanto','关都','indigo',4],
  ['粉红徽章','kanto','关都','indigo',5], ['金色徽章','kanto','关都','indigo',6],
  ['深红徽章','kanto','关都','indigo',7], ['绿色徽章','kanto','关都','indigo',8],
  ['飞翼徽章','johto','城都','silver',9], ['昆虫徽章','johto','城都','silver',10],
  ['常规徽章','johto','城都','silver',11], ['幻影徽章','johto','城都','silver',12],
  ['打击徽章','johto','城都','silver',13], ['钢铁徽章','johto','城都','silver',14],
  ['冰雪徽章','johto','城都','silver',15], ['升龙徽章','johto','城都','silver',16],
  ['樱花徽章','kanto','橘子群岛','orange',17], ['白浪徽章','kanto','橘子群岛','orange',18],
  ['轮宝徽章','kanto','橘子群岛','orange',19], ['琉璃徽章','kanto','橘子群岛','orange',20],
].map(([name,region,origin,leagueGroup,artId]) => Object.freeze({name,region,origin,leagueGroup,artId})));
const byName = new Map(BADGE_CATALOGUE.map(b => [b.name,b]));
const token = x => String(x).trim().toLowerCase().replace(/[\s\u3000_\-·・:：()（）【】\[\]「」『』]/g,'');
const aliases = new Map();
const aliasGroups = [
 ['灰色徽章','灰色','灰','灰徽章','岩石','岩石徽章','岩石系徽章','深灰徽章','boulder badge'],
 ['蓝色徽章','蓝色','蓝徽章','华蓝徽章','水之徽章','cascade badge'],
 ['橙色徽章','橙色','橘色徽章','橙徽章','雷电徽章','枯叶徽章','thunder badge'],
 ['彩虹徽章','彩虹','彩虹色徽章','玉虹徽章','rainbow badge'],
 ['粉红徽章','粉红','粉色','粉色徽章','粉红色徽章','浅红徽章','灵魂徽章','soul badge'],
 ['金色徽章','金色','金黄','金黄徽章','金徽章','金黄市徽章','marsh badge'],
 ['深红徽章','深红','红色徽章','火山徽章','红莲徽章','volcano badge'],
 ['绿色徽章','绿色','绿','绿徽章','大地徽章','常磐徽章','earth badge'],
 ['飞翼徽章','飞翼','飞行徽章','zephyr badge'], ['昆虫徽章','昆虫','虫系徽章','hive badge'],
 ['常规徽章','常规','标准徽章','平原徽章','plain badge'], ['幻影徽章','幻影','幽灵徽章','fog badge'],
 ['打击徽章','打击','格斗徽章','storm badge'], ['钢铁徽章','钢铁','钢系徽章','mineral badge'],
 ['冰雪徽章','冰雪','冰冻徽章','冰之徽章','glacier badge'], ['升龙徽章','升龙','龙之徽章','rising badge'],
 ['樱花徽章','樱花','櫻花徽章','coral-eye badge'], ['白浪徽章','白浪','sea ruby badge'],
 ['轮宝徽章','轮宝','輪寶徽章','spike shell badge'], ['琉璃徽章','琉璃','jade star badge'],
];
for (const [name,...names] of aliasGroups) for (const a of [name,...names]) aliases.set(token(a),name);
const fields = ['earned','obtained','acquired','owned','unlocked','status','has','获得','獲得'];
const negative = v => v === false || v === 0 || (typeof v === 'string' && /^(?:false|0|no|off|locked|unearned|pending|未获得|未獲得|尚未获得|尚未獲得|未取得|未解锁|待获得)$/i.test(v.trim()));
const positive = v => v === true || (typeof v === 'number' && Number.isFinite(v) && v > 0) || (typeof v === 'string' && /^(?:true|[1-9]\d*|yes|on|earned|obtained|已获得|已獲得|已取得)$/i.test(v.trim()));
const rejected = v => v.locked === true || fields.some(k => Object.hasOwn(v,k) && negative(v[k]));
function canonicalName(value,{legacyId=false}={}) {
  // Preserve explicit legacy identifiers ONLY in lists / id records. Never
  // extend 1–16 to art IDs 17–20, and never turn a scalar count into awards.
  if (legacyId && (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim())))) {
    const id = Number(value);
    return Number.isInteger(id) && id >= 0 && id <= 16 ? BADGE_CATALOGUE[id === 0 ? 0 : id-1].name : null;
  }
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > 80 || /[<>\r\n]/.test(name) || /未获得|未獲得|未取得|未解锁|待获得|待挑战|准备获得|想获得|尚未|pending|unearned|locked/i.test(name)) return null;
  const known = aliases.get(token(name)); if (known) return known;
  // Unknown commemorative records may be kept, but never fill a fixed slot.
  return /^[\p{L}\p{N}·・\s_-]+徽章$/u.test(name) ? name : null;
}
export function normalizeEarnedRecords(input,{defaultRegion='kanto'}={}) {
  const found = new Map(), visited = new WeakSet();
  const add = (value,raw={},legacyId=false) => {
    const name = canonicalName(value,{legacyId}); if (!name || found.has(name)) return;
    const known = byName.get(name), region = raw.region === 'johto' || raw.region === '城都' ? 'johto' : defaultRegion === 'johto' ? 'johto' : 'kanto';
    found.set(name,known ? {...known} : {name,region,origin:region === 'johto' ? '城都' : '关都',leagueGroup:null,artId:null});
  };
  const visit = (v,legacyId=false,depth=0) => {
    if (depth > 24) return;
    if (typeof v === 'string') { v.split(/[、,，;；|\n]+/).forEach(n => add(n,{},legacyId)); return; }
    if (typeof v === 'number') { if (legacyId) add(v,{},true); return; }
    if (!v || typeof v !== 'object' || visited.has(v)) return; visited.add(v);
    if (Array.isArray(v)) { v.forEach(x => visit(x,true,depth+1)); return; }
    if (rejected(v)) return;
    const name = v.name ?? v.badge ?? v.title ?? v.key ?? v.id;
    if (name != null) { add(name,v,legacyId || Object.hasOwn(v,'id')); return; }
    for (const [name,flag] of Object.entries(v)) {
      if (positive(flag)) add(name,{},true);
      else if (flag && typeof flag === 'object' && !Array.isArray(flag) && !rejected(flag) && fields.some(k => positive(flag[k]))) add(name,flag,true);
    }
  };
  visit(input);
  const records = [...found.values()];
  return [...BADGE_CATALOGUE.filter(b => found.has(b.name)).map(b => found.get(b.name)),...records.filter(b => !byName.has(b.name))];
}
export function normalizeBadges(pk) {
  // Only earned-record fields; world/location/stage/total are never read.
  const sources = [pk?.player?.badges,pk?.player?.badge,pk?.badges,pk?.gym?.badges];
  // Do not wrap sources in an array before parsing: an isolated numeric
  // total must not gain the legacy-list-ID interpretation.
  const records = sources.flatMap(s => normalizeEarnedRecords(s));
  return [...new Set(records.map(b => b.name))];
}
export function summarizeEarnedRecords(input) {
  const r = normalizeEarnedRecords(input);
  return {total:r.length,kanto:r.filter(b => b.region === 'kanto').length,johto:r.filter(b => b.region === 'johto').length,kantoGym:r.filter(b => b.leagueGroup === 'indigo').length,orangeGym:r.filter(b => b.leagueGroup === 'orange').length,johtoGym:r.filter(b => b.leagueGroup === 'silver').length};
}
export function planBadgeDisplay(input,{activeDex='kanto'}={}) {
  const records = normalizeEarnedRecords(input), owned = new Set(records.map(b => b.name));
  const group = (id,title,leagueGroup) => {
    const slots = BADGE_CATALOGUE.filter(b => b.leagueGroup === leagueGroup).map(b => ({...b,earned:owned.has(b.name)}));
    return {id,title,total:slots.length,earnedCount:slots.filter(b => b.earned).length,slots};
  };
  if (activeDex === 'johto') return {activeDex,groups:[group('johto','城都联盟徽章','silver')]};
  if (activeDex !== 'kanto') return {activeDex,groups:[]};
  const groups = [group('kanto','关都联盟徽章','indigo')];
  if (records.some(b => b.leagueGroup === 'orange')) groups.push(group('orange','橘子联盟徽章','orange'));
  return {activeDex,groups};
}
