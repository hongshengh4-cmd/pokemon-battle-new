// NPC 好感：守卫证据、真实聊天回放、原子结算与 MVU 来源绑定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const guard = require('../st-bridge/patch-guard.js');
const bond = require('../st-bridge/bond-sync.js');
const { replay } = require('./replay-chat.cjs');

const JOY = ['乔伊小姐', '乔伊'], OTHERS = ['小智', '小霞', '小刚'];
const ev = text => guard.directInteraction(text, JOY, '碧悠姬', '向乔伊小姐道谢', OTHERS);

test('守卫：真实完成的直接互动被接受（旧守卫全部误拒的写法）', () => {
  for (const t of [
    '碧悠姬向乔伊小姐道谢。', '我向乔伊小姐道谢。', '碧悠姬走到柜台前，向乔伊小姐道谢。',
    '碧悠姬向乔伊小姐道谢说自己不会乱来。', '碧悠姬向乔伊小姐道谢，并表示自己不打算冒险。',
    '乔伊小姐向你递还治疗好的精灵球。', '我来到乔伊小姐面前，感谢她的帮助。', '你拒绝了乔伊小姐的请求。',
    '休整完毕的碧悠姬带着拉鲁拉丝向深灰市宝可梦中心的乔伊小姐道别。',
  ]) assert.equal(ev(t), true, t);
});

test('守卫：在场、否定、计划、假设、引号、旁观、第三方互动均不算证据', () => {
  for (const t of [
    '你与乔伊小姐只是同行。', '你没有向乔伊小姐道谢。', '如果你向乔伊小姐道谢，她会很高兴。',
    '你准备向乔伊小姐道谢。', '你站在一旁，小智向乔伊小姐道谢。', '乔伊小姐说道：“我向小智道谢。”',
    '你看着小智向乔伊小姐道谢。', '小智向乔伊小姐道谢，你站在旁边。', '乔伊小姐说：“你应该感谢小智。”',
    '我希望能帮助乔伊小姐。', '你差点救下乔伊小姐。', '你不想向乔伊小姐咨询。', '你拒绝向乔伊小姐道谢。',
    '碧悠姬梦见自己向乔伊小姐道谢。', '“我刚办完入住。”碧悠姬看了乔伊小姐一眼。',
  ]) assert.equal(ev(t), false, t);
});

const pathSegs = p => String(p).replace(/^\//, '').split('/').filter(Boolean);
const helpers = (love = { joy: 10 }) => ({ pathSegs, playerName: '碧悠姬', npcKey: k => k, existingNpc: () => true,
  aliases: k => ({ joy: JOY, ash: ['小智'] }[k] || [k]), love: k => love[k], otherNames: OTHERS });
const patch = (ops, body = '碧悠姬向乔伊小姐道谢。') => `<content>${body}</content><UpdateVariable><JSONPatch>${JSON.stringify(ops)}</JSONPatch></UpdateVariable>`;
const trio = (k, d, last = d, why = '向乔伊小姐道谢') => [
  { op: 'delta', path: `/pkm/npcs/records/${k}/love`, value: d },
  { op: 'replace', path: `/pkm/npcs/records/${k}/last`, value: last },
  { op: 'replace', path: `/pkm/npcs/records/${k}/why`, value: why }];

test('守卫：三项必须同块、净值±1..10、last 等值、why ≤15 字且不越界', () => {
  assert.deepEqual(guard.parse(patch(trio('joy', 2)), helpers()).acceptedNpcs, ['joy']);
  const bad = [trio('joy', 12, 2), trio('joy', 12), trio('joy', 2, 3), trio('joy', 2, 2, '这是一个明显超过十五个汉字长度限制的理由文本'),
    trio('joy', 0), trio('joy', 1.5), trio('joy', 2).slice(0, 2)];
  for (const ops of bad) assert.deepEqual(guard.parse(patch(ops), helpers()).acceptedNpcs, [], JSON.stringify(ops));
  // 部分越界：只计入到 100 为止的部分，last 同步改为实际增量；已在上限再加：静默忽略，不弹警告。
  const clamp = guard.parse(patch(trio('joy', 3)), helpers({ joy: 99 }));
  assert.deepEqual(clamp.acceptedNpcs, ['joy'], '部分越界按上限截断后采用');
  assert.deepEqual(clamp.ops.filter(o => o.segs[2] === 'records').map(o => [o.segs[4], o.value]), [['love', 1], ['last', 1], ['why', '向乔伊小姐道谢']]);
  assert.equal(clamp.warnings.length, 0);
  const capped = guard.parse(patch(trio('joy', 2)), helpers({ joy: 100 }));
  assert.deepEqual([capped.acceptedNpcs, capped.capped, capped.warnings, capped.ops.filter(o => o.segs[2] === 'records').length], [[], ['joy'], [], 0], '已满 100 再加分 = 无变化、无警告');
  const floor = guard.parse(patch(trio('joy', -2)), helpers({ joy: -100 }));
  assert.deepEqual([floor.capped, floor.warnings], [['joy'], []]);
  const split = `<content>碧悠姬向乔伊小姐道谢。</content><UpdateVariable><JSONPatch>${JSON.stringify(trio('joy', 2).slice(0, 1))}</JSONPatch></UpdateVariable><UpdateVariable><JSONPatch>${JSON.stringify(trio('joy', 2).slice(1))}</JSONPatch></UpdateVariable>`;
  assert.deepEqual(guard.parse(split, helpers()).acceptedNpcs, [], '三项分属不同块');
});

test('真实聊天回放：11 组历史三项的新判定（只用于验证，不回补旧存档）', { skip: !fs.existsSync('/home/user/uploads/宝可梦·关都之旅 - 2026-11-16@07h46m51s685ms.json') }, () => {
  const rows = replay(), got = Object.fromEntries(rows.map(r => [`${r.messageId}:${r.npc}`, r.accepted]));
  assert.equal(rows.length, 11);
  assert.deepEqual(got, {
    '52:ash': false, '52:misty': false, // 总值写成 delta 且 last 不等
    '88:brock': true, '90:joy': true, '90:ash': true, '94:ash': false, '94:misty': false, // 94：未等两人、没有直接互动
    '96:joy': true, '98:joy': true, '102:joy': true, '132:jenny': true,
  });
  for (const r of rows.filter(x => x.accepted)) assert.ok(r.evidence && !/^“/.test(r.evidence), JSON.stringify(r));
});

const base = () => ({ npcs: { records: { joy: { name: '乔伊小姐', love: 10, last: 0, why: null, lastInteraction: -1, met: true }, ash: { name: '小智', love: 14, last: 0, why: null, lastInteraction: -1 } } } });
const plan = (ops, body, love) => guard.parse(patch(ops, body), { ...helpers(love), pathSegs: p => String(p).replace(/^\//, '').split('/') });

test('原子结算：只按上一楼快照计算，重复同步幂等，不会二次加分', () => {
  const b = base(), p = plan(trio('joy', 2)), cur = structuredClone(b);
  const meta = { messageId: 5, swipe: 0, signature: 'abc' };
  const r1 = bond.settle(cur, b, p, meta);
  assert.deepEqual(r1.accepted, ['joy']);
  assert.deepEqual([cur.npcs.records.joy.love, cur.npcs.records.joy.last, cur.npcs.records.joy.why, cur.npcs.records.joy.lastInteraction], [12, 2, '向乔伊小姐道谢', 5]);
  const r2 = bond.settle(cur, b, p, meta);
  assert.equal(cur.npcs.records.joy.love, 12); assert.equal(r2.changed, false);
  assert.equal(cur.integration.bondAudit.length, 1);
});

test('原子结算：旧桥/MVU 已直接执行原始补丁时也收敛到同一结果；被拒三项回滚', () => {
  const b = base(), good = plan(trio('joy', 2)), cur = structuredClone(b);
  Object.assign(cur.npcs.records.joy, { love: 12, last: 2, why: '向乔伊小姐道谢' }); // 已被外部执行一次
  bond.settle(cur, b, good, { messageId: 7, signature: 's' });
  assert.equal(cur.npcs.records.joy.love, 12);
  const wrong = plan(trio('ash', 12, 2, '并肩作战'), '你和小智只是同行。'), cur2 = structuredClone(b);
  Object.assign(cur2.npcs.records.ash, { love: 26, last: 2, why: '并肩作战' });
  const r = bond.settle(cur2, b, wrong, { messageId: 8, signature: 't' });
  assert.deepEqual(r.rejected, ['ash']);
  assert.deepEqual([cur2.npcs.records.ash.love, cur2.npcs.records.ash.last, cur2.npcs.records.ash.why], [14, 0, null]);
});

test('原子结算：人工或其他来源改过的数值不被覆盖，只给出警告', () => {
  const b = base(), p = plan(trio('joy', 2)), cur = structuredClone(b);
  cur.npcs.records.joy.love = 40;
  const r = bond.settle(cur, b, p, { messageId: 9, signature: 'u' });
  assert.equal(cur.npcs.records.joy.love, 40); assert.deepEqual(r.conflicts, ['joy']); assert.ok(r.warnings.length);
});

test('MVU：关系指令在执行前被隔离；其他指令保留；insert/move 路径也能识别', () => {
  const cmds = [
    { type: 'add', args: ['["pkm"]["npcs"]["records"]["joy"]["love"]', '2'] },
    { type: 'set', args: ['pkm.npcs.records.joy.why', '"x"'] },
    { type: 'insert', args: ['["pkm"]["npcs"]["records"]', '"newguy"', '{}'] },
    { type: 'insert', args: ['["pkm"]["npcs"]["records"]["joy"]', '"notes"', '"hi"'] },
    { type: 'move', args: ['["pkm"]["money"]', '["pkm"]["npcs"]["records"]["joy"]["last"]'] },
    { type: 'set', args: ['["pkm"]["money"]', '100'] },
  ];
  const removed = bond.quarantine(cmds);
  assert.equal(removed.length, 4);
  assert.deepEqual(cmds.map(c => c.args[1]), ['"notes"', '100']);
});

test('MVU 来源绑定：只接受与最后一条 AI 消息/当前候选完全一致的内容', () => {
  const text = '正文<UpdateVariable>[]</UpdateVariable>';
  const chat = [{ is_user: true, mes: 'hi' }, { is_user: false, mes: text, swipe_id: 1 }];
  const tok = bond.bind(chat, text, 3);
  assert.equal(tok.id, 1); assert.equal(tok.swipe, 1);
  assert.equal(bond.current(tok, chat, 3), true);
  assert.equal(bond.current(tok, chat, 4), false, '生成序号变化');
  chat[1].swipe_id = 2; assert.equal(bond.current(tok, chat, 3), false, '换了候选');
  chat[1].swipe_id = 1;
  assert.equal(bond.bind(chat, '别的内容', 3), null);
  const dup = [{ is_user: false, mes: text }, { is_user: true, mes: 'x' }, { is_user: false, mes: text }];
  assert.equal(bond.bind(dup, text, 0), null, '同文多楼：不猜测');
  assert.equal(bond.bind([{ is_user: false, mes: text }, { is_user: true, mes: 'x' }], text, 0), null, '不是最新楼');
});

test('守卫：常青道馆回合（2026-11-16 反馈）——旁观对象、对别人说话不算；代词主语与“抛给你”算', () => {
  const R = { jessie: ['武藏'], james: ['小次郎'], meowth: ['喵喵'], ash: ['小智'], brock: ['小刚'] };
  const O = ['小智', '小霞', '小刚', '武藏', '小次郎', '喵喵'];
  const evid = (t, k) => guard.directInteraction(t, R[k], '景鹏飞', '测试', O);
  const glance = '你也微笑着看了一眼高台上正偷偷调低旋钮的喵喵，开口提醒道：“小智，要我帮忙吗？”';
  assert.equal(evid(glance, 'meowth'), false, '只看了喵喵一眼，提醒的是小智');
  assert.equal(evid(glance, 'ash'), true, '对小智的提醒仍算与小智互动');
  const toss = '武藏眼珠一转，立刻清了清嗓子。她伸手摘下胸口的徽章，手腕一扬，将其朝着台下的你抛了过来：“拿去吧！”';
  assert.equal(evid(toss, 'jessie'), true, '代词“她”承接上一句主语武藏');
  assert.equal(evid('小次郎站在一旁。她伸手摘下胸口的徽章，朝着台下的你抛了过来。', 'jessie'), false, '上一句主语不是武藏时不承接');
  assert.equal(evid('武藏骂了一句。小霞走过来。她把果汁递给了你。', 'jessie'), false, '中间换了主语就不承接');
  assert.equal(evid('当你走回场边时，小刚第一个迎上来，由衷地为你鼓掌祝贺。', 'brock'), true);
  assert.equal(evid('喵喵压低声音说道：“那个一飞小鬼头以前救过我们一命喵！”', 'meowth'), false, '转述往事不算本回合互动');
});

test('守卫：用户截图那一楼按新规则复核', () => {
  const text = fs.readFileSync(new URL('./fixtures/viridian-gym-floor.txt', import.meta.url), 'utf8');
  const R = { ash: ['小智'], misty: ['小霞'], brock: ['小刚'], jessie: ['武藏'], james: ['小次郎'], meowth: ['喵喵'] };
  const love = { ash: 100, misty: 100, brock: 100, jessie: 34, james: 39, meowth: 46 };
  const plan = guard.parse(text, { pathSegs, playerName: '景鹏飞', love: k => love[k], aliases: k => R[k] || [k], otherNames: Object.values(R).flat(), npcKey: k => k, existingNpc: () => true });
  assert.deepEqual(plan.acceptedNpcs, ['jessie']);
  assert.deepEqual(plan.capped, ['ash', 'misty', 'brock']);
  assert.equal(plan.warnings.length, 2);
  assert.ok(plan.warnings.every(w => /james|meowth/.test(w) && /直接互动/.test(w)));
});

test('守卫：规划/记忆块里的名字不算正文；NPC 转向你当面道谢算互动', () => {
  const G = ['小茂'], O = ['小智', '小霞', '小刚'];
  const evid = t => guard.directInteraction(t, G, '一飞', '测试', O);
  assert.equal(evid('<content><story_driver>你派幸福蛋治疗小茂。</story_driver>小茂坐上跑车离开了。</content>'), false, '剧情规划块不算');
  assert.equal(evid('<content>小茂离开了。<Memory>你帮助了小茂。</Memory></content>'), false, '记忆摘要不算');
  assert.equal(evid('小茂咬了咬牙站起身来。他先是朝着你郑重地点了点头：“谢了，一飞。”'), true, '代词承接 + 转向你 + 引号内道谢');
  assert.equal(evid('小茂朝着你点了点头：“小智，谢了。”'), false, '道谢对象是别人');
  assert.equal(evid('小茂看着你，对小智说：“谢谢。”'), false, '对别人说的');
  assert.equal(evid('小茂站在你身边：“谢了。”'), false, '只是在你身边，不是对你');
});

test('守卫：朝你点头后另起一段的当面问候算互动；对别人的不算', () => {
  const evid = t => guard.directInteraction(t, ['小茂'], '一飞', '测试', ['小智', '小霞', '小刚']);
  assert.equal(evid('小茂走了下来。他看了你一眼，先朝你点了点头：\n\n“好久不见了，一飞。不愧是我认可的劲敌。”'), true);
  assert.equal(evid('小茂走了下来，先朝你点了点头：\n\n“小智，好久不见。”'), false, '另起一段但开口叫的是小智');
  assert.equal(evid('小茂走了下来，朝你点了点头：\n\n小智也跟着笑了：“好久不见。”'), false, '下一段不是他的引语');
});
