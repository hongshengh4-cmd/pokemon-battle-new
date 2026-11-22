// SPDX-License-Identifier: MIT
// Identity / tier wiring only. No battle decision, stats, budget or hidden data.
export const TIER_WIRING_BUILD='npc-tier-wiring-v1';
export const NPC_TIER_SOURCE_SHA256='bc9accf4f42bdeeb6e1c592a6dc81b20ec624737d320a430885c30771a0fe145';
const aliases={wild:'wild','野生':'wild',novice:'novice',beginner:'novice',rookie:'novice','新手':'novice','新人':'novice','初学者':'novice',regular:'regular',normal:'regular','普通':'regular','普通训练家':'regular',veteran:'veteran',experienced:'veteran','资深':'veteran','资深训练家':'veteran',leader:'leader',gymleader:'leader','馆主':'leader','道馆馆主':'leader',ace:'ace',acetrainer:'ace',elitetrainer:'ace','精英':'ace','精英训练家':'ace','大会冠军':'ace','联盟大会冠军':'ace',elite:'elite',elitefour:'elite','天王':'elite','四天王':'elite',champion:'champion','冠军':'champion','地区冠军':'champion','联盟冠军':'champion'};
const text=x=>typeof x==='string'||typeof x==='number'?String(x).trim().slice(0,240):'';
const norm=x=>text(x).normalize('NFKC').toLowerCase().replace(/[\s_\-·•]/g,'');
const simple=x=>Object.hasOwn(aliases,norm(x))?aliases[norm(x)]:null;
export function tierOf(value){
 const direct=simple(value);if(direct)return direct;
 const s=text(value).normalize('NFKC'),m=s.match(/^([^()\[\]【】〔〕]+?)\s*[(\[【〔]\s*([^()\[\]【】〔〕]+)\s*[)\]】〕]$/);
 if(!m)return null;
 const a=simple(m[1]),b=simple(m[2]);
 // Compound labels are accepted only when BOTH sides agree. Never guess from
 // prose, a future rank, or the English word elite inside an Ace label.
 return a&&a===b?a:null;
}
export const npcNameKey=x=>text(x).normalize('NFKC').toLowerCase().replace(/[\s.·•・]/g,'');
const genericKeys=new Set(['研究所','雷恩','吉波','巴比','电击兽队','水晶','未知图腾','炎帝','富二代大小姐','火箭队','火箭队首领','火箭队老大']);
const titlePrefix=/^(?:(?:关都|城都|橘子|石英|白银|地区|联盟)?(?:地区冠军|四天王|天王|冠军|精英训练家|资深训练家|普通训练家|新手训练家|新人训练家|新人|新手|训练家|道馆馆主|馆主)|[\p{Script=Han}]{1,12}道馆(?:馆主)?|[\s:：·•・\-])+$/u;
function entryList(input){
 if(Array.isArray(input))return input;
 if(input&&typeof input==='object')return Object.values(input.entries&&typeof input.entries==='object'?input.entries:input);
 return [];
}
function characterIdentity(e){
 const comment=text(e?.comment||e?.name||e?.memo);
 if(!/人物档案/.test(comment))return null;
 const content=typeof e.content==='string'?e.content:'';
 const nameLine=content.split(/\r?\n/).slice(0,12).find(l=>/^\s*(?:Name|名称|姓名)\s*[:：]/i.test(l));
 const rawName=nameLine?nameLine.replace(/^\s*(?:Name|名称|姓名)\s*[:：]\s*/i,'').trim():'';
 const commentName=comment.split('·').slice(1).join('·').replace(/^剧场版M\d+/i,'').split(/[（(]/)[0].trim();
 const name=rawName.split(/[（(]/)[0].trim()||commentName;
 if(!name)return null;
 // A group index can contain the same recall keys as individual profiles.
 // It must not compete with 柳伯/希巴/etc. or grant one rank to an entire group.
 if(/^(?:关都道馆馆主|城都道馆馆主|旅途中的重要配角|喵喵与火箭队|乔伊与君莎|超梦与梦幻)$/.test(name))return null;
 const keys=e.keys||e.key||e.strategy?.keys||[];
 const parenthetical=rawName.match(/[（(]([^（）()]+)[）)]/),declared=parenthetical?parenthetical[1].split(/[/／]|[，,]\s*英文译名\s*/):[];
 const names=[name,commentName,...declared,...(Array.isArray(keys)?keys:[])].flatMap(k=>String(k||'').split(/\s*[/／]\s*/)).map(s=>s.trim()).filter(s=>s&&!genericKeys.has(s)&&!/(?:道馆|研究所)$/.test(s));
 // Some keys intentionally recall a place, Pokemon, or group. They are not
 // identities. The only fuzzy decoration allowed below is a known title.
 return {name,names:[...new Set(names)],content};
}
export function recordsFromEntries(input){
 const out=[];
 for(const e of entryList(input)){
  if(!e||typeof e!=='object'||Number(e.uid??e.id)===6)continue;
  const identity=characterIdentity(e);if(!identity)continue;
  const current=[...identity.content.matchAll(/^\s*(?:[-*]\s*)?当前实力档位\s*[:：]\s*([^\r\n]+)/gm)].map(m=>tierOf(m[1]));
  const unique=[...new Set(current)],tier=current.length&&unique.length===1&&current.every(Boolean)&&unique[0]!=='wild'?unique[0]:null;
  const upgrades=[...identity.content.matchAll(/^\s*(?:[-*]\s*)?EP(\d{2,3})后实力档位\s*[:：]\s*([^\r\n]+)/gm)].map(m=>({after:'EP'+m[1].padStart(3,'0'),tier:tierOf(m[2])})).filter(r=>r.tier&&r.tier!=='wild').sort((a,b)=>Number(a.after.slice(2))-Number(b.after.slice(2)));
  out.push({uid:e.uid??e.id??null,name:identity.name,names:identity.names,tier,upgrades,enabled:e.enabled!==false&&e.disable!==true,invalidCurrent:current.length>0&&!tier});
 }
 return out;
}
function namesFor(r){return new Set(r.names.map(npcNameKey));}
function matchesName(who,r){
 const names=namesFor(r),raw=text(who),key=npcNameKey(raw);if(names.has(key))return true;
 let base=raw;
 const paren=raw.match(/^(.*?)\s*[（(]([^（）()]+)[）)]\s*$/);
 if(paren){
  const qualifier=paren[2].trim();
  if(!tierOf(qualifier)&&!names.has(npcNameKey(qualifier))&&!/^(?:关都|城都|橘子群岛|[^与和、,/]{1,12}道馆)$/.test(qualifier))return false;
  base=paren[1].trim();if(names.has(npcNameKey(base)))return true;
 }
 // Exact identity suffix + a restricted title prefix. Never substring-match
 // 渡 in 渡船, 小茂 in 小茂的粉丝, or an arbitrary description of a Champion.
 for(const name of r.names){
  if(base.toLowerCase().endsWith(name.toLowerCase())){
   const prefix=base.slice(0,base.length-name.length).trim();
   if(prefix&&titlePrefix.test(prefix))return true;
  }
 }
 return false;
}
function findIdentity(who,records){
 const hits=records.filter(r=>matchesName(who,r));
 if(hits.length===1)return {record:hits[0],status:'matched'};
 if(hits.length>1)return {status:'ambiguous',candidates:hits.map(r=>r.name)};
 const pieces=text(who).split(/\s*(?:、|,|，|\+|＋|&|＆|\/|以及|与|和|跟|及)\s*/).filter(Boolean);
 if(pieces.length>1){const many=records.filter(r=>pieces.some(s=>matchesName(s,r)));if(many.length>1)return {status:'ambiguous',candidates:many.map(r=>r.name)};}
 return {status:'unknown'};
}
export function episodePassed(after,progress){
 if(!progress||/sandbox|沙盒/i.test(String(progress.mode||''))||typeof progress.index!=='function')return false;
 if(progress.skipped?.has?.(after)||Array.isArray(progress.skipped)&&progress.skipped.includes(after))return false;
 const i=progress.index(after);if(!Number.isInteger(i)||i<0)return false;
 return progress.finished===true||Number.isFinite(progress.cur)&&progress.cur>i;
}
// Only this generated minimal seed is bundled: names + current tier + seven EP
// conditions. No complete lore, combat teams, or unrelated behavioral rules.
const bundledEntries=[{"uid":24,"comment":"🧢人物档案·小智","key":["小智","阿智","Ash","サトシ"],"disable":false,"content":"名称：小智（サトシ / Ash Ketchum）"},{"uid":25,"comment":"⚡人物档案·皮卡丘（小智的）","key":["皮卡丘","Pikachu","ピカチュウ"],"disable":false,"content":""},{"uid":26,"comment":"🐟人物档案·小霞","key":["小霞","Misty","カスミ"],"disable":false,"content":"名称：小霞 (カスミ / Misty)\n当前实力档位：馆主（leader）"},{"uid":27,"comment":"🍳人物档案·小刚","key":["小刚","Brock","タケシ"],"disable":false,"content":"Name: 小刚 (タケシ / Brock)\n当前实力档位：馆主（leader）"},{"uid":28,"comment":"🔵人物档案·小茂","key":["小茂","Gary","シゲル"],"disable":false,"content":"Name: 小茂 (シゲル / Gary Oak)\n当前实力档位：资深训练家（veteran）"},{"uid":29,"comment":"🚀人物档案·喵喵与火箭队","key":["火箭队","喵喵","Team Rocket","ロケット団","Meowth","ニャース"],"disable":false,"content":""},{"uid":30,"comment":"🟢人物档案·大木博士","key":["大木","大木博士","Oak","オーキド","研究所"],"disable":false,"content":"- 当前实力档位：天王（elite）"},{"uid":31,"comment":"🏠人物档案·花子","key":["花子","小智妈妈","小智的妈妈","ハナコ"],"disable":false,"content":""},{"uid":32,"comment":"⚪人物档案·乔伊与君莎","key":["乔伊","君莎","Joy","Jenny","宝可梦中心","警察"],"disable":false,"content":""},{"uid":33,"comment":"🕶️人物档案·坂木","key":["坂木","Giovanni","サカキ","火箭队首领","火箭队老大"],"disable":false,"content":"- 当前实力档位：精英训练家（ace）"},{"uid":34,"comment":"🏅人物档案·关都道馆馆主","key":["道馆","馆主","马志士","娜姿","莉佳","阿桔","夏伯","武志","华蓝三姐妹","樱花","菖蒲","牡丹","绫女"],"disable":false,"content":""},{"uid":35,"comment":"👤人物档案·旅途中的重要配角","key":["正辉","小明","猛兽使","武士","阿彻","小翠","李科","凯撒","富子","斋藏","希巴","四天王","太一","小雪","戽头","琳子","南野"],"disable":false,"content":""},{"uid":36,"comment":"🔥人物档案·阿弘","key":["阿弘","Ritchie","ヒロシ","雷恩","吉波","巴比"],"disable":false,"content":"名称：阿弘 (ヒロシ / Ritchie)\n当前实力档位：资深训练家（veteran）"},{"uid":37,"comment":"🧬人物档案·超梦与梦幻","key":["超梦","梦幻","Mewtwo","Mew","新岛","神秘宝可梦"],"disable":false,"content":""},{"uid":406,"comment":"⚡️人物档案·马志士","key":["马志士","マチス","Lt. Surge"],"disable":false,"content":"名称：马志士 (マチス / Lt. Surge)\n当前实力档位：馆主（leader）"},{"uid":407,"comment":"🎓人物档案·钢铁先生","key":["钢铁先生","钢铁","Kurt"],"disable":false,"content":"当前实力档位：普通训练家（regular）"},{"uid":408,"comment":"⚾️人物档案·奈奈（Casey）","key":["奈奈","Casey","电击兽队","ナナコ"],"disable":false,"content":"Name: 奈奈 (ナナコ / Casey)\n当前实力档位：新手（novice）\nEP180后实力档位：普通训练家（regular）"},{"uid":409,"comment":"🐉人物档案·阿渡","key":["阿渡","渡","Lance","ワタル"],"disable":false,"content":"Name: 阿渡 (ワタル / Lance)\n当前实力档位：冠军（champion）"},{"uid":410,"comment":"🐮人物档案·小茜（满金道馆）","key":["小茜","满金道馆","アカネ","Whitney"],"disable":false,"content":"Name: 小茜 (アカネ / Whitney)\n当前实力档位：馆主（leader）"},{"uid":411,"comment":"👻人物档案·松叶","key":["松叶","缘朱道馆","マツバ","Morty"],"disable":false,"content":"Name: 松叶 (マツバ / Morty)\n当前实力档位：馆主（leader）"},{"uid":412,"comment":"🥊人物档案·阿四","key":["阿四","湛蓝道馆"],"disable":false,"content":"Name: 阿四 (シジマ / Chuck)\n当前实力档位：馆主（leader）"},{"uid":413,"comment":"🪨人物档案·阿蜜","key":["阿蜜","浅葱道馆","ミカン","Jasmine"],"disable":false,"content":"Name: 阿蜜 (ミカン / Jasmine)\n当前实力档位：馆主（leader）"},{"uid":414,"comment":"❄️人物档案·柳伯","key":["柳伯","卡吉道馆","ヤナギ","Pryce"],"disable":false,"content":"Name: 柳伯 (ヤナギ / Pryce)\n当前实力档位：天王（elite）"},{"uid":415,"comment":"🐲人物档案·小椿","key":["小椿","烟墨道馆","イブキ","Clair"],"disable":false,"content":"Name: 小椿 (イブキ / Clair)\n当前实力档位：天王（elite）"},{"uid":416,"comment":"👤人物档案·水京","key":["水京","水晶","Eusine","ミナキ"],"disable":false,"content":"名称：水京 (ミナキ / Eusine / 米那君)\n当前实力档位：资深训练家（veteran）"},{"uid":417,"comment":"👤人物档案·叶越","key":["叶越","Harrison","ハヅキ"],"disable":false,"content":"Name: 叶越 (ハヅキ / Harrison)\n当前实力档位：资深训练家（veteran）"},{"uid":418,"comment":"👤人物档案·杜舍","key":["杜舍","トシヤ","Jon Dickson"],"disable":false,"content":"Name: 杜舍 (トシヤ / Jon Dickson)\n当前实力档位：精英训练家（ace）"},{"uid":419,"comment":"👤人物档案·剧场版M03美美","key":["美美","Molly Hale","未知图腾","炎帝"],"disable":false,"content":"名称：美美（Molly Hale / ミー・スノードン）\n当前实力档位：新手（novice）"},{"uid":420,"comment":"👤人物档案·卡侬（奥多马雷）","key":["卡侬","卡侬","Bianca","Kanon"],"disable":false,"content":"名称：卡侬 (カノン / Kanon / Bianca)\n当前实力档位：新手（novice）"},{"uid":421,"comment":"👤人物档案·本葛雷","key":["本葛雷","Lorenzo"],"disable":false,"content":""},{"uid":422,"comment":"👤人物档案·拉帝欧斯","key":["拉帝欧斯","Latios"],"disable":false,"content":""},{"uid":423,"comment":"👤人物档案·拉帝亚斯","key":["拉帝亚斯","Latias"],"disable":false,"content":""},{"uid":447,"comment":"🍃人物档案·叶子","key":["叶子","リーフ","Leaf"],"disable":false,"content":"Name: 叶子 (リーフ / Leaf)\n当前实力档位：资深训练家（veteran）"},{"uid":448,"comment":"👤原创人物档案·小凡","key":["小凡","富二代大小姐"],"disable":false,"content":"名称：小凡\n当前实力档位：资深训练家（veteran）\nEP175后实力档位：精英训练家（ace）"},{"uid":449,"comment":"👤原创人物档案·弥子","key":["弥子"],"disable":false,"content":"Name: 弥子\n当前实力档位：资深训练家（veteran）"},{"uid":450,"comment":"👤原创人物档案·曦月","key":["曦月"],"disable":false,"content":"名称：曦月\n当前实力档位：普通训练家（regular）\nEP165后实力档位：馆主（leader）"},{"uid":451,"comment":"👤原创人物档案·何廉臣","key":["何廉臣"],"disable":false,"content":"Name: 何廉臣\n当前实力档位：精英训练家（ace）"},{"uid":452,"comment":"👤原创人物档案·路西瓜","key":["路西瓜"],"disable":false,"content":"Name: 路西瓜\n当前实力档位：馆主（leader）"},{"uid":453,"comment":"👤原创人物档案·小菲","key":["小菲"],"disable":false,"content":"名称：小菲\n当前实力档位：资深训练家（veteran）"},{"uid":454,"comment":"👤原创人物档案·蚀月","key":["蚀月"],"disable":false,"content":"名称：蚀月\n当前实力档位：精英训练家（ace）"},{"uid":455,"comment":"🐞人物档案·阿笔","key":["阿笔","桧皮道馆","ツクシ","Bugsy"],"disable":false,"content":"Name: 阿笔 (ツクシ / Bugsy)\n当前实力档位：馆主（leader）"},{"uid":456,"comment":"🐦人物档案·阿速","key":["阿速","桔梗道馆","ハヤト","Falkner"],"disable":false,"content":"Name: 阿速 (ハヤト / Falkner)\n当前实力档位：馆主（leader）"},{"uid":457,"comment":"🎓人物档案·内木博士","key":["内木博士","内木","Professor Philena Ivy","ウチキド博士"],"disable":false,"content":"名称：内木 (ウチキド博士 / Professor Philena Ivy)\n当前实力档位：普通训练家（regular）"},{"uid":458,"comment":"🍀人物档案·奈奈美","key":["奈奈美","オーキド・ナナミ","Daisy Oak"],"disable":false,"content":"Name: 奈奈美 (オーキド・ナナミ / Daisy Oak)\n当前实力档位：馆主（leader）"},{"uid":459,"comment":"🏅人物档案·城都道馆馆主","key":["道馆","馆主","阿速","阿笔","小茜","松叶","阿四","阿蜜","柳伯","小椿"],"disable":false,"content":""},{"uid":460,"comment":"🎓人物档案·空木博士","key":["空木博士","空木","Professor Elm"],"disable":false,"content":"当前实力档位：普通训练家（regular）"},{"uid":461,"comment":"🌿人物档案·莉佳","key":["莉佳","エリカ","Erika"],"disable":false,"content":"名称：莉佳 (エリカ / Erika)\n当前实力档位：馆主（leader）"},{"uid":462,"comment":"🥷人物档案·阿桔","key":["阿桔","キョウ","Koga"],"disable":false,"content":"名称：阿桔 (キョウ / Koga)\n当前实力档位：馆主（leader）\nEP220后实力档位：天王（elite）"},{"uid":463,"comment":"🥷人物档案·阿杏","key":["阿杏","アンズ","Janine"],"disable":false,"content":"名称：阿杏 (アンズ / Janine)\n当前实力档位：馆主（leader）"},{"uid":464,"comment":"🥷人物档案·阿雅","key":["阿雅","アヤ","Aya"],"disable":false,"content":"Name: 阿雅 (アヤ / Aya)\n当前实力档位：普通训练家（regular）"},{"uid":465,"comment":"🧠人物档案·娜姿","key":["娜姿","ナツメ","Sabrina"],"disable":false,"content":"名称：娜姿 (ナツメ / Sabrina)\n当前实力档位：馆主（leader）"},{"uid":466,"comment":"🌋人物档案·夏伯","key":["夏伯","カツラ","Blaine"],"disable":false,"content":"Name: 夏伯 (カツラ / Blaine)\n当前实力档位：馆主（leader）"},{"uid":467,"comment":"🧸人物档案·科拿","key":["科拿","カンナ","Lorelei","Prima"],"disable":false,"content":"名称：科拿 (カンナ / Lorelei / Prima)\n当前实力档位：天王（elite）"},{"uid":468,"comment":"💪人物档案·希巴","key":["希巴","シバ","Bruno"],"disable":false,"content":"名称：希巴 (シバ / Bruno)\n当前实力档位：天王（elite）"},{"uid":469,"comment":"👻人物档案·菊子","key":["菊子","キクコ","Agatha"],"disable":false,"content":"当前实力档位：天王（elite）"},{"uid":470,"comment":"🎭人物档案·一树","key":["一树","イツキ","Will"],"disable":false,"content":"名称：一树 (イツキ / Will)\n当前实力档位：天王（elite）"},{"uid":471,"comment":"🌑人物档案·梨花","key":["梨花","カリン","Karen"],"disable":false,"content":"Name: 梨花 (カリン / Karen)\n当前实力档位：天王（elite）"},{"uid":472,"comment":"💃人物档案·阿义","key":["阿义","ジギー","Rudy"],"disable":false,"content":"Name: 阿义 (ジギー / Rudy)\n当前实力档位：馆主（leader）"},{"uid":473,"comment":"🏄‍♀️人物档案·敦美","key":["敦美","アツミ","Cissy"],"disable":false,"content":"Name: 敦美 (アツミ / Cissy)\n当前实力档位：馆主（leader）"},{"uid":474,"comment":"🏨人物档案·琉丽","key":["琉丽","ルリコ","Luana"],"disable":false,"content":"Name: 琉丽 (ルリコ / Luana)\n当前实力档位：馆主（leader）"},{"uid":475,"comment":"🏔️人物档案·小丹","key":["小丹","ダン","Danny"],"disable":false,"content":"Name: 小丹 (ダン / Danny)\n当前实力档位：馆主（leader）"},{"uid":476,"comment":"🥇人物档案·勇次","key":["勇次","ユウジ","Drake"],"disable":false,"content":"Name: 勇次 (ユウジ / Drake)\n当前实力档位：天王（elite）"},{"uid":477,"comment":"🌸人物档案·樱花","key":["樱花","サクラ","Daisy"],"disable":false,"content":"名称：樱花 (サクラ / Daisy)\n当前实力档位：馆主（leader）"},{"uid":478,"comment":"🌸人物档案·牡丹","key":["牡丹","ボタン","Lily"],"disable":false,"content":"名称：牡丹 (ボタン / Lily)\n当前实力档位：馆主（leader）"},{"uid":479,"comment":"🌸人物档案·菖蒲","key":["菖蒲","アヤメ","Violet"],"disable":false,"content":"名称：菖蒲 (アヤメ / Violet)\n当前实力档位：馆主（leader）"},{"uid":480,"comment":"👤人物档案·百合","key":["百合","サユリ","Assunta"],"disable":false,"content":"Name: 百合 (サユリ / Assunta)\n当前实力档位：资深训练家（veteran）\nEP200后实力档位：精英训练家（ace）"},{"uid":481,"comment":"👤人物档案·大佑","key":["大佑","ダイスケ","Damian"],"disable":false,"content":"Name: 大佑 (ダイスケ / Damian)\n当前实力档位：新手（novice）"},{"uid":482,"comment":"👤人物档案·斋藏","key":["斋藏","サイゾウ","Otoshi"],"disable":false,"content":"Name: 斋藏 (サイゾウ / Otoshi)\n当前实力档位：普通训练家（regular）"},{"uid":483,"comment":"👤人物档案·多武","key":["多武","コーム","Mandi"],"disable":false,"content":"Name: 多武 (コーム / Mandi)\n当前实力档位：普通训练家（regular）"},{"uid":484,"comment":"👤人物档案·克子","key":["克子","カツコ","Katrina"],"disable":false,"content":"Name: 克子 (カツコ / Katrina)\n当前实力档位：普通训练家（regular）"},{"uid":485,"comment":"👤人物档案·芙芦拉","key":["芙芦拉","フルーラ","Melody"],"disable":false,"content":"名称：芙芦拉 (フルーラ / Melody)\n当前实力档位：普通训练家（regular）"},{"uid":486,"comment":"👤人物档案·富子","key":["富子","フコ","Lara"],"disable":false,"content":"名称：富子 (フコ / Lara)\n当前实力档位：普通训练家（regular）"},{"uid":487,"comment":"👤人物档案·清美","key":["清美","キヨミ","Cassandra"],"disable":false,"content":"名称：清美 (キヨミ / Cassandra)"},{"uid":488,"comment":"👤人物档案·小慧","key":["小慧","ケイ","Kay"],"disable":false,"content":"名称：小慧 (ケイ / Kay)\n当前实力档位：普通训练家（regular）"},{"uid":489,"comment":"👤人物档案·绅士","key":["绅士","ジェントルマン","Gentleman"],"disable":false,"content":"Name: 绅士 (ジェントルマン / Gentleman)\n当前实力档位：普通训练家（regular）"},{"uid":490,"comment":"👤人物档案·小美","key":["小美","ミチコ","Maren"],"disable":false,"content":"名称：小美 (ミチコ / Maren)\n当前实力档位：普通训练家（regular）"},{"uid":491,"comment":"👤人物档案·小明","key":["小明","エージェイ","A.J.","AJ"],"disable":false,"content":"Name: 小明 (エージェイ / A.J. / AJ)\n当前实力档位：资深训练家（veteran）"},{"uid":492,"comment":"👤人物档案·小雪","key":["小雪","ユキ","Suzie"],"disable":false,"content":"Name: 小雪 (ユキ / Suzie)\n当前实力档位：普通训练家（regular）"},{"uid":493,"comment":"👤人物档案·小英","key":["小英","ヒデ / Tad"],"disable":false,"content":"Name: 小英 (ヒデ / Tad)\n当前实力档位：资深训练家（veteran）"},{"uid":494,"comment":"🚀人物档案·小三郎","key":["火箭队","小三郎","コサブロウ","Butch"],"disable":false,"content":"名称：小三郎 (コサブロウ / Butch)\n当前实力档位：资深训练家（veteran）"},{"uid":495,"comment":"📝人物档案·小建","key":["小建","ケンジ","Tracey Sketchit"],"disable":false,"content":"名称：小建 (ケンジ / Tracey Sketchit)\n当前实力档位：普通训练家（regular）"},{"uid":496,"comment":"🚀人物档案·亚马多","key":["火箭队","亚马多","ヤマト","Cassidy"],"disable":false,"content":"Name: 亚马多 (ヤマト / Cassidy)\n当前实力档位：资深训练家（veteran）"},{"uid":497,"comment":"👤人物档案·小桩","key":["小桩","ツバキ","Marina"],"disable":false,"content":"Name: 小桩 (ツバキ / Marina)\n当前实力档位：普通训练家（regular）"},{"uid":498,"comment":"👤人物档案·薰子","key":["薰子","カオルコ","Janet"],"disable":false,"content":"名称：薰子 (カオルコ / Janet)\n当前实力档位：普通训练家（regular）\nEP140后实力档位：资深训练家（veteran）"},{"uid":499,"comment":"👤人物档案·优藤圣代","key":["优藤圣代","ユウトウ・セイヨ","Giselle","优等骄子"],"disable":false,"content":"Name: 优藤圣代 (ユウトウ・セイヨ / Giselle / 优等骄子)\n当前实力档位：资深训练家（veteran）\nEP119后实力档位：馆主（leader）"},{"uid":500,"comment":"👤人物档案·纪珂","key":["纪珂","ジーク","Sieg","Liza"],"disable":false,"content":"名称：纪珂 (ジーク / Sieg / Liza)\n当前实力档位：资深训练家（veteran）"},{"uid":501,"comment":"👤人物档案·高美","key":["高美","タカミ","Trinity"],"disable":false,"content":"Name: 高美 (タカミ / Trinity)\n当前实力档位：资深训练家（veteran）"},{"uid":502,"comment":"👤人物档案·美琪","key":["美琪","ミキ","Miki"],"disable":false,"content":"Name: 美琪 (ミキ / Miki)\n当前实力档位：普通训练家（regular）"},{"uid":503,"comment":"👤人物档案·姬香","key":["姬香","ヒメカ","Temacu"],"disable":false,"content":"Name: 姬香 (ヒメカ / Temacu)\n当前实力档位：新手（novice）"},{"uid":504,"comment":"👤人物档案·樱子","key":["樱子","さくらこ","Sakura"],"disable":false,"content":"Name: 樱子 (さくらこ / Sakura)\n当前实力档位：新手（novice）"},{"uid":505,"comment":"👤人物档案·信彦","key":["信彦","ノブヒコ","Kiyo"],"disable":false,"content":"Name: 信彦 (ノブヒコ / Kiyo)\n当前实力档位：普通训练家（regular）"},{"uid":506,"comment":"👤人物档案·新吾","key":["新吾","シンゴ","Shingo"],"disable":false,"content":"Name: 新吾 (シンゴ / Shingo)\n当前实力档位：资深训练家（veteran）"},{"uid":507,"comment":"👤人物档案·亚克西","key":["亚克西","ヤケイシ","Egan"],"disable":false,"content":"Name: 亚克西 (ヤケイシ / Egan)\n当前实力档位：普通训练家（regular）"},{"uid":508,"comment":"👤人物档案·小萌","key":["小萌","モエ","Macy"],"disable":false,"content":"名称：小萌 (モエ / Macy)\n当前实力档位：普通训练家（regular）"},{"uid":509,"comment":"👤人物档案·龙司","key":["龙司","リュウジ","Dorian"],"disable":false,"content":"名称：龙司 (リュウジ / Dorian)\n当前实力档位：资深训练家（veteran）"},{"uid":510,"comment":"👤人物档案·健太","key":["健太","ケンタ","Jimmy"],"disable":false,"content":"Name: 健太 (ケンタ / Jimmy)\n当前实力档位：资深训练家（veteran）"},{"uid":511,"comment":"👤人物档案·纯一","key":["纯一","ジュンイチ","Jackson","Vincent"],"disable":false,"content":"Name: 纯一 (ジュンイチ / Jackson / Vincent)\n当前实力档位：普通训练家（regular）"},{"uid":512,"comment":"👤人物档案·玛莉娜","key":["玛莉娜","マリナ","Marina"],"disable":false,"content":"Name: 玛莉娜 (マリナ / Marina)\n当前实力档位：普通训练家（regular）"},{"uid":513,"comment":"👤人物档案·杰莉","key":["杰莉","チェリー","Cherry"],"disable":false,"content":"Name: 杰莉 (チェリー / Cherry)\n当前实力档位：普通训练家（regular）"},{"uid":514,"comment":"👤人物档案·比夏斯","key":["比夏斯","ビシャス","Vicious","Iron-Masked Marauder"],"disable":false,"content":"名称：比夏斯 (ビシャス / Vicious / Iron-Masked Marauder)\n当前实力档位：精英训练家（ace）"},{"uid":515,"comment":"👤人物档案·壬媞","key":["壬媞","ジンジー","Wendy","Gingie"],"disable":false,"content":"名称：壬媞 (ジンジー / Wendy / Gingie)\n当前实力档位：资深训练家（veteran）"},{"uid":516,"comment":"👤人物档案·千草","key":["千草","チグサ","Chigusa"],"disable":false,"content":"名称：千草 (チグサ / Chigusa)\n当前实力档位：普通训练家（regular）"},{"uid":517,"comment":"👤人物档案·露佳","key":["露佳","ルカ","Luka"],"disable":false,"content":"名称：露佳 (ルカ / Luka)\n当前实力档位：普通训练家（regular）"},{"uid":518,"comment":"👤人物档案·张造","key":["张造","ハリゾウ","Harrison"],"disable":false,"content":"Name: 张造 (ハリゾウ / Harrison)\n当前实力档位：普通训练家（regular）"},{"uid":519,"comment":"👤人物档案·都里","key":["都里","ツリオ","Christopher"],"disable":false,"content":"Name: 都里 (ツリオ / Christopher)\n当前实力档位：普通训练家（regular）"},{"uid":520,"comment":"👤人物档案·吉木","key":["吉木","ヨシキ","Yoshiki","Melissa"],"disable":false,"content":"Name: 吉木 (ヨシキ / Yoshiki，英文译名 Melissa)\n当前实力档位：资深训练家（veteran）"},{"uid":521,"comment":"👤人物档案·小银","key":["小银","シルバー","Silver"],"disable":false,"content":"Name: 小银 (シルバー / Silver)\n当前实力档位：馆主（leader）"},{"uid":527,"comment":"🌟人物档案·智子（小智的性转版）","key":["智子"],"disable":false,"content":""},{"uid":528,"comment":"🚀人物档案·武藏","key":["武藏","ムサシ","Jessie","火箭队"],"disable":false,"content":"名称：武藏（ムサシ / Jessie）"},{"uid":529,"comment":"🚀人物档案·小次郎","key":["小次郎","コジロウ","James","火箭队"],"disable":false,"content":"名称：小次郎（コジロウ / James）"}];
export const NPC_TIER_CATALOG=Object.freeze(recordsFromEntries(bundledEntries).map(r=>Object.freeze({...r,names:Object.freeze(r.names),upgrades:Object.freeze(r.upgrades.map(u=>Object.freeze(u)))})));
export function resolveNpcTier(opponent,{sources=[],progress=null}={}){
 const who=text(opponent),all=[...sources,{source:'bundled-worldbook',records:NPC_TIER_CATALOG}];
 for(const source of all){
  const records=source.records||recordsFromEntries(source.entries),found=findIdentity(who,records);
  if(found.status==='unknown')continue;
  const common={version:TIER_WIRING_BUILD,opponent:who,source:text(source.source)||'worldbook',status:found.status};
  if(found.status==='ambiguous')return {...common,tier:null,warnings:['对手姓名或别名不唯一：'+found.candidates.join('、')+'；未猜测人物档位。']};
  const r=found.record,warnings=[];
  if(!r.enabled||!r.tier){
   if(r.invalidCurrent)warnings.push(r.name+'的当前档位无效或冲突；未使用旧内置档位替代。');
   return {...common,uid:r.uid,name:r.name,tier:null,baseTier:r.tier,status:r.enabled?'unassigned':'disabled',warnings};
  }
  let tier=r.tier;const applied=[],pending=[];
  for(const u of r.upgrades){if(episodePassed(u.after,progress)){tier=u.tier;applied.push({...u});}else pending.push({...u});}
  return {...common,uid:r.uid,name:r.name,tier,baseTier:r.tier,applied,pending,warnings};
 }
 return {version:TIER_WIRING_BUILD,opponent:who,source:'none',status:'unknown',tier:null,warnings:[]};
}
export function npcTierForConfig(cfg={}){
 const supplied=cfg?.npcTier;
 if(supplied&&supplied.version===TIER_WIRING_BUILD&&npcNameKey(supplied.opponent)===npcNameKey(cfg.opponent)){
  return {...supplied,tier:tierOf(supplied.tier),warnings:Array.isArray(supplied.warnings)?supplied.warnings.map(text).filter(Boolean).slice(0,12):[]};
 }
 return resolveNpcTier(cfg?.opponent);
}
