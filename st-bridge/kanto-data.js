// 宝可梦·关都之旅 · 外置桥接数据（v1.3.2 起；v1.3.8 加赛制表；v1.3.9 加伙伴阵容表）
// 地图坐标、附近野生遭遇表、初始伙伴、道具图标映射。全部为同人整理数据。

export const VERSION = '1.3.48-repel-confirm-scroll';

/* ---------- 关都地图（示意，坐标为 0~100 的画布比例） ---------- */
export const MAP_NODES = [
  { id: 'pallet', name: '真新镇', x: 22, y: 76, kind: 'town', alias: ['真新', '大木研究所', '1号道路'] },
  { id: 'viridian', name: '常青市', x: 22, y: 58, kind: 'city', alias: ['常青', '常磐', '22号道路'] },
  { id: 'vforest', name: '常青森林', x: 22, y: 42, kind: 'wild', alias: ['常磐森林'] },
  { id: 'pewter', name: '深灰市', x: 22, y: 27, kind: 'city', alias: ['深灰', '尼比', '3号道路'] },
  { id: 'mtmoon', name: '月见山', x: 40, y: 22, kind: 'wild', alias: ['月见'] },
  { id: 'cerulean', name: '华蓝市', x: 60, y: 22, kind: 'city', alias: ['华蓝', '24号道路', '25号道路', '金珠桥', '正辉的灯塔'] },
  { id: 'saffron', name: '金黄市', x: 60, y: 42, kind: 'city', alias: ['金黄', '金黄道馆'] },
  { id: 'celadon', name: '玉虹市', x: 42, y: 42, kind: 'city', alias: ['玉虹', '7号道路', '16号道路', '自行车道'] },
  { id: 'lavender', name: '紫苑镇', x: 80, y: 42, kind: 'town', alias: ['紫苑', '宝可梦塔', '8号道路', '10号道路'] },
  { id: 'vermilion', name: '枯叶市', x: 60, y: 62, kind: 'city', alias: ['枯叶', '圣特安努号', '6号道路', '11号道路', '地鼠洞穴'] },
  { id: 'fuchsia', name: '浅红市', x: 48, y: 84, kind: 'city', alias: ['浅红', '狩猎地带', '宝可梦保护区', '18号道路'] },
  { id: 'seafoam', name: '双子岛', x: 34, y: 92, kind: 'wild', alias: ['双子'] },
  { id: 'cinnabar', name: '红莲镇', x: 22, y: 92, kind: 'town', alias: ['红莲', '红莲岛', '宝可梦屋敷'] },
  { id: 'indigo', name: '石英高原', x: 7, y: 30, kind: 'league', alias: ['石英', '石英大会', '宝可梦联盟', '23号道路', '冠军之路'] },
];
export const MAP_EDGES = [
  ['pallet', 'viridian'], ['viridian', 'vforest'], ['vforest', 'pewter'], ['pewter', 'mtmoon'], ['mtmoon', 'cerulean'],
  ['cerulean', 'saffron'], ['saffron', 'vermilion'], ['saffron', 'celadon'], ['saffron', 'lavender'], ['cerulean', 'lavender'],
  ['lavender', 'fuchsia'], ['celadon', 'fuchsia'], ['vermilion', 'lavender'], ['fuchsia', 'seafoam'], ['seafoam', 'cinnabar'],
  ['cinnabar', 'pallet'], ['viridian', 'indigo'],
];
// 动画原创地点 → 最接近的地图城镇（只用于地图高亮与遭遇表，不代表官方设定）
export const ANIME_PLACES = {
  '宝可梦研究学院': 'cerulean', '宝可梦乡': 'cerulean', '小火龙等待的岩石': 'cerulean', '杰尼龟军团的小镇': 'vermilion',
  '巨大宝可梦之岛': 'vermilion', '蓝普尔其': 'vermilion', '鸠羽港': 'vermilion', '少女峡': 'vermilion', '巴大蝶告别的海崖': 'vermilion',
  '火暴猴的野餐地': 'lavender', '哎呀呀镇': 'celadon', '美容街': 'celadon', '斗魂道馆': 'saffron', '黑云市': 'celadon', '奥兹高水坝': 'celadon',
  '拉拉美村': 'fuchsia', '阳光镇': 'fuchsia', '伊美蒂的演艺屋': 'fuchsia', '马察市': 'fuchsia', '皮卡丘的森林': 'fuchsia', '史顿镇': 'fuchsia',
  '进化山': 'fuchsia', '卡比兽堵住的泉源': 'fuchsia', '黑暗市': 'fuchsia', '椰蛋森林': 'fuchsia', '松藻镇': 'fuchsia', '霓虹镇': 'fuchsia',
  '大傻谷': 'fuchsia', '杜医生的医院': 'fuchsia', '小次郎的家': 'fuchsia', '大葱鸭的树林': 'fuchsia', '波克比诞生的城市': 'fuchsia',
  '不思议花园': 'fuchsia', '玩偶镇': 'fuchsia', '樱花育幼院': 'fuchsia', '警犬训练所': 'fuchsia', '阿彻的家': 'fuchsia',
  '宝可梦联盟检定中心': 'fuchsia', '大姐姐抚养家所在的港镇': 'fuchsia', '水箭龟之岛': 'cinnabar', '宝可梦马戏团': 'viridian',
  '比努': 'pallet', '村雨植物园': 'pallet', '湖边露营区': 'viridian', '好莱坞': 'viridian', '米亚查山': 'viridian', '波多罗山': 'viridian',
  '山间捷径': 'indigo', '小明的道馆': 'pewter',
};

/* ---------- 附近野生遭遇表：[中文名, 最低等级, 最高等级, 权重] ---------- */
export const ENCOUNTERS = {
  pallet: [['波波', 2, 5, 4], ['小拉达', 2, 5, 4], ['烈雀', 3, 5, 2]],
  viridian: [['波波', 3, 6, 3], ['小拉达', 3, 6, 3], ['烈雀', 3, 6, 2], ['尼多兰', 3, 6, 2], ['尼多朗', 3, 6, 2]],
  vforest: [['绿毛虫', 3, 6, 4], ['独角虫', 3, 6, 4], ['铁甲蛹', 4, 7, 2], ['铁壳蛹', 4, 7, 2], ['波波', 4, 7, 2], ['皮卡丘', 4, 7, 1]],
  pewter: [['烈雀', 6, 10, 3], ['小拉达', 6, 10, 3], ['尼多兰', 6, 10, 2], ['尼多朗', 6, 10, 2], ['胖丁', 7, 11, 1], ['穿山鼠', 7, 11, 2]],
  mtmoon: [['超音蝠', 7, 12, 4], ['小拳石', 7, 12, 3], ['派拉斯', 8, 12, 2], ['皮皮', 8, 12, 1]],
  cerulean: [['走路草', 9, 14, 3], ['喇叭芽', 9, 14, 3], ['阿柏蛇', 9, 14, 2], ['凯西', 10, 14, 1], ['可达鸭', 10, 14, 2], ['绿毛虫', 9, 12, 2]],
  vermilion: [['喵喵', 12, 18, 2], ['地鼠', 12, 18, 3], ['走路草', 12, 18, 2], ['烈雀', 12, 18, 2], ['大舌贝', 13, 18, 1], ['小拉达', 12, 18, 2]],
  saffron: [['波波', 14, 22, 2], ['喵喵', 14, 22, 2], ['凯西', 14, 20, 1], ['卡蒂狗', 15, 22, 2], ['六尾', 15, 22, 2], ['催眠貘', 15, 22, 2]],
  celadon: [['胖丁', 14, 24, 2], ['卡蒂狗', 15, 24, 2], ['六尾', 15, 24, 2], ['臭泥', 15, 24, 2], ['走路草', 14, 22, 2], ['喇叭芽', 14, 22, 2]],
  lavender: [['鬼斯', 15, 22, 3], ['卡拉卡拉', 15, 22, 2], ['超音蝠', 15, 22, 2], ['小磁怪', 16, 22, 2]],
  fuchsia: [['尼多力诺', 20, 28, 2], ['尼多娜', 20, 28, 2], ['毛球', 18, 26, 2], ['蛋蛋', 20, 28, 2], ['肯泰罗', 22, 30, 1], ['飞天螳螂', 22, 30, 1], ['凯罗斯', 22, 30, 1], ['袋兽', 22, 30, 1]],
  seafoam: [['小海狮', 28, 36, 3], ['大嘴蝠', 28, 36, 3], ['呆呆兽', 28, 36, 2], ['墨海马', 28, 34, 2]],
  cinnabar: [['小火马', 30, 40, 3], ['鸭嘴火兽', 32, 40, 1], ['卡蒂狗', 30, 38, 2], ['角金鱼', 30, 38, 2], ['毒刺水母', 30, 38, 2]],
  indigo: [['尼多力诺', 35, 45, 2], ['尼多娜', 35, 45, 2], ['阿柏怪', 36, 46, 2], ['大岩蛇', 36, 46, 2], ['大嘴蝠', 35, 45, 2], ['豪力', 36, 46, 1]],
};
export const WATER_ENCOUNTERS = [['鲤鱼王', 5, 25, 4], ['毒刺水母', 10, 30, 3], ['海星星', 10, 30, 2], ['墨海马', 10, 30, 2], ['角金鱼', 10, 30, 2], ['蚊香蝌蚪', 8, 25, 2]];
export const INDOOR_WORDS = ['宝可梦中心', '研究所', '道馆', '家', '屋', '店', '商店', '酒店', '旅馆', '餐厅', '船舱', '会场', '运动场', '医院', '教室', '电视台', '大楼'];
export const WATER_WORDS = ['海', '港', '湖', '河', '水边', '岸', '湾', '岛', '码头', '瀑布', '船'];

/* ---------- 初始伙伴（Lv5，招式为官方简体中文名） ---------- */
export const STARTERS = {
  妙蛙种子: { ability: '茂盛', moves: ['撞击', '叫声', null, null], gender: 'M', desc: '草/毒 · 性格温和，背上的种子会随成长发芽。' },
  小火龙: { ability: '猛火', moves: ['抓', '叫声', null, null], gender: 'M', desc: '火 · 尾巴的火焰代表生命力，有点急性子。' },
  杰尼龟: { ability: '激流', moves: ['撞击', '摇尾巴', null, null], gender: 'M', desc: '水 · 缩进壳里防御，喜欢恶作剧。' },
  皮卡丘: { ability: '静电', moves: ['电击', '叫声', null, null], gender: 'M', desc: '电 · 不喜欢待在精灵球里，脾气很倔。' },
  小拉达: { ability: '逃跑', moves: ['撞击', '摇尾巴', null, null], gender: 'M', desc: '一般 · 精力旺盛，什么都想啃一啃。' },
  波波: { ability: '锐利目光', moves: ['撞击', '泼沙', null, null], gender: 'F', desc: '一般/飞行 · 温顺，方向感很好。' },
  尼多兰: { ability: '毒刺', moves: ['叫声', '撞击', null, null], gender: 'F', desc: '毒 · 胆子小，但毒针很厉害。' },
  伊布: { ability: '逃跑', moves: ['撞击', '摇尾巴', null, null], gender: 'M', desc: '一般 · 拥有多种进化可能的稀有宝可梦。' },
};
export const MODE_STARTERS = {
  同行模式: ['妙蛙种子', '小火龙'], // 原剧情中小茂已先领走唯一的杰尼龟
  小智模式: ['皮卡丘'],
  沙盒模式: ['小拉达', '波波', '尼多兰', '伊布'],
};
export const MODE_INFO = {
  同行模式: { icon: '🤝', start: { time: '第1年 5月22日 07:00', location: '真新镇·大木研究所' }, desc: '你是同一天从真新镇出发的新人训练家。小智、小霞、小刚都是 NPC，可以同行，也可以各走各的路。', greeting: 0 },
  小智模式: { icon: '🧢', start: { time: '第1年 5月22日 07:00', location: '真新镇·家中' }, desc: '你扮演小智的位置，从家中的清晨开始。皮卡丘先预登记，到研究所的节点由你确认领取，不会提前进入队伍。', greeting: 1 },
  沙盒模式: { icon: '🗺️', start: { time: '第1年 5月22日 07:00', location: '真新镇·大木研究所后院' }, desc: '你是关都的一名训练家，自由旅行。固定事件仍按节点与时间处理；不在场只可获知合理消息。', greeting: 2 },
};
export const NATURES = ['勤奋', '大胆', '内敛', '温和', '胆小', '怕寂寞', '坦率', '慢吞吞', '温顺', '急躁', '固执', '淘气', '害羞', '慎重', '马虎', '爽朗', '顽皮', '乐天', '浮躁', '天真', '勇敢', '悠闲', '冷静', '自大', '认真'];

/* ---------- v1.3.4：性格 / 个体值 / 叫声 ---------- */
// 性格 → [提高的能力, 降低的能力]；勤奋、坦率、害羞、浮躁、认真为无修正性格
export const NATURE_EFFECT = {
  固执: ['atk', 'spa'], 内敛: ['spa', 'atk'], 爽朗: ['spe', 'spa'], 胆小: ['spe', 'atk'], 大胆: ['def', 'atk'], 温和: ['spd', 'atk'],
  淘气: ['def', 'spa'], 慎重: ['spd', 'spa'], 勇敢: ['atk', 'spe'], 冷静: ['spa', 'spe'], 悠闲: ['def', 'spe'], 自大: ['spd', 'spe'],
  怕寂寞: ['atk', 'def'], 慢吞吞: ['spa', 'def'], 急躁: ['spe', 'def'], 天真: ['spe', 'spd'], 顽皮: ['atk', 'spd'], 马虎: ['spa', 'spd'],
  乐天: ['def', 'spd'], 温顺: ['spd', 'def'],
};
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_ZH = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };
// quality（资质）→ 个体值范围；没写资质的按 0~31 随机，再按总和推算资质
export const IV_BAND = { low: [0, 15], medium: [5, 25], high: [16, 31], perfect: [24, 31] };
export const QUALITY_ZH = { low: '资质平平', medium: '资质不错', high: '资质优秀', perfect: '资质完美' };
// 羁绊四项
export const AVS_ZH = { trust: '信任', passion: '热情', insight: '默契', devotion: '亲密' };
// 动画风格的叫声：宝可梦（会说话的喵喵除外）只会喊自己名字或名字的音节。表里没有的按名字自动生成（见 bridge.js cryLines）。
export const CRIES = {
  皮卡丘: ['皮卡～皮卡丘！', '皮卡皮卡！', '皮卡？'], 雷丘: ['雷丘！', '雷～丘！'],
  杰尼龟: ['杰尼杰尼！', '杰尼～！'], 卡咪龟: ['卡咪～卡咪！'], 水箭龟: ['水箭——龟！'],
  妙蛙种子: ['妙蛙～种子！', '种子种子！'], 妙蛙草: ['妙蛙～草！'], 妙蛙花: ['妙蛙——花！'],
  小火龙: ['小火龙～！', '火龙！火龙！'], 火恐龙: ['火恐龙！'], 喷火龙: ['（喷出一团火焰）喷火——龙！'],
  伊布: ['布伊～！', '伊布～！'], 胖丁: ['胖丁～♪', '胖～丁～胖～丁～'], 可达鸭: ['可达？', '可达……可达～'],
  卡比兽: ['卡比～……', '卡～比～'], 波克比: ['波克比～！', '克比克比！'], 喵喵: ['喵～！', '喵喵！'],
  鬼斯: ['鬼斯～'], 鬼斯通: ['鬼斯通～嘻嘻嘻'], 耿鬼: ['耿～鬼～！'], 大岩蛇: ['（低沉的轰鸣）大岩——蛇！'],
  绿毛虫: ['绿毛～虫！'], 波波: ['波波！', '波～波～'], 比比鸟: ['比比鸟！'], 大比鸟: ['大比——鸟！'],
  呆呆兽: ['呆～呆～……'], 走路草: ['走路～草！'], 拉达: ['拉达！'], 小拉达: ['拉达拉达！'],
  阿柏蛇: ['阿柏蛇——！'], 阿柏怪: ['阿柏——怪！'], 瓦斯弹: ['瓦斯～瓦斯～'], 宝石海星: ['（核心闪着光）嘿呀！'],
  海星星: ['（核心闪着光）嘿呀！'], 墨海马: ['墨海～'], 鲤鱼王: ['（扑腾，扑腾）'], 暴鲤龙: ['（震耳的咆哮）'],
  胡地: ['胡地……'], 凯西: ['凯西……（睡着）'], 喇叭芽: ['喇叭芽～'], 菊草叶: ['菊草～叶！'], 火球鼠: ['火球鼠！'], 小锯鳄: ['小锯鳄！'],
};

/* ---------- 精灵球与道具 ---------- */
export const BALL_ZH = { pokeball:'精灵球',greatball:'超级球',ultraball:'高级球',masterball:'大师球',safariball:'狩猎球',quickball:'先机球',duskball:'黑暗球',timerball:'计时球',repeatball:'重复球',netball:'捕网球',nestball:'巢穴球',diveball:'潜水球',luxuryball:'豪华球',healball:'治愈球' };
export const ZH_BALL = Object.fromEntries(Object.entries(BALL_ZH).map(([id,zh])=>[zh,id]));
// 道具中文名 → PokeAPI 道具图文件名
export const ITEM_ICONS = {
  精灵球: 'poke-ball', 超级球: 'great-ball', 高级球: 'ultra-ball', 大师球: 'master-ball', 狩猎球: 'safari-ball',
  伤药: 'potion', 好伤药: 'super-potion', 厉害伤药: 'hyper-potion', 全满药: 'max-potion', 全复药: 'full-restore',
  解毒药: 'antidote', 解麻药: 'paralyze-heal', 灼伤药: 'burn-heal', 解冻药: 'ice-heal', 解眠药: 'awakening', 万灵药: 'full-heal',
  活力碎片: 'revive', 活力块: 'max-revive', 美味之水: 'fresh-water', 劲爽汽水: 'soda-pop', 果汁牛奶: 'lemonade', 哞哞鲜奶: 'moomoo-milk',
  除虫喷雾: 'repel', 白银喷雾: 'super-repel', 黄金喷雾: 'max-repel', 离洞绳: 'escape-rope',
  破旧钓竿: 'old-rod', 好钓竿: 'good-rod', 厉害钓竿: 'super-rod', 自行车: 'bicycle', 船票: 's-s-ticket', 宝可梦之笛: 'poke-flute',
  雷之石: 'thunder-stone', 火之石: 'fire-stone', 水之石: 'water-stone', 叶之石: 'leaf-stone', 月之石: 'moon-stone',
  神奇糖果: 'rare-candy', 力量粉: 'x-attack', 树果: 'oran-berry', 橙橙果: 'oran-berry', 文柚果: 'sitrus-berry',
  化石: 'helix-fossil', 贝壳化石: 'helix-fossil', 甲壳化石: 'dome-fossil', 秘密琥珀: 'old-amber', 宝可梦图鉴: 'pokedex',
};
export const ITEM_EMOJI = [[/球$/, '🔴'], [/药|水|奶|汽水/, '🧪'], [/石$/, '💎'], [/喷雾/, '🧴'], [/竿/, '🎣'], [/票|证|卡/, '🎫'], [/果$/, '🍒'], [/化石|琥珀/, '🦴']];

export const BADGES = ['灰色徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
export const BADGE_COLORS = { 灰色徽章: '#9aa3ad', 蓝色徽章: '#4aa3ff', 橙色徽章: '#ff9a3c', 彩虹徽章: '#c58cff', 粉红徽章: '#ff7cc0', 金色徽章: '#f2c94c', 深红徽章: '#e5484d', 绿色徽章: '#45c46b' };
export const BADGE_GYM = { 灰色徽章: '深灰道馆·小刚', 蓝色徽章: '华蓝道馆·小霞的姐姐们', 橙色徽章: '枯叶道馆·马志士', 彩虹徽章: '玉虹道馆·莉佳', 粉红徽章: '浅红道馆·阿桔', 金色徽章: '金黄道馆·娜姿', 深红徽章: '红莲道馆·夏伯', 绿色徽章: '常青道馆·坂木' };

export const TITLES = [[2000, '石英大会的强者'], [1000, '联盟挑战者'], [500, '徽章收集者'], [200, '实力派训练家'], [50, '小有名气的训练家'], [-Infinity, '新人训练家']];
export const DIFFICULTY_BY_TYPE = { wild: 'normal', trainer: 'normal', rocket: 'normal', gym: 'hard', rival: 'expert', boss: 'expert', league: 'expert' };
export const WEATHER = { 晴: 'sunnyday', 晴天: 'sunnyday', 雨: 'raindance', 下雨: 'raindance', 沙暴: 'sandstorm', 雪: 'snow', 下雪: 'snow', 冰雹: 'snow' };
export const STATUS_TO_ZH = { par: '麻痹', brn: '灼伤', psn: '中毒', tox: '中毒', slp: '睡眠', frz: '冰冻' };
export const TYPE_LABEL = { wild: '野生', trainer: '训练家', gym: '道馆战', rival: '劲敌', boss: '强敌', rocket: '火箭队', league: '联盟大会' };
// v1.3.9：对战画面里的标签（第一段）
export const BATTLE_LABEL = { wild: '野生遭遇', trainer: '训练家对战', gym: '道馆战', rival: '劲敌对战', boss: '强敌对战', rocket: '火箭队', league: '联盟大会' };

/* ---------- v1.3.8：赛制（几 v 几） ----------
 * 野外 / 捕捉：对方只出 1 只；我方队伍里能战斗的都能轮换上场（最多 6 只，没有 6 只就按实际只数，不补）。
 * 和 NPC 对战（v1.3.9）：没约定几对几就两边全队——对方带着的全部 vs 我方能战斗的全部（各最多 6 只），只数可以不一样。
 * 道馆 / 大会：按该馆（该场）的规矩。对战块没写 teamSize 时，先按事件、再按馆主兜底；都对不上才按对方阵容只数。
 * 下表与卡内各“事件详情”条目、动画关都篇一致（n = 每方最多几只）。 */
export const EVENT_FORMATS = {
  EP005: { type: 'gym', n: 2, rule: '深灰道馆·小刚：双方最多各派两只' },
  EP007: { type: 'gym', n: 3, rule: '华蓝道馆·小霞：三对三（小霞的初始三只：海星星、宝石海星、角金鱼）' },
  EP014: { type: 'gym', n: 1, rule: '枯叶道馆·马志士：一对一单挑，中途不能换' },
  EP022: { type: 'gym', n: 1, rule: '金黄道馆·娜姿：一对一' },
  EP024: { type: 'gym', n: 1, rule: '金黄道馆·娜姿（再战）：一对一' },
  EP026: { type: 'gym', n: 3, rule: '玉虹道馆·莉佳：三对三' },
  EP032: { type: 'gym', n: 2, rule: '浅红道馆·阿桔：二对二' },
  EP057: { type: 'gym', n: 3, rule: '红莲道馆·夏伯：三对三' },
  EP058: { type: 'gym', n: 1, rule: '红莲道馆·夏伯（火山口重赛）：一对一' },
  EP062: { type: 'gym', n: 3, rule: '常青道馆（火箭队代管）：各三只、不限时' },
  EP076: { type: 'league', n: 3, rule: '石英大会预赛：各三只' },
  EP077: { type: 'league', n: 3, rule: '石英大会预赛：各三只' },
  EP078: { type: 'league', n: 3, rule: '石英大会预赛：各三只' },
  EP080: { type: 'league', n: 3, rule: '石英大会第五轮：各三只' },
  EP109: { type: 'gym', n: 2, rule: '榴柑道馆·琉丽：双打接力，任一只失去战斗能力则整组落败' },
};
// 自由剧情 / 沙盒里的道馆战（对战块没写 teamSize、事件也对不上时，按对手名字认馆）
export const GYM_RULES = [
  { re: /琉丽|榴柑/, n: 2, rule: '榴柑道馆：双打接力，任一只失去战斗能力则整组落败' },
  { re: /小刚|武志|深灰/, n: 2, rule: '深灰道馆：双方最多各派两只' },
  { re: /小霞|华蓝|樱花|菖蒲|牡丹/, n: 3, rule: '华蓝道馆：三对三（小霞的初始三只：海星星、宝石海星、角金鱼）' },
  { re: /马志士|枯叶/, n: 1, rule: '枯叶道馆：一对一单挑' },
  { re: /娜姿|金黄/, n: 1, rule: '金黄道馆：一对一' },
  { re: /莉佳|玉虹/, n: 3, rule: '玉虹道馆：三对三' },
  { re: /阿桔|绫女|浅红/, n: 2, rule: '浅红道馆：二对二' },
  { re: /夏伯|红莲/, n: 3, rule: '红莲道馆：三对三' },
  { re: /坂木|常青/, n: 3, rule: '常青道馆：各三只' },
];
/* ---------- v1.3.9：同行伙伴现在带着的宝可梦（动画关都篇的默认进度，与卡内《分阶段人设》一致） ----------
 * 和小智 / 小霞 / 小刚对战时，对战块里漏写的成员由桥接按这张表补上（对战块写 "exact":true 时不补）；生成前注入也会把名单告诉 AI。
 * 时间点：'EP003#1' = EP003 的第 1 个节点演完之后；'EP010' = EP010 整集演完之后。状态栏里标了“跳过”的事件不生效。
 * forms = 这一只的进化顺序（按 evolve 的时间点依次进化）；leave = 离队；ace = 王牌（补进来时等级 +2）；since = 从哪个事件起出场（生成前注入用）。
 * 只记随身携带、会上场对战的：寄放在大木研究所的（大钳蟹、臭臭泥、肯泰罗）和小霞抱着的波克比不算。 */
export const NPC_ROSTERS = {
  ash: { name: '小智', alias: ['阿智'], skipMode: '小智', members: [
    { forms: ['皮卡丘'], ace: true },
    { forms: ['绿毛虫', '铁甲蛹', '巴大蝶'], join: 'EP003#1', evolve: ['EP003', 'EP004'], leave: 'EP021' },
    { forms: ['比比鸟'], join: 'EP003#3' },
    { forms: ['妙蛙种子'], join: 'EP010' },
    { forms: ['小火龙', '火恐龙', '喷火龙'], join: 'EP011', evolve: ['EP042', 'EP045'] },
    { forms: ['杰尼龟'], join: 'EP012' },
    { forms: ['鬼斯通'], join: 'EP023', leave: 'EP024' },
    { forms: ['火暴猴'], join: 'EP025', leave: 'EP029' },
  ] },
  misty: { name: '小霞', since: 'EP001', members: [
    { forms: ['海星星'] },
    { forms: ['宝石海星'], ace: true, leave: 'EP060' },
    { forms: ['角金鱼'] },
    { forms: ['墨海马'], join: 'EP019', leave: 'EP060' },
    { forms: ['可达鸭'], join: 'EP027' },
  ] },
  brock: { name: '小刚', since: 'EP005', members: [
    { forms: ['小拳石'] },
    { forms: ['大岩蛇'], ace: true },
    { forms: ['超音蝠'], join: 'EP006#1' },
    { forms: ['六尾'], join: 'EP028' },
  ] },
};
// 人物名的常见写法 → records key（在场名单同步“已结识”用）
export const NPC_ALIASES = {
  ash: ['小智', '阿智'], misty: ['小霞'], brock: ['小刚'], gary: ['小茂'], oak: ['大木博士', '大木'], jessie: ['武藏'], james: ['小次郎'],
  meowth: ['喵喵（火箭队）', '火箭队喵喵', '会说话的喵喵'], delia: ['花子', '小智妈妈', '小智的妈妈'], joy: ['乔伊小姐', '乔伊'],
  jenny: ['君莎小姐', '君莎'], erika: ['莉佳'], sabrina: ['娜姿'], aya: ['绫女'],
};


/* 城都地图配套扩展：地点与生态是卡内事件、游戏地理的同人示意。 */
export const JOHTO_BADGES = ["飞翼徽章","昆虫徽章","常规徽章","幻影徽章","打击徽章","钢铁徽章","冰雪徽章","升龙徽章"];
export const JOHTO_BADGE_ALIASES = {"飞翼":"飞翼徽章","飞行徽章":"飞翼徽章","昆虫":"昆虫徽章","虫系徽章":"昆虫徽章","常规":"常规徽章","标准徽章":"常规徽章","平原徽章":"常规徽章","幻影":"幻影徽章","幽灵徽章":"幻影徽章","打击":"打击徽章","格斗徽章":"打击徽章","钢铁":"钢铁徽章","钢系徽章":"钢铁徽章","冰雪":"冰雪徽章","冰冻徽章":"冰雪徽章","冰之徽章":"冰雪徽章","升龙":"升龙徽章","龙之徽章":"升龙徽章","桔梗道馆":"飞翼徽章","桔梗市":"飞翼徽章","阿速":"飞翼徽章","桧皮道馆":"昆虫徽章","桧皮镇":"昆虫徽章","阿笔":"昆虫徽章","满金道馆":"常规徽章","满金市":"常规徽章","小茜":"常规徽章","缘朱道馆":"幻影徽章","缘朱市":"幻影徽章","松叶":"幻影徽章","湛蓝道馆":"打击徽章","湛蓝市":"打击徽章","阿四":"打击徽章","浅葱道馆":"钢铁徽章","浅葱市":"钢铁徽章","阿蜜":"钢铁徽章","卡吉道馆":"冰雪徽章","卡吉镇":"冰雪徽章","柳伯":"冰雪徽章","烟墨道馆":"升龙徽章","烟墨市":"升龙徽章","小椿":"升龙徽章"};
BADGES.push(...JOHTO_BADGES);
Object.assign(BADGE_COLORS, {"飞翼徽章":"#89bce2","昆虫徽章":"#a8b835","常规徽章":"#f2bfd4","幻影徽章":"#917bb7","打击徽章":"#d99868","钢铁徽章":"#b6c4d2","冰雪徽章":"#8cd7db","升龙徽章":"#6c85cc"});
Object.assign(BADGE_GYM, {"飞翼徽章":"桔梗道馆·阿速","昆虫徽章":"桧皮道馆·阿笔","常规徽章":"满金道馆·小茜","幻影徽章":"缘朱道馆·松叶","打击徽章":"湛蓝道馆·阿四","钢铁徽章":"浅葱道馆·阿蜜","冰雪徽章":"卡吉道馆·柳伯","升龙徽章":"烟墨道馆·小椿"});
MAP_NODES.push(...[{"id":"j_newbark","name":"若叶镇","x":64.7,"y":78.2,"kind":"city","alias":["空木研究所","空木博士研究所"],"region":"johto","noDraw":false},{"id":"j_cherry","name":"吉花市","x":52.9,"y":78.2,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_violet","name":"桔梗市","x":44.1,"y":52.6,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_azalea","name":"桧皮镇","x":37.1,"y":80.5,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_goldenrod","name":"满金市","x":27.1,"y":63.2,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_ecruteak","name":"缘朱市","x":27.6,"y":30.1,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_olivine","name":"浅葱市","x":13.5,"y":48.9,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_cianwood","name":"湛蓝市","x":5.3,"y":67.7,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_mahogany","name":"卡吉镇","x":52.9,"y":30.1,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_blackthorn","name":"烟墨市","x":70.0,"y":30.1,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_silver_town","name":"白银镇","x":93.5,"y":48.9,"kind":"city","alias":[],"region":"johto","noDraw":false},{"id":"j_ilex","name":"栎树林","x":29.7,"y":81.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_slowwell","name":"呆呆兽之井","x":39.4,"y":86.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_union","name":"连接洞窟","x":44.7,"y":71.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_dark","name":"黑暗洞穴","x":53.5,"y":51.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_park","name":"自然公园","x":27.6,"y":51.1,"kind":"wild","alias":[],"region":"johto","noDraw":false},{"id":"j_ruins","name":"阿露福遗迹","x":40.6,"y":59.0,"kind":"wild","alias":[],"region":"johto","noDraw":false},{"id":"j_mortar","name":"擂钵山","x":40.0,"y":30.1,"kind":"wild","alias":[],"region":"johto","noDraw":false},{"id":"j_rage","name":"愤怒之湖","x":52.9,"y":10.5,"kind":"wild","alias":[],"region":"johto","noDraw":false},{"id":"j_ice","name":"冰雪小径","x":64.1,"y":30.1,"kind":"wild","alias":["冰之洞窟"],"region":"johto","noDraw":true},{"id":"j_dragonsden","name":"龙穴","x":72.4,"y":22.9,"kind":"wild","alias":["龙之圣域"],"region":"johto","noDraw":true},{"id":"j_whirl","name":"漩涡列岛","x":11.2,"y":62.4,"kind":"wild","alias":["漩涡岛"],"region":"johto","noDraw":false},{"id":"j_silver_mountain","name":"白银山","x":85.9,"y":42.1,"kind":"wild","alias":[],"region":"johto","noDraw":false},{"id":"j_tohjo","name":"都城瀑布","x":78.2,"y":78.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_border","name":"联盟边境关口","x":89.1,"y":67.7,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_safari","name":"城都狩猎地带","x":5.3,"y":48.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_greenfield","name":"绿色草原镇","x":73.5,"y":90.2,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_ilex_movie","name":"桧扇森林","x":31.8,"y":17.3,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_odamare","name":"奥多马雷","x":15.3,"y":91.0,"kind":"city","alias":[],"region":"johto","noDraw":true},{"id":"j_mist","name":"浓雾森林","x":61.8,"y":74.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_heracross","name":"赫拉克罗斯之森","x":57.6,"y":74.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_donphan","name":"顿甲之谷","x":56.2,"y":68.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_confuse","name":"迷惑森林","x":49.4,"y":66.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_northeast","name":"东北镇","x":48.8,"y":62.8,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_spinarak","name":"圆丝蛛镇","x":50.0,"y":59.4,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_tenmother","name":"天母镇","x":56.5,"y":59.4,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_happy","name":"快乐镇","x":57.4,"y":51.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_apple","name":"笛音苹果园","x":57.6,"y":56.0,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_charicific","name":"喷火龙山谷","x":47.9,"y":65.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_sunshine_johto","name":"阳光镇（城都）","x":41.2,"y":65.4,"kind":"town","alias":["阳光镇"],"region":"johto","noDraw":true},{"id":"j_carewoods","name":"青芜疗养林","x":41.8,"y":68.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_gligar","name":"天蝎镇","x":40.6,"y":75.2,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_leaf","name":"叶之镇","x":31.8,"y":75.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_quagsire","name":"乌波保育园","x":32.6,"y":71.4,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_swell","name":"漱泷河","x":35.6,"y":67.3,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_owl","name":"桐树林","x":33.5,"y":61.3,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_bear","name":"圈圈熊森林","x":34.4,"y":65.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_psychic_village","name":"超能镇","x":23.2,"y":58.3,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_flyingtown","name":"飞驿镇","x":36.5,"y":47.0,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_zubat_house","name":"超音蝠之馆","x":34.1,"y":42.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_jungle_springs","name":"蒸岚林","x":32.4,"y":38.3,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_goldlake","name":"金鳞湖","x":40.6,"y":45.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_bloomtown","name":"布罗镇","x":41.2,"y":41.4,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_shrinevalley","name":"风之谷","x":41.2,"y":36.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_wobbuf","name":"果然翁之村","x":35.3,"y":34.2,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_sunshineorchard","name":"金实果园","x":33.2,"y":28.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_gloom_mountain","name":"幽狩山","x":35.9,"y":25.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_tepoyama","name":"铁炮山","x":21.5,"y":23.3,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_honeyforest","name":"蜜橡林","x":19.4,"y":26.7,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_sunflora_inn","name":"向日花怪旅馆","x":17.9,"y":33.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_hot_slope","name":"暄热坡","x":21.5,"y":37.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_snowmount","name":"白雪山","x":22.4,"y":21.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_digletown","name":"掘丘镇","x":20.6,"y":41.4,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_river_echo","name":"回映河","x":18.8,"y":45.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_wrestle","name":"力士镇","x":18.2,"y":51.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_rockruins","name":"玄石遗迹","x":20.6,"y":47.0,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_whitestone","name":"白石镇","x":20.9,"y":54.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_windpark","name":"驰风原","x":23.2,"y":49.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_tongmo","name":"通陌镇","x":22.6,"y":52.3,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_huayi","name":"华驿镇","x":23.5,"y":55.3,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_xinyu","name":"新玉池","x":17.4,"y":56.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_desert","name":"砾砂漠","x":19.1,"y":60.5,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_blue_island","name":"青岩岛","x":5.6,"y":60.5,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_bobo_island","name":"大波波之岛","x":8.2,"y":56.0,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_huang_island","name":"黄岩岛","x":7.1,"y":74.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_akatoshi","name":"赤岩岛","x":14.7,"y":69.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_kasado","name":"银岩岛","x":15.0,"y":65.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_oki","name":"冲岛","x":15.6,"y":73.7,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_mackerel","name":"鲳鱼镇","x":18.8,"y":69.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_thunder","name":"迅雷镇","x":44.7,"y":24.1,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_coolroad","name":"凉枝径","x":47.1,"y":19.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_fogcottage","name":"雾隠庵","x":43.8,"y":18.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_mountain_gap","name":"水狭谷","x":47.4,"y":25.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_windy","name":"薰风原","x":56.5,"y":24.4,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_fireflat","name":"丹烬坪","x":60.0,"y":22.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_magicwood","name":"清樾林","x":60.9,"y":18.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_clearpond","name":"明潭湖","x":62.4,"y":24.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_slowpokelake","name":"呆呆兽湖","x":65.9,"y":17.7,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_aeyi","name":"艾移镇","x":67.1,"y":23.3,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_starry","name":"疏星谷","x":70.0,"y":15.0,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_lizhan","name":"砺战镇","x":72.4,"y":18.8,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_battlepark","name":"对战公园","x":75.3,"y":25.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_dragonpalace","name":"龙宫道馆","x":76.5,"y":37.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_marine_lab","name":"宝可梦海洋研究所","x":79.1,"y":44.0,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_yunao","name":"云坳宝可梦中心","x":82.1,"y":49.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_tanqiu","name":"丹湫林","x":76.5,"y":48.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_huanxi","name":"缓汐湖","x":75.3,"y":53.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_sparse","name":"疏芜坪","x":78.8,"y":57.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_hooh_hall","name":"凤王院","x":90.0,"y":54.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j_hatano","name":"哈泰诺村","x":33.8,"y":11.7,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_zhina","name":"芝拿镇","x":4.1,"y":57.1,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_meiqi","name":"美奇市","x":4.1,"y":78.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_ouqi","name":"欧奇市","x":8.5,"y":78.9,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_kake","name":"卡可市","x":17.6,"y":77.8,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j_kashado_town","name":"卡沙多市","x":19.4,"y":74.1,"kind":"town","alias":[],"region":"johto","noDraw":true},{"id":"j26","name":"26号道路","x":87.8,"y":74.4,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j27","name":"27号道路","x":76.1,"y":78.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j28","name":"28号道路","x":88.0,"y":52.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j29","name":"29号道路","x":58.8,"y":78.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j30","name":"30号道路","x":52.9,"y":66.9,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j31","name":"31号道路","x":47.1,"y":54.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j32","name":"32号道路","x":44.4,"y":62.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j33","name":"33号道路","x":42.2,"y":77.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j34","name":"34号道路","x":30.2,"y":76.5,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j35","name":"35号道路","x":27.4,"y":57.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j36","name":"36号道路","x":36.7,"y":51.6,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j37","name":"37号道路","x":34.7,"y":37.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j38","name":"38号道路","x":20.6,"y":30.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j39","name":"39号道路","x":13.5,"y":39.5,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j40","name":"40号水路","x":13.5,"y":53.8,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j41","name":"41号水路","x":10.0,"y":64.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j42","name":"42号道路","x":40.2,"y":30.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j43","name":"43号道路","x":52.9,"y":20.3,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j44","name":"44号道路","x":62.4,"y":30.1,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j45","name":"45号道路","x":70.0,"y":43.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j46","name":"46号道路","x":65.0,"y":68.2,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j47","name":"47号道路","x":2.9,"y":63.7,"kind":"wild","alias":[],"region":"johto","noDraw":true},{"id":"j48","name":"48号道路","x":4.1,"y":53.4,"kind":"wild","alias":[],"region":"johto","noDraw":true}]);
MAP_EDGES.push(...[["j_newbark","j_cherry"],["j_cherry","j_violet"],["j_violet","j_azalea"],["j_azalea","j_goldenrod"],["j_goldenrod","j_park"],["j_park","j_ecruteak"],["j_ecruteak","j_olivine"],["j_olivine","j_whirl"],["j_whirl","j_cianwood"],["j_ecruteak","j_mortar"],["j_mortar","j_mahogany"],["j_mahogany","j_rage"],["j_mahogany","j_blackthorn"],["j_blackthorn","j_silver_mountain"],["j_silver_mountain","j_silver_town"],["j_violet","j_ruins"]]);
Object.assign(ENCOUNTERS, {"j_newbark":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_cherry":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_violet":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_azalea":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_goldenrod":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_ecruteak":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_olivine":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_cianwood":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_mahogany":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_blackthorn":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_silver_town":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_ilex":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_slowwell":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_union":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_dark":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_park":[["芭瓢虫",9,18,3],["圆丝蛛",9,18,3],["绿毛虫",9,18,3],["独角虫",9,18,3],["赫拉克罗斯",12,19,1]],"j_ruins":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_mortar":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_rage":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_ice":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_dragonsden":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_whirl":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_silver_mountain":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_tohjo":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_border":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_safari":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_greenfield":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_ilex_movie":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_odamare":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_mist":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_heracross":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_donphan":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_confuse":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_northeast":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_spinarak":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_tenmother":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_happy":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_apple":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j_charicific":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_sunshine_johto":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_carewoods":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_gligar":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_leaf":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_quagsire":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_swell":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_owl":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_bear":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_psychic_village":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_flyingtown":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_zubat_house":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_jungle_springs":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_goldlake":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_bloomtown":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_shrinevalley":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_wobbuf":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_sunshineorchard":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_gloom_mountain":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_tepoyama":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_honeyforest":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j_sunflora_inn":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_hot_slope":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_snowmount":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_digletown":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_river_echo":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_wrestle":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_rockruins":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_whitestone":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_windpark":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_tongmo":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_huayi":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_xinyu":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_desert":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_blue_island":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_bobo_island":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_huang_island":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_akatoshi":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_kasado":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_oki":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_mackerel":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_thunder":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_coolroad":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_fogcottage":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_mountain_gap":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_windy":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_fireflat":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_magicwood":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_clearpond":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_slowpokelake":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_aeyi":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_starry":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_lizhan":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_battlepark":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j_dragonpalace":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_marine_lab":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_yunao":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_tanqiu":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_huanxi":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_sparse":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_hooh_hall":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j_hatano":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_zhina":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_meiqi":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_ouqi":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_kake":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j_kashado_town":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j26":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j27":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j28":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j29":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j30":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j31":[["尾立",3,6,4],["咕咕",3,7,3],["波波",3,6,3],["芭瓢虫",3,6,2],["圆丝蛛",3,6,2]],"j32":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j33":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j34":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j35":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j36":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j37":[["绿毛虫",7,14,3],["独角虫",7,14,3],["圆丝蛛",7,14,3],["榛果球",8,15,2],["咕咕",8,15,2]],"j38":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j39":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j40":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j41":[["小小象",32,44,3],["盔甲鸟",33,44,2],["大嘴蝠",32,44,3],["小山猪",32,44,2],["猫头夜鹰",32,44,2]],"j42":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j43":[["尾立",10,20,3],["咕咕",10,20,3],["喵喵",10,20,2],["玛力露",10,20,2],["向日种子",10,20,2]],"j44":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j45":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j46":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j47":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]],"j48":[["小拳石",15,28,4],["超音蝠",15,28,4],["小小象",15,28,2],["小山猪",18,28,2],["大岩蛇",18,28,1]]});
export const JOHTO_ANIME_PLACES = {"阳光镇":"j_sunshine_johto","冰之洞窟":"j_ice","漩涡岛":"j_whirl","龙之圣域":"j_dragonsden"};
Object.assign(EVENT_FORMATS, {"EP132":{"type":"gym","n":3,"rule":"桔梗道馆·阿速：三对三"},"EP145":{"type":"gym","n":3,"rule":"桧皮道馆·阿笔：三对三"},"EP159":{"type":"gym","n":3,"rule":"满金道馆·小茜：三对三"},"EP183":{"type":"gym","n":3,"rule":"缘朱道馆·松叶：三对三"},"EP210":{"type":"gym","n":2,"rule":"湛蓝道馆·阿四：二对二"},"EP225":{"type":"gym","n":2,"rule":"浅葱道馆·阿蜜：二对二"},"EP239":{"type":"gym","n":2,"rule":"卡吉道馆·柳伯：二对二"},"EP253":{"type":"gym","n":3,"rule":"烟墨道馆·小椿：三对三"},"EP255":{"type":"gym","n":3,"rule":"烟墨道馆·小椿：三对三"}});
GYM_RULES.push(...[{re:/阿速|桔梗/,n:3,rule:"桔梗道馆：三对三"},{re:/阿笔|桧皮/,n:3,rule:"桧皮道馆：三对三"},{re:/小茜|满金/,n:3,rule:"满金道馆：三对三"},{re:/松叶|缘朱/,n:3,rule:"缘朱道馆：三对三"},{re:/阿四|湛蓝/,n:2,rule:"湛蓝道馆：二对二"},{re:/阿蜜|浅葱/,n:2,rule:"浅葱道馆：二对二"},{re:/柳伯|卡吉/,n:2,rule:"卡吉道馆：二对二"},{re:/小椿|烟墨/,n:3,rule:"烟墨道馆：三对三"}]);
