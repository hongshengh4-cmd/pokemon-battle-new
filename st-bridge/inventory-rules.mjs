// Pure inventory identity/transition helpers. No host, storage or rendering writes.
export const INVENTORY_PATCH_VERSION = 'journey-inventory-v1';
const text = value => String(value ?? '').normalize('NFKC').trim();
const BALL_NAMES = new Set([
  '精灵球','超级球','高级球','大师球','狩猎球','先机球','速度球','黑暗球','计时球','重复球','捕网球','巢穴球','潜水球','豪华球','治愈球','纪念球',
  '友友球','等级球','诱饵球','沉重球','甜蜜球','月亮球','竞赛球','公园球','梦境球','究极球','珍贵球','贵重球',
  '羽毛球','飞翼球','飞羽球','沉重球(洗翠)','超级球(洗翠)','高级球(洗翠)','精灵球(洗翠)','起源球',
]);
const BALL_IDS = new Set(['pokeball','greatball','ultraball','masterball','safariball','quickball','fastball','duskball','timerball','repeatball','netball','nestball','diveball','luxuryball','healball','premierball','friendball','levelball','lureball','heavyball','loveball','moonball','sportball','parkball','dreamball','beastball','cherishball','featherball','wingball','jetball','leadenball','gigatonball','originball']);
export function isMoveMachineName(value) {
  const s = text(value);
  // A bare legacy “学习机” alias is not enough: require a move/name after it.
  return /^(?:(?:招式|技能)?学习(?:机|器)|技能机|招式记录|秘传(?:招式)?学习(?:机|器))[\s·•:：\-—(【\[]*[^\s·•:：\-—(【\]]/u.test(s)
    || /^(?:TM|TR|HM)\s*\d{1,3}(?:\b|[\s·•:：\-—(【\[])/i.test(s);
}
export function isCaptureBallName(value) {
  const s = text(value);
  if (isMoveMachineName(s)) return false;
  return BALL_NAMES.has(s) || BALL_IDS.has(s.toLowerCase().replace(/[\s_-]+/g, ''));
}
const DEX_NAMES = Object.freeze({kanto:'关都图鉴',johto:'城都图鉴'});
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const hasItem = (pkm, name) => { const n = Number(pkm?.player?.bag?.[name]); return Number.isFinite(n) && n > 0; };
export function activeRegionalDex(pkm) {
  return pkm?.integration?.activeRegionalDex === 'johto' && hasItem(pkm, DEX_NAMES.johto) ? 'johto' : 'kanto';
}
export function regionalDexUseState(pkm, value) {
  const name = String(value ?? '').trim(), region = Object.keys(DEX_NAMES).find(k => DEX_NAMES[k] === name);
  if (!region) return {allowed:false,restore:false,name,region:null,reason:'不是地区图鉴道具'};
  const from = activeRegionalDex(pkm), owned = hasItem(pkm, name);
  // Kanto was the original always-available status UI. An old Johto save may
  // have never registered that original device in its bag. Recover ONLY it,
  // on an explicit confirmed return; never grant an unowned Johto device.
  const restore = !owned && region === 'kanto' && from === 'johto';
  return {allowed:owned || restore,restore,name,region,from,reason:owned || restore ? '' : '尚未获得' + name};
}
export function applyRegionalDexSwitch(pkm, value) {
  const state = regionalDexUseState(pkm, value);
  if (!state.allowed) throw new Error(state.reason);
  if (!object(pkm) || !object(pkm.player) || !object(pkm.player.bag)) throw new Error('背包数据尚未就绪');
  const sourceName = DEX_NAMES[state.from];
  if (!hasItem(pkm, sourceName)) pkm.player.bag[sourceName] = 1;
  if (state.restore) pkm.player.bag[state.name] = 1;
  if (!object(pkm.integration)) pkm.integration = {};
  pkm.integration.activeRegionalDex = state.region;
  return {region:state.region,previous:state.from,restored:state.restore};
}
