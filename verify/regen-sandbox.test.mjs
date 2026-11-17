// 随时间回血（队伍 + 电脑仓库）与沙盒模式关闭主线。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const G=require('../st-bridge/plot-guard.js');
const world=JSON.parse(fs.readFileSync(new URL('../st-bridge/kanto-world.json',import.meta.url),'utf8'));
const book=G.makeEvents(world.entries);
const src=fs.readFileSync(new URL('../st-bridge/bridge.js',import.meta.url),'utf8');

test('沙盒模式：开局与之后都不排主线事件',()=>{
  assert.equal(G.schedule(book,[],'1997年 5月22日 07:00',{mode:'沙盒模式'}).kind,'sandbox');
  assert.equal(G.schedule(book,[{模式:'沙盒模式',剧情:'EP001｜节点1｜进行中'}],'1997年 5月22日 07:30',{}).kind,'sandbox');
  assert.equal(G.schedule(book,[{模式:'沙盒模式',剧情:'自由｜节点0｜进行中'}],'1997年 8月1日 12:00',{mode:'沙盒模式'}).kind,'sandbox');
  assert.equal(G.dateActivation(book,[],'1997年 5月22日 07:00',{mode:'沙盒模式'}),null);
});
test('同行 / 小智模式照常排主线',()=>{
  assert.equal(G.schedule(book,[],'1997年 5月22日 07:00',{mode:'同行模式'}).event.id,'EP001');
  assert.equal(G.schedule(book,[{模式:'小智模式',剧情:'EP001｜节点6｜完成'}],'1997年 5月22日 09:40',{mode:'小智模式'}).event.id,'EP002');
});
test('桥接：沙盒提示关闭主线与幕后视角，开局登记的模式优先',()=>{
  assert.match(src,/plan\.kind==='sandbox'\)return `【沙盒模式·主线已关闭】/);
  assert.match(src,/不写【幕后】场景/);
  assert.match(src,/registered==='沙盒模式'\?'沙盒模式'/);
});

// 取出回血代码块，用最小桩运行
const i0=src.indexOf('// 随时间回血'),i1=src.indexOf('// Center recovery writes explicit numeric full HP');
const block=src.slice(i0,i1);
const make=new Function('G',`
 const PKMPlotGuard=G;const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);const hasMon=s=>!!(s&&(s.species||s.name));
 const migrateCalendarClocks=()=>{};const latestState=()=>null;
 function parseDate(s){const d=G.date(s);return d?{...d,h:d.hasTime?d.h:12,mi:d.hasTime?d.mi:0}:null;}
 function panelHpInfo(s){const max=Number(s.maxHp)||0;const has=s.hp!==null&&s.hp!==undefined;const hp=has?Math.min(Number(s.hp),max):max;return{hp,max,faint:hp===0||s.status==='濒死'};}
 ${block}
 return {applyPassiveRegen,setHpRegenBaseline,REGEN_RATE};`);
const R=make(G);
const mk=()=>({world:{},integration:{},party:{slots:[{species:'角金鱼',uid:'a',hp:10,maxHp:30},{species:'小拉达',uid:'b',hp:0,maxHp:20,status:'濒死'}],box:[{species:'波波',uid:'c',hp:0,maxHp:40,status:'濒死',pp:{'撞击':3}},{species:'烈雀',uid:'d',hp:5,maxHp:20,status:'中毒'}]}});
test('队伍：每游戏小时恢复 10%（至少 1），濒死不会自己醒来',()=>{
  const p=mk();R.applyPassiveRegen(p,'1997年 5月22日 08:00');
  R.applyPassiveRegen(p,'1997年 5月22日 10:30');
  assert.equal(p.party.slots[0].hp,10+3*2);assert.equal(p.party.slots[1].hp,0);
  R.applyPassiveRegen(p,'1997年 5月22日 20:00');assert.equal(p.party.slots[0].hp,30);
});
test('电脑仓库：每小时恢复 25%，濒死也会恢复；回满时治愈状态并回满 PP',()=>{
  const p=mk();R.applyPassiveRegen(p,'1997年 5月22日 08:00');
  R.applyPassiveRegen(p,'1997年 5月22日 10:00');
  assert.equal(p.party.box[0].hp,20);assert.equal(p.party.box[0].status,null);
  assert.equal(p.party.box[1].hp,15);assert.equal(p.party.box[1].status,'中毒');
  R.applyPassiveRegen(p,'1997年 5月22日 12:00');
  assert.equal(p.party.box[0].hp,40);assert.equal(p.party.box[0].pp,null);
  assert.equal(p.party.box[1].hp,20);assert.equal(p.party.box[1].status,null);
});
test('换到仓库不丢计时；放生后删除计时；时间倒退只重设基准',()=>{
  const p=mk();R.applyPassiveRegen(p,'1997年 5月22日 08:00');
  const mon=p.party.slots.shift();p.party.box.push(mon);
  R.applyPassiveRegen(p,'1997年 5月22日 09:00');assert.equal(mon.hp,10+8);
  p.party.box.pop();R.applyPassiveRegen(p,'1997年 5月22日 09:00');assert.equal(p.integration.hpRegenGameMinute.a,undefined);
  const before=p.party.slots[0].hp;R.applyPassiveRegen(p,'1997年 5月22日 07:00');assert.equal(p.party.slots[0].hp,before);
});
