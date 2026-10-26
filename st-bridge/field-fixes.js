// field-fixes-20261026-1: pure habitat / completed-treatment rules. No storage or DOM access.
export const WATER_POOLS = Object.freeze({
 river: [['蚊香蝌蚪',8,22,4],['角金鱼',8,24,3],['鲤鱼王',5,20,4],['可达鸭',10,24,2],['呆呆兽',12,25,1]],
 lake: [['角金鱼',10,26,3],['鲤鱼王',5,22,4],['蚊香蝌蚪',8,24,3],['可达鸭',10,25,2],['呆呆兽',12,26,2],['金鱼王',25,32,1]],
 sea: [['玛瑙水母',10,25,5],['毒刺水母',25,35,1],['海星星',12,28,3],['墨海马',10,28,3],['大舌贝',12,28,2],['大钳蟹',12,28,2]],
 estuary: [['大钳蟹',10,26,4],['玛瑙水母',12,25,3],['墨海马',12,26,2],['大舌贝',12,26,2]],
 coast: [['大钳蟹',10,26,4],['大舌贝',10,26,3],['海星星',12,28,3],['墨海马',12,28,2],['玛瑙水母',10,25,2]],
});
export const HABITAT_LABELS = {river:'河流淡水',lake:'湖泊淡水',sea:'海洋水域',estuary:'河口咸淡水',coast:'海岸潮间带',fresh:'淡水水域',unknownWater:'水域类型待确认',land:'陆地'};
export function isCenterLocation(value) {
 const s=String(value||'');
 if(!/(?:宝可梦|神奇宝贝|精灵)(?:中心|医疗中心)|Pok[eé]mon\s*Center/i.test(s))return false;
 if(/(?:中心|Center)(?:外|附近|门外|门口|旁|对面|前(?!台|厅))|(?:前往|去往|赶往).*(?:中心|Center)|中心.*(?:途中|路上)/i.test(s))return false;
 return !/(?:中心|Center).*[·>→\/](?:森林|草地|河畔|湖边|海滩|道路|野外|山洞)/i.test(s);
}
export function habitatAt(value) {
 const s=String(value||'').normalize('NFKC').replace(/皮卡丘森林/g,'皮卡丘的森林');
 // The rightmost local feature wins: e.g. 枯叶港·河流 is fresh, 湖边·港口 is marine.
 const hits=[];
 const add=(kind,re)=>{for(const m of s.matchAll(re))hits.push({kind,index:m.index+m[0].length});};
 add('river',/河流|河畔|河边|河岸|溪流|溪边|溪畔|江边|江畔|瀑布|(?<![海星])河(?!口)/g);
 add('lake',/湖泊|湖畔|湖边|湖岸|池塘|水塘|水库|湖|池(?!袋|田)/g);
 add('sea',/海洋|大海|海面|海上|海路|近海|外海|远海|海域|海底|深海|海中|海水|沿海|远洋|海港|港湾|港口|码头|枯叶港|鸠羽港/g);
 add('sea',/(?:^|[·>→\/\s])海(?=$|[·>→\/\s])/g);
 add('coast',/海岸|海边|海滨|海滩|沙滩|潮间带|礁石滩|海湾|海崖/g);
 add('estuary',/入海口|河口|咸淡水|河海交汇/g);
 hits.sort((a,b)=>b.index-a.index);
 if(hits.length) return hits[0].kind;
 // Don't infer water from an island or a coastal town name alone.
 if(/(?:^|[^\d])(?:19|20|21|十九|二十|二十一)\s*号?\s*(?:道路|水路|航路)|(?:12|13|十二|十三)\s*号?\s*(?:道路|水路)/.test(s))return 'sea';
 if(/淡水/.test(s))return 'fresh';
 if(/水边|水岸|岸边|岸畔|水域|水路/.test(s))return 'unknownWater';
 return 'land';
}
export function habitatPool(kind) {
 if(kind==='fresh')return WATER_POOLS.river;
 return WATER_POOLS[kind] || null;
}
export function indoorAt(value) {
 const s=String(value||'');
 // Explicit outside locations should not be blocked by a facility name earlier in the string.
 if(/(?:中心|研究所|道馆|商店|旅馆|船舱)(?:外|门外|旁|对面)|[·>→\/](?:海面|海边|河畔|河边|湖边|沙滩|森林|草地|野外|\d+号道路)$/.test(s))return false;
 return /宝可梦中心|精灵中心|神奇宝贝中心|研究所|道馆|商店|酒店|旅馆|餐厅|船舱|会场|医院|教室|电视台|大楼|家中|屋内|(?:家|屋|店)(?:$|[·>→\/])/.test(s);
}
export function narrativeBody(text) {
 const raw=String(text||'');
 const content=[...raw.matchAll(/<content>([\s\S]*?)<\/content>/gi)].map(m=>m[1]);
 let s=content.length?content.join('\n'):raw;
 return s.replace(/<(think|thinking|analysis|UpdateVariable|pkm_state|pkm_result|pkm_profile)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,'').replace(/<[^>]+>/g,'').trim();
}
export function completedTreatment({text,location,party,playerName=''}) {
 if(!isCenterLocation(location))return null;
 const body=narrativeBody(text);if(!body)return null;
 const completion=/(?:治疗|医治|疗愈|恢复)(?:已经|已|全部|全都|都|了|工作|过程|程序|顺利|彻底|完全|全面|\s)*(?:完成|完毕|结束)|(?:已|已经|全部|全都|都|完全|彻底).{0,8}恢复(?:了)?(?:全部|所有|全部的|满)?(?:体力|健康|精神|HP|生命值)|恢复(?:了)?(?:全部|所有|满)(?:体力|HP|生命值)|恢复了(?:健康|体力)|恢复(?:到|至|了)?(?:最佳|完好|满血)(?:的)?状态|(?:治疗|医治)好(?:了|的)|(?:完成|结束)了?(?:全部|全队|所有)?(?:治疗|医治)/i;
 const statements=body.split(/[。！？!?；;\n]+/).map(x=>x.trim()).filter(Boolean);
 const targets=new Set(),names=(party||[]).filter(m=>m&&(m.species||m.name));let all=false,found=false;
 const otherNames=['小智','小霞','小刚','小茂','武藏','小次郎','其他训练家','别人的','对方','她的','他的'].filter(x=>x!==playerName);
 for(const sentence of statements){
  if(!completion.test(sentence))continue;
  if(/(?:使用|用了|喝下|服用|吃下).{0,10}(?:伤药|药水|树果|橙橙果)|(?:伤药|药水|树果|橙橙果).{0,8}(?:恢复|治疗)/.test(sentence))continue;
  if(/尚未|未能|没有|还没|并未|无法|不能|准备|打算|计划|需要|将要|即将|稍后|等会|待会|治疗前|治疗中|正在治疗|如果|假如|只要|的话|预计|将会|就会|会恢复|能恢复|可恢复|是否|还在/.test(sentence))continue;
  if(otherNames.some(n=>sentence.includes(n))&&!/(?:你的|你所有|你全部|你的全|自己(?:的)?队伍|你的队伍)/.test(sentence))continue;
  if(!/(?:乔伊|吉利蛋|护士|医护|治疗|医治|治疗机|恢复仪)/.test(body)&&!/(?:你|全体|全员|全部|所有).*(?:恢复|体力|健康)/.test(sentence))continue;
  const at=body.indexOf(sentence),after=body.slice(at+sentence.length);
  if(/(?:遭到|受到|再次).{0,12}(?:攻击|伤害)|受伤|陷入(?:中毒|麻痹|灼伤|濒死)/.test(after))continue;
  found=true;
  const matched=names.filter(m=>[m.nickname,m.species,m.name].filter(Boolean).some(n=>sentence.includes(n)));
  if(/全体|全员|全部|所有|整支队伍|整个队伍|宝可梦们|精灵们|宝可梦都|宝可梦已经|精灵球.*(?:归还|还给)/.test(sentence)||!matched.length)all=true;
  else matched.forEach(m=>targets.add(m.uid||m.slot||m.species||m.name));
 }
 if(!found)return null;
 return {all,targets:[...targets]};
}
