/* 野生捕获与精灵球效果。概率底模是本项目原型规则，并非完整卡带捕获公式；
 * 各球倍率/条件按神奇宝贝百科对应道具说明。 */
(function (root) {
  'use strict';
  const BALLS = Object.freeze({
    pokeball: { id:'pokeball',name:'精灵球',multiplier:1,description:'基础捕获能力',color:'#fb5f87' },
    greatball: { id:'greatball',name:'超级球',multiplier:1.5,description:'捕获率 ×1.5',color:'#579bff' },
    ultraball: { id:'ultraball',name:'高级球',multiplier:2,description:'捕获率 ×2',color:'#f4c946' },
    masterball: { id:'masterball',name:'大师球',multiplier:255,description:'必定捕获',color:'#a66cff' },
    safariball: { id:'safariball',name:'狩猎球',multiplier:1,description:'捕获率 ×1',color:'#85bd78' },
    quickball: { id:'quickball',name:'先机球',multiplier:1,description:'双方尚未使用招式时捕获率 ×3',color:'#67bde8' },
    duskball: { id:'duskball',name:'黑暗球',multiplier:1,description:'夜晚或洞窟中捕获率 ×3',color:'#66548b' },
    timerball: { id:'timerball',name:'计时球',multiplier:1,description:'按双方累计使用招式数提高，最多 ×4',color:'#e77754' },
    repeatball: { id:'repeatball',name:'重复球',multiplier:1,description:'已登记捕获的种类，捕获率 ×3.5',color:'#e28c65' },
    netball: { id:'netball',name:'捕网球',multiplier:1,description:'水或虫属性捕获率 ×3.5',color:'#53b4a2' },
    nestball: { id:'nestball',name:'巢穴球',multiplier:1,description:'目标 1–29 级时按等级提高捕获率',color:'#a1bd64' },
    diveball: { id:'diveball',name:'潜水球',multiplier:1,description:'水中遭遇捕获率 ×3.5',color:'#58a6dd' },
    luxuryball: { id:'luxuryball',name:'豪华球',multiplier:1,description:'捕获率 ×1；友好度提升时额外 +1',color:'#a9954d' },
    healball: { id:'healball',name:'治愈球',multiplier:1,description:'捕获后恢复全部 HP、PP 并治愈异常状态',color:'#e68cae' },
  });
  function multiplierFor(p,ball,context={}) {
    const level=Math.max(1,Number(p?.level)||1),types=Array.isArray(p?.types)?p.types:[];
    switch(ball){
      case 'masterball': return 255;
      case 'quickball': return Number(context.moveCount)===0?3:1;
      case 'duskball': return context.darkArea?3:1;
      case 'timerball': {const moves=Math.max(0,Number(context.moveCount)||0);return moves<=10?1:moves<=20?2:moves<=30?3:4;}
      case 'repeatball': return (context.caughtSpecies||[]).includes(String(p?.speciesId||''))?3.5:1;
      case 'netball': return types.some(t=>t==='Water'||t==='Bug')?3.5:1;
      case 'nestball': return level>=1&&level<=29?Math.max(1,(41-level)/10):1;
      case 'diveball': return context.waterArea?3.5:1;
      default:return BALLS[ball]?.multiplier||1;
    }
  }
  function chance(p, ball, context={}) {
    if (!Object.hasOwn(BALLS, ball) || !p || p.fainted || p.hp <= 0 || p.maxHp <= 0) return 0;
    if(ball==='masterball')return 1;
    const health = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const status = ['slp', 'frz'].includes(p.status) ? 1.8 : p.status ? 1.35 : 1;
    return Math.min(.95, Math.max(.05, (.2 + .55 * (1 - health)) * multiplierFor(p,ball,context) * status));
  }
  function toSpec(p) {
    return { species: p.speciesId, level: Number(p.level), nature: p.nature || '', ability: p.ability || '',
      item: p.item || '', moves: p.moves.map(m => m.id), pp: p.moves.map(m => Number(m.ppLeft)), ivs: { ...p.ivs },
      nickname: p.hasNickname ? p.name : '', shiny: !!p.shiny, gender: p.gender || null,
      mechanic: '', megaForm: '', dynamaxForm: '', zType: '', teraType: '' };
  }
  function install(E) {
    E.Battle.prototype.captureReason = function (ball) {
      if (this.winner !== null) return '本场战斗已经结束。';
      if (this.encounterType !== 'wild' || this.teams[1].length !== 1) return '训练家的宝可梦不能捕获，请进入野生遭遇。';
      if (this.pendingSwitch !== null || this.cur(0).fainted) return '请先派出能够战斗的宝可梦。';
      const target = this.cur(1);
      if (!target || target.fainted || target.hp <= 0) return '已经失去战斗能力的宝可梦不能捕获。';
      if (!Number.isInteger(Number(target.level)) || Number(target.level) < 1 || Number(target.level) > 100) return '暂不支持捕获该等级的宝可梦。';
      if (target.isMega || target.dynamaxed || target.terastallized) return '暂不能捕获变身中的宝可梦，请等它恢复普通形态。';
      if (ball && !Object.hasOwn(BALLS, ball)) return '没有这种精灵球。';
      if (ball && !(Number.isInteger(this.ballStock?.[ball]) && this.ballStock[ball] > 0)) return '这种精灵球已经用完了。';
      return '';
    };
    E.Battle.prototype.captureTurn = function (action) {
      const start = this.log.length, ball = action.ball;
      const reason = this.captureReason(ball);
      if (!Object.hasOwn(BALLS, ball) || reason) {
        this.lastCapture = { allowed: false, reason: reason || '请选择精灵球。' };
        return [];
      }
      const target = this.cur(1), context={...(this.captureContext||{}),moveCount:Number(this.moveCount)||0};
      const probability = chance(target, ball, context);
      this.ballStock[ball]--;
      const success = ball==='masterball'||this.rng() < probability;
      const attempt = { allowed: true, ball, success, chance: probability, shakes: success ? 3 : Math.floor(this.rng() * 3),
        species: target.speciesId, name: target.name };
      this.say(`向 ${target.name} 投出了${BALLS[ball].name}！`);
      if (success) {
        this.turnCount++;
        const healed=ball==='healball',spec=toSpec(target);
        if(healed)spec.pp=target.moves.map(m=>Number(m.pp)||0);
        this.capture = { ...attempt, spec, hpAtCapture: healed?target.maxHp:target.hp, statusAtCapture: healed?null:target.status };
        this.outcome = 'captured'; this.winner = 0; this.pendingSwitch = null;
        target.captured = true;
        this.say(`${target.name} 被收服了！`);
      } else {
        this.say(`${target.name} 挣脱了精灵球！`);
        // A failed throw replaces the player's move. Enemy action, weather/status,
        // fainting, PP and field/Dynamax durations use the ordinary engine turn.
        this.turn({ kind: 'wait' });
      }
      this.lastCapture = attempt;
      return this.log.slice(start);
    };
  }
  root.PKMCapture = { BALLS, multiplierFor, chance, toSpec, install };
  if (root.PKMBattle) install(root.PKMBattle);
})(typeof globalThis !== 'undefined' ? globalThis : this);
