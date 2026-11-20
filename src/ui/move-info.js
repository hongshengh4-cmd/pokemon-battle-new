// 招式详细说明：沿用原来的中文介绍和「效果」版式。
// 本文件只生成说明文字，不执行招式、不估算伤害、不修改对战或存档。
(function (global) {
  'use strict';
  let DESC = {};
  const VERSION = 'move-info-zh-v2';
  const TYPE_ZH = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精', Stellar: '星晶', '???': '？？？' };
  const CAT_ZH = { Physical: '物理', Special: '特殊', Status: '变化' };
  const STAT_ZH = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', accuracy: '命中率', evasion: '闪避率' };
  const STATUS_ZH = { par: '麻痹', brn: '灼伤', psn: '中毒', tox: '剧毒', slp: '睡眠', frz: '冰冻' };
  const TARGET_ZH = {
    normal: '选择一个目标', any: '选择一个目标', randomNormal: '随机一名对手', adjacentFoe: '一名相邻对手',
    allAdjacentFoes: '对方全体', allAdjacent: '周围所有宝可梦（包括同伴）', self: '自己',
    adjacentAllyOrSelf: '自己或相邻同伴', adjacentAlly: '相邻同伴', allies: '我方全体', allyTeam: '我方全队',
    allySide: '我方场地', foeSide: '对方场地', all: '整个场地', scripted: '由招式效果决定',
  };
  const WEATHER_ZH = { sunnyday: '大晴天', raindance: '下雨', sandstorm: '沙暴', snow: '下雪', snowscape: '下雪', hail: '冰雹', desolateland: '大日照', primordialsea: '大雨' };
  const TERRAIN_ZH = { electricterrain: '电气场地', grassyterrain: '青草场地', psychicterrain: '精神场地', mistyterrain: '薄雾场地' };
  const SIDE_ZH = {
    reflect: '5回合内减轻我方受到的物理招式伤害。', lightscreen: '5回合内减轻我方受到的特殊招式伤害。',
    auroraveil: '雪天才能使用。5回合内减轻我方受到的物理和特殊招式伤害。', tailwind: '4回合内，我方宝可梦的速度翻倍。',
    spikes: '在对方场地撒下撒菱，对手换上场时受到伤害；最多叠加3层。',
    toxicspikes: '在对方场地撒下毒菱，使换上场的对手中毒；叠加2层时变为剧毒。',
    stealthrock: '在对方场地布下隐形岩，使换上场的对手受到岩石属性伤害。',
    stickyweb: '在对方场地布下黏黏网，降低换上场的对手的速度。',
    safeguard: '5回合内保护我方，防止受到异常状态。', mist: '5回合内保护我方，防止被对手降低能力。',
  };

  // 原有中文说明缺少的招式，补充同样面向玩家的中文简介。
  // 已有的介绍仍由原来的 move-desc-zh.json 提供；不引用外语规则原文。
  const EXTRA_DESC = {
    alluringvoice: '用魅惑的声音攻击对手。如果对手在本回合提高过能力，还会使其混乱。',
    aquacutter: '用水之利刃切开对手。容易击中要害。',
    aquastep: '以轻快的舞步攻击对手，并提高自己的速度1级。',
    armorcannon: '将铠甲化为炮弹攻击对手。使用后自己的防御和特防各降低1级。',
    barbbarrage: '用毒刺攻击对手，有50%的概率使其中毒。对已经中毒的目标威力翻倍。',
    bitterblade: '用充满悔念的剑刃斩击对手，回复造成伤害一半的体力。',
    bittermalice: '用令人不寒而栗的怨念攻击对手，并降低其攻击1级。',
    blazingtorque: '猛烈撞向对手，有30%的概率使其灼伤。',
    bleakwindstorm: '用猛烈的冷风攻击对方全体，有30%的概率降低其速度1级。下雨时不会因命中率而落空。',
    bloodmoon: '释放血红的月光攻击对手。不能连续两回合使用。',
    burningbulwark: '保护自己，挡住本回合的大多数伤害招式；使接触自己的攻击者灼伤。连续使用容易失败。',
    ceaselessedge: '用贝壳利刃攻击对手，并在对方场地撒下一层撒菱。',
    chillingwater: '向对手泼洒冰冷的水，并降低其攻击1级。',
    chloroblast: '凝聚叶绿素的力量攻击对手。使用后自己会损失最大体力的一半。',
    collisioncourse: '全力撞向对手。属性克制对手时，伤害会在克制加成之外再提高约三分之一。',
    combattorque: '以格斗气势冲撞对手，有30%的概率使其麻痹。',
    direclaw: '用利爪攻击对手，有50%的概率随机使其中毒、麻痹或睡眠。',
    doodle: '描绘对手的本质，将自己和同伴的特性变成与目标相同。部分特殊特性无法复制或替换。',
    doubleshock: '释放全身的电力攻击对手，使用后失去自己的电属性。自身没有电属性时无法使用。',
    dragoncheer: '鼓舞相邻的同伴，使其更容易击中要害。对龙属性同伴的效果更强。',
    electrodrift: '以电光般的速度攻击对手。属性克制对手时，伤害会在克制加成之外再提高约三分之一。',
    electroshot: '第一回合蓄电并提高特攻1级，第二回合攻击。下雨时通常可在同一回合完成。',
    esperwing: '用气场之翼攻击对手，并提高自己的速度1级。容易击中要害。',
    ficklebeam: '发射光束攻击对手。有30%的概率使这次招式的威力翻倍。',
    filletaway: '损失自己最大体力的一半，使攻击、特攻和速度各提高2级。剩余体力不足时失败。',
    flowertrick: '向对手投出花束。不进行普通命中判定，通常必定击中要害。',
    gigatonhammer: '挥动巨大的锤子攻击对手。不能连续两回合使用。',
    glaiverush: '以巨剑般的身体突击对手。在自己下一次行动前，攻击自己的招式将必中且伤害翻倍。',
    gmaxbefuddle: '超极巨化后使出的虫属性攻击。随机使对方宝可梦中毒、麻痹或睡眠。',
    gmaxcannonade: '超极巨化后使出的水属性攻击。随后4回合，每回合使非水属性的对手损失最大体力的1/6。',
    gmaxcentiferno: '超极巨化后使出的火属性攻击。用火焰束缚对方，使其在4～5回合内持续受伤。',
    gmaxchistrike: '超极巨化后使出的格斗属性攻击。使自己和同伴更容易击中要害。',
    gmaxcuddle: '超极巨化后使出的一般属性攻击。使符合性别条件的对方宝可梦着迷。',
    gmaxdepletion: '超极巨化后使出的龙属性攻击。使对方最后使用的招式额外失去2点招式点数。',
    gmaxdrumsolo: '超极巨化后使出的草属性攻击。威力固定为160，并无视对方可被忽略的特性。',
    gmaxfinale: '超极巨化后使出的妖精属性攻击。回复自己和同伴最大体力的1/6。',
    gmaxfireball: '超极巨化后使出的火属性攻击。威力固定为160，并无视对方可被忽略的特性。',
    gmaxfoamburst: '超极巨化后使出的水属性攻击。使对方宝可梦的速度降低2级。',
    gmaxgoldrush: '超极巨化后使出的一般属性攻击。使对方宝可梦混乱。',
    gmaxgravitas: '超极巨化后使出的超能力属性攻击。使战场进入重力增强的状态。',
    gmaxhydrosnipe: '超极巨化后使出的水属性攻击。威力固定为160，并无视对方可被忽略的特性。',
    gmaxmalodor: '超极巨化后使出的毒属性攻击。使对方宝可梦中毒。',
    gmaxmeltdown: '超极巨化后使出的钢属性攻击。使对方宝可梦无法连续使用相同的招式。',
    gmaxoneblow: '超极巨化后使出的恶属性攻击。可以穿过守住、极巨防壁等保护招式。',
    gmaxrapidflow: '超极巨化后使出的水属性攻击。可以穿过守住、极巨防壁等保护招式。',
    gmaxreplenish: '超极巨化后使出的一般属性攻击。有50%的概率让自己和同伴取回已吃掉的树果。',
    gmaxresonance: '超极巨化后使出的冰属性攻击。为我方展开极光幕，减轻受到的物理和特殊伤害。',
    gmaxsandblast: '超极巨化后使出的地面属性攻击。用沙暴束缚对方，使其在4～5回合内持续受伤。',
    gmaxsmite: '超极巨化后使出的妖精属性攻击。使对方宝可梦混乱。',
    gmaxsnooze: '超极巨化后使出的恶属性攻击。有50%的概率使目标产生睡意，并在下一回合结束时尝试入睡。',
    gmaxsteelsurge: '超极巨化后使出的钢属性攻击。在对方场地留下尖锐钢刺，使之后换上场的对手受伤。',
    gmaxstonesurge: '超极巨化后使出的水属性攻击。在对方场地布下隐形岩。',
    gmaxstunshock: '超极巨化后使出的电属性攻击。随机使对方宝可梦中毒或麻痹。',
    gmaxsweetness: '超极巨化后使出的草属性攻击。治愈自己和同伴的异常状态。',
    gmaxtartness: '超极巨化后使出的草属性攻击。降低对方宝可梦的闪避率1级。',
    gmaxterror: '超极巨化后使出的幽灵属性攻击。使对方宝可梦无法逃走。',
    gmaxvinelash: '超极巨化后使出的草属性攻击。随后4回合，每回合使非草属性的对手损失最大体力的1/6。',
    gmaxvolcalith: '超极巨化后使出的岩石属性攻击。随后4回合，每回合使非岩石属性的对手损失最大体力的1/6。',
    gmaxvoltcrash: '超极巨化后使出的电属性攻击。使对方宝可梦麻痹。',
    gmaxwildfire: '超极巨化后使出的火属性攻击。随后4回合，每回合使非火属性的对手损失最大体力的1/6。',
    gmaxwindrage: '超极巨化后使出的飞行属性攻击。清除场地、双方的钉子以及对方的壁等效果。',
    hardpress: '用力挤压对手。目标剩余体力越多，威力越大。',
    headlongrush: '不顾一切地猛扑对手。使用后自己的防御和特防各降低1级。',
    hydrosteam: '将水蒸气猛烈喷向对手。晴天下伤害不减反增，变为原来的1.5倍。',
    icespinner: '裹着冰旋转攻击对手，并破坏脚下的场地效果。',
    infernalparade: '用幽灵之火攻击对手，有30%的概率使其灼伤。对有异常状态的目标威力翻倍。',
    ivycudgel: '挥动棘藤棒攻击对手，容易击中要害。厄诡椪使用时，属性会随其样子改变。',
    jetpunch: '以迅雷不及掩耳之势出拳攻击，通常能先出手。',
    kowtowcleave: '以卑躬屈膝的姿势诱使对手大意后斩击。攻击不进行普通命中判定。',
    lastrespects: '为倒下的同伴报仇。队伍中同伴倒下的次数越多，威力越大。',
    luminacrash: '释放奇异光芒攻击对手，并降低其特防2级。',
    lunarblessing: '向新月祈祷，回复自己和同伴最大体力的1/4，并治愈异常状态。',
    magicaltorque: '以神奇的力量冲撞对手，有30%的概率使其混乱。',
    makeitrain: '散落大量金币攻击对方全体。使用后自己的特攻降低1级。',
    malignantchain: '用带有剧毒的锁链攻击对手，有50%的概率使其陷入剧毒。',
    matchagotcha: '泼洒热茶攻击对方全体，回复造成伤害一半的体力，并有20%的概率使目标灼伤。',
    mightycleave: '以强韧的刀刃斩击对手，可以穿过普通的守住类保护。',
    mortalspin: '旋转身体攻击对方，使其中毒，并清除我方的钉子和自己身上的束缚、寄生种子。',
    mountaingale: '掀起冰山般的寒风攻击对手，有30%的概率使其畏缩。',
    mysticalpower: '以神秘的力量攻击对手，并提高自己的特攻1级。',
    nihillight: '释放虚无之光，以龙属性的力量攻击对方全体。',
    noxioustorque: '以毒气缠绕的冲撞攻击对手，有30%的概率使其中毒。',
    orderup: '攻击对手。若有米立龙通过司令特性进入体内，还会根据其样子提高自己的攻击、防御或速度1级。',
    populationbomb: '接连发动攻击，最多命中10次。通常每次攻击都要判断是否命中，落空后停止。',
    pounce: '扑向对手进行攻击，并降低其速度1级。',
    powershift: '交换自己的攻击与防御数值。再次使用可以换回来。',
    psyblade: '用精神之刃斩击对手。在电气场地上，威力提高为1.5倍。',
    psychicnoise: '用令人不适的声音攻击对手，并在2回合内阻止目标回复体力。',
    psyshieldbash: '以精神力筑成的屏障撞击对手，并提高自己的防御1级。',
    ragingfury: '连续2～3回合以火焰攻击对手，结束后自己会混乱。',
    revivalblessing: '选择本场队伍中一只失去战斗能力的同伴，使其以一半体力复活。没有倒下的同伴时失败。',
    ruination: '以灾厄的力量攻击，使目标失去当前剩余体力的一半。',
    saltcure: '以盐腌攻击对手，之后每回合使其损失最大体力的1/8；水或钢属性目标损失1/4。换下场后解除。',
    sandsearstorm: '用灼热的沙风攻击对方全体，有20%的概率使其灼伤。下雨时不会因命中率而落空。',
    shedtail: '损失自己最大体力的一半制造替身，再换上后备宝可梦并将替身交给它。',
    shelter: '通过闭关保护自己，使自己的防御提高2级。',
    silktrap: '保护自己，挡住本回合的大多数伤害招式；使接触自己的攻击者速度降低1级。连续使用容易失败。',
    spicyextract: '向目标喷洒辛辣精华，使其攻击提高2级、防御降低2级。',
    spinout: '猛烈转动身体攻击对手。使用后自己的速度降低2级。',
    springtidestorm: '用爱与憎的风暴攻击对方全体，有30%的概率降低其攻击1级。',
    stoneaxe: '用岩石之斧攻击对手，并在对方场地布下隐形岩。',
    supercellslam: '以猛烈的电光撞向对手。如果攻击落空，自己会损失最大体力的一半。',
    syrupbomb: '用黏稠的糖浆弹攻击对手。随后3回合，每回合结束时降低目标的速度1级。',
    tachyoncutter: '用能量利刃连续攻击2次。不进行普通命中判定。',
    takeheart: '提高自己的特攻和特防各1级，并治愈自己的异常状态。',
    temperflare: '将怒火化为攻击。如果自己上一回合的招式失败，威力翻倍。',
    terablast: '发射太晶之力攻击。太晶化后变为太晶属性，并根据攻击和特攻中较高的一项决定使用物理或特殊攻击。',
    terastarstorm: '释放结晶之力攻击。太乐巴戈斯处于星晶形态时，变为星晶属性并攻击对方全体。',
    thunderclap: '抢先以电光攻击对手。若目标没有准备使用攻击招式，或已经行动，则会失败。',
    tidyup: '清除双方场地上的钉子和所有替身，并提高自己的攻击和速度各1级。',
    torchsong: '用火焰般的歌声攻击对手，并提高自己的特攻1级。',
    trailblaze: '踏着轻快的步伐攻击对手，并提高自己的速度1级。',
    triplearrows: '发动容易击中要害的攻击，有50%的概率降低目标防御1级，并有30%的概率使其畏缩。',
    tripledive: '连续钻击对手3次。',
    upperhand: '抢先攻击准备使出先制攻击招式的目标，并使其畏缩。不满足条件时失败。',
    victorydance: '跳起胜利之舞，使自己的攻击、防御和速度各提高1级。',
    wickedtorque: '以黑暗的力量冲撞对手，有10%的概率使其睡眠。',
    wildboltstorm: '用雷电风暴攻击对方全体，有20%的概率使其麻痹。下雨时不会因命中率而落空。',
    paleowave: '用远古波涛攻击对手，有20%的概率降低其攻击1级。',
    shadowstrike: '以暗影攻击对手，有50%的概率降低其防御1级。',
    polarflare: '用极寒的火焰攻击对方全体，有10%的概率使目标冰冻；特定宝可梦使用后还会改变形态。',
    hiddenpower: '招式的属性会随着使用此招式的宝可梦而改变。',
  };
  const Z_IDS = new Set(['aciddownpour', 'alloutpummeling', 'blackholeeclipse', 'bloomdoom', 'breakneckblitz', 'continentalcrush', 'corkscrewcrash', 'devastatingdrake', 'gigavolthavoc', 'hydrovortex', 'infernooverdrive', 'neverendingnightmare', 'savagespinout', 'shatteredpsyche', 'subzeroslammer', 'supersonicskystrike', 'tectonicrage', 'twinkletackle']);
  for (const id of Z_IDS) EXTRA_DESC[id] = '将原招式转化为强力的Ｚ招式攻击对手。威力取决于原招式，每队每场战斗只能发动一次Ｚ招式。';

  // 用玩家能直接理解的词语补充常见的特殊效果，不显示开发或实现说明。
  const DETAIL = {
    earthquake: '攻击周围所有宝可梦，双打时也会打到同伴。目标正在挖洞时，伤害翻倍。',
    earthpower: '造成伤害，并有10%的概率降低目标的特防1级。',
    icepunch: '造成伤害，并有10%的概率使目标冰冻。',
    flatter: '提高目标的特攻1级，并使其混乱。混乱时有概率打伤自己，而无法使出招式。',
    swagger: '提高目标的攻击2级，并使其混乱。混乱时有概率打伤自己，而无法使出招式。',
    transform: '暂时复制目标的样子、属性、特性、能力变化和招式等，自己的体力不变。换下场后恢复原样。',
    mimic: '暂时将这招变成目标最后使用的可模仿招式。换下场后恢复为模仿。',
    sketch: '学会目标最后使用的可写生招式，永久替换写生。',
    rest: '回复全部体力并治愈异常状态，然后睡眠。通常在之后的两次行动中熟睡，第三次行动前醒来。已经睡着或体力全满时失败。',
    sleeptalk: '仅在睡眠时可用，随机使出自己学会的一招，只消耗梦话的招式点数。睡觉可以被选中，但会因已经睡着而失败，不会回血，也不会延长睡眠。',
    hyperbeam: '攻击成功后，下一回合需要休息，不能行动或换人。',
    gigaimpact: '攻击成功后，下一回合需要休息，不能行动或换人。',
    blastburn: '攻击成功后，下一回合需要休息，不能行动或换人。',
    frenzyplant: '攻击成功后，下一回合需要休息，不能行动或换人。',
    hydrocannon: '攻击成功后，下一回合需要休息，不能行动或换人。',
    rockwrecker: '攻击成功后，下一回合需要休息，不能行动或换人。',
    roar: '强制让目标换下场。野生遭遇中可将目标驱走。',
    whirlwind: '强制让目标换下场。野生遭遇中可将目标驱走。',
    teleport: '以较慢的顺序换上后备宝可梦。野生对手使用时可能直接逃走。',
    octolock: '困住目标，使其不能随意换下场；每回合结束时，防御和特防各降低1级。不会直接扣除体力。',
    purify: '治愈目标的异常状态，成功后回复自己最大体力的一半。目标没有异常状态时失败。',
    psychoshift: '将自己的异常状态转移给目标。目标无法接受该状态时失败，自己的状态不会因此消失。',
    wish: '在下一回合结束时，为这个位置上的宝可梦回复许愿者最大体力的一半；换人后仍可生效。',
    substitute: '消耗自己最大体力的1/4制造替身，代替自己承受大多数攻击。体力不足时失败。',
    protect: '保护自己，挡住本回合的大多数招式。连续使用容易失败；少数招式可以穿过保护。',
    detect: '保护自己，挡住本回合的大多数招式。连续使用容易失败；少数招式可以穿过保护。',
    maxguard: '极巨化时保护自己，挡住本回合的大多数招式。连续使用容易失败。',
    endure: '本回合受到直接攻击时，至少留下1点体力。不能抵挡中毒、灼伤或天气等间接伤害；连续使用容易失败。',
    yawn: '使目标产生睡意，在下一回合结束时尝试使其睡眠。',
    toxic: '使目标陷入剧毒。每回合持续失去体力，伤害逐渐增加；换下场后伤害累积会重置。',
    struggle: '没有其他可用招式时使用。攻击后自己受到最大体力1/4的反作用力伤害。',
    haze: '清除场上所有宝可梦的能力等级变化。',
    focusenergy: '集中精神，使自己之后的攻击更容易击中要害。换下场后解除。',
    splash: '什么也不会发生。',
    defog: '降低目标的闪避率1级，清除双方场地上的钉子、场地效果以及目标一方的壁等保护效果。',
    rapidspin: '攻击后提高自己的速度1级，清除我方场地上的钉子，以及自己身上的束缚和寄生种子。',
    brickbreak: '攻击前先破坏对方的反射壁、光墙和极光幕。',
    psychicfangs: '攻击前先破坏对方的反射壁、光墙和极光幕。',
    return: '亲密度越高，威力越大。', frustration: '亲密度越低，威力越大。',
    lowkick: '目标越重，威力越大，范围为20～120。', grassknot: '目标越重，威力越大，范围为20～120。',
    heavyslam: '自己比目标重得越多，威力越大，范围为40～120。', heatcrash: '自己比目标重得越多，威力越大，范围为40～120。',
    gyroball: '自己的速度比目标慢得越多，威力越大，最高150。', electroball: '自己的速度比目标快得越多，威力越大，范围为40～150。',
    flail: '自己剩余体力的比例越低，威力越大，范围为20～200。', reversal: '自己剩余体力的比例越低，威力越大，范围为20～200。',
    present: '随机以40、80或120的威力攻击；也可能不造成伤害，反而回复目标的体力。',
    seismictoss: user => `造成与自己等级相同的伤害${user?.level ? `（${user.level}点）` : ''}。`,
    nightshade: user => `造成与自己等级相同的伤害${user?.level ? `（${user.level}点）` : ''}。`,
    sonicboom: '固定造成20点伤害。', dragonrage: '固定造成40点伤害。',
    superfang: '使目标失去当前剩余体力的一半。', naturesmadness: '使目标失去当前剩余体力的一半。',
    endeavor: '当目标体力比自己多时，将目标的体力削减到和自己相同。',
    finalgambit: '造成与自己当前剩余体力相同的伤害，然后自己倒下。',
    psywave: '随机造成自己等级一半到1.5倍的伤害。',
    trickroom: '5回合内，通常由速度较慢的宝可梦先行动。再次使用可解除。',
    gravity: '5回合内重力增强，招式更容易命中，飞行或飘浮的宝可梦也会落地。',
    naturepower: '借助周围环境的力量，根据当前场地使出不同的招式。',
  };

  function setDesc(d) { DESC = d && typeof d === 'object' ? d : {}; }
  function descOf(move, baseId) {
    const ids = [move?.id, baseId || move?._baseId, String(move?.id || '').startsWith('hiddenpower') ? 'hiddenpower' : ''].filter(Boolean);
    for (const id of ids) {
      if (Object.prototype.hasOwnProperty.call(DESC, id) && typeof DESC[id] === 'string' && DESC[id]) return DESC[id];
      if (EXTRA_DESC[id]) return EXTRA_DESC[id];
    }
    return '';
  }
  const frac = value => {
    if (!Array.isArray(value) || !value[1]) return '';
    const [a, b] = value;
    return a === b ? '全部' : `${a}/${b}`;
  };
  function boostText(boosts, who) {
    const groups = {};
    for (const [stat, amount] of Object.entries(boosts || {})) {
      if (!amount || !STAT_ZH[stat]) continue;
      (groups[amount] ||= []).push(STAT_ZH[stat]);
    }
    return Object.entries(groups).map(([amount, names]) => `${who}的${names.join('、')}${+amount > 0 ? '提高' : '降低'}${Math.abs(+amount)}级`).join('，');
  }
  function statusText(status) { return status === 'slp' ? '睡眠' : STATUS_ZH[status] || ''; }
  function effectLines(move, user) {
    const lines = [], notes = [], warns = [];
    const id = move.id || '', detail = DETAIL[id] || EXTRA_DESC[id];
    if (detail) {
      lines.push(typeof detail === 'function' ? detail(user) : detail);
    } else {
      if (move.priority > 0) lines.push('先制招式，通常比普通招式先出手。');
      if (move.priority < 0) lines.push('通常会比普通招式晚出手。');
      if (move.willCrit) lines.push('通常必定击中要害。');
      else if (move.critRatio >= 2) lines.push('容易击中要害。');
      if (move.multihit) {
        if (Array.isArray(move.multihit)) lines.push(`一回合内连续攻击${move.multihit[0]}～${move.multihit[1]}次。`);
        else if (move.multiaccuracy) lines.push(`最多连续攻击${move.multihit}次，每次攻击都可能落空。`);
        else lines.push(`一回合内连续攻击${move.multihit}次。`);
      }
      if (move.drain) lines.push(`回复造成伤害${frac(move.drain)}的体力。`);
      if (move.recoil) lines.push(`自己受到造成伤害${frac(move.recoil)}的反作用力伤害。`);
      if (move.heal) lines.push(`回复自己最大体力的${frac(move.heal)}。`);
      if (move.ohko) lines.push('一击必杀：命中后使目标直接倒下；对等级比自己高的目标无效。');
      if (move.selfdestruct === 'always' || move.selfdestruct === 'ifHit') lines.push(move.selfdestruct === 'always' ? '使用后自己会倒下。' : '命中后自己会倒下。');
      const who = ['self', 'allies', 'allySide', 'allyTeam'].includes(move.target) ? '自己' : '目标';
      if (move.status && statusText(move.status)) lines.push(`使${who}陷入${statusText(move.status)}状态。`);
      if (move.boosts) { const s = boostText(move.boosts, who); if (s) lines.push(s + '。'); }
      if (move.self?.boosts) { const s = boostText(move.self.boosts, '自己'); if (s) lines.push('使用后，' + s + '。'); }
      for (const secondary of move.secondaries || (move.secondary ? [move.secondary] : [])) {
        if (!secondary) continue;
        const pre = (secondary.chance ?? 100) >= 100 ? '命中后，' : `命中后有${secondary.chance}%的概率`;
        if (secondary.status && statusText(secondary.status)) lines.push(`${pre}使目标陷入${statusText(secondary.status)}状态。`);
        if (secondary.volatileStatus === 'flinch') lines.push(`${pre}使目标畏缩；目标尚未行动时，会失去本回合的行动机会。`);
        if (secondary.volatileStatus === 'confusion') lines.push(`${pre}使目标混乱。`);
        if (secondary.boosts) { const s = boostText(secondary.boosts, '目标'); if (s) lines.push(pre + s + '。'); }
        if (secondary.self?.boosts) { const s = boostText(secondary.self.boosts, '自己'); if (s) lines.push(pre + s + '。'); }
      }
      if (move.volatileStatus === 'confusion') lines.push('使目标混乱；混乱时有概率打伤自己，无法使出招式。');
      if (move.weather && WEATHER_ZH[String(move.weather).toLowerCase()]) lines.push(`天气变为${WEATHER_ZH[String(move.weather).toLowerCase()]}。`);
      if (move.terrain && TERRAIN_ZH[String(move.terrain).toLowerCase()]) lines.push(`场地变为${TERRAIN_ZH[String(move.terrain).toLowerCase()]}。`);
      if (SIDE_ZH[move.sideCondition]) lines.push(SIDE_ZH[move.sideCondition]);
    }
    if (move._isZ && !Z_IDS.has(id)) notes.push('Ｚ招式：每队每场战斗只能发动一次。');
    if (move._isMax) notes.push('极巨招式：消耗原招式的招式点数。');
    if (!lines.length && !descOf(move)) lines.push(move.category === 'Status' ? '使用后产生辅助效果。' : '对目标造成伤害。');
    return { lines: [...new Set(lines.filter(Boolean))], notes, warns };
  }

  // 不展示旧的简化伤害预报，也不拿技术说明代替对战提示。
  function matchup() { return null; }
  function describe(move, ctx = {}) {
    const { user = null, baseMove = null } = ctx;
    const zhType = ctx.zhType || (t => TYPE_ZH[t] || '未知');
    const zhCat = ctx.zhCat || (c => CAT_ZH[c] || '变化');
    const ppm = baseMove || move;
    const genericPower = (Z_IDS.has(move.id) && move.basePower === 1) || ((move.isMax || String(move.id).startsWith('gmax') || String(move.id).startsWith('max')) && move.basePower === 10);
    const rows = [
      ['属性', zhType(move.type)], ['分类', zhCat(move.category)],
      ['威力', genericPower ? '随原招式变化' : move.basePower ? String(move.basePower) : move.category === 'Status' ? '—' : '随效果变化'],
      ['命中', move.accuracy === true || move.accuracy == null ? move.category === 'Status' ? '—' : '必定命中' : move.accuracy + '%'],
      ['招式点数', ppm.id === 'struggle' ? '—' : `${ppm.ppLeft ?? ppm.pp}/${ppm.pp}`],
      ['先制度', move.priority ? (move.priority > 0 ? '+' : '') + move.priority : '0'],
      ['对象', TARGET_ZH[move.target] || '由招式效果决定'],
    ];
    const fx = effectLines(move, user), desc = descOf(move, baseMove?.id);
    return {
      name: ctx.name || global.PKMShowdownText?.moves?.[move.id]?.name || move.name || '未命名招式',
      type: move.type, category: move.category, rows, desc,
      effects: fx.lines.filter(line => line !== desc), notes: fx.notes, warns: fx.warns,
      matchup: null, foeName: ctx.foeName || ctx.foe?.name || '',
    };
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function html(info) {
    const li = arr => arr.map(x => `<li>${esc(x)}</li>`).join('');
    return `<header class="mi-head"><span class="mi-name">${esc(info.name)}</span><span class="mi-type">${esc(info.rows[0][1])}</span><span class="mi-cat cat-${esc(String(info.category).toLowerCase())}">${esc(info.rows[1][1])}</span></header>`
      + `<dl class="mi-rows">${info.rows.slice(2).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      + (info.desc ? `<p class="mi-desc">${esc(info.desc)}</p>` : '')
      + (info.effects.length ? `<section class="mi-sec"><h4>效果</h4><ul>${li(info.effects)}</ul></section>` : '')
      + (info.notes.length ? `<section class="mi-sec mi-notes"><h4>使用提示</h4><ul>${li(info.notes)}</ul></section>` : '');
  }
  function tooltip(info) {
    return [`${info.name}（${info.rows[0][1]}·${info.rows[1][1]}）`, info.desc || info.effects.join('；'), '长按或点 ⓘ 查看详细说明'].filter(Boolean).join('\n');
  }
  global.PKMMoveInfo = { version: VERSION, setDesc, describe, html, tooltip, effectLines, matchup, _desc: () => DESC };
})(typeof window !== 'undefined' ? window : globalThis);
