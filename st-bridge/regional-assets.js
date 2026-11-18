// Presentation assets are hosted alongside this module, not in a character card.
import './regional-bootstrap.js?v=20261118-status-crown-v8.1';
const BUILD='20261118-status-crown-v8.1';
async function resource(name,json=false){
 const url=new URL('./regional/'+name,import.meta.url);url.searchParams.set('v',BUILD);
 const response=await fetch(url.href,{cache:'default'});
 if(!response.ok)throw new Error('双地区图鉴资源未完整部署：'+name+'（HTTP '+response.status+'）');
 return json?response.json():response.text();
}
const [version,exterior,shellCSS,presentationCSS,modalCSS,icons]=await Promise.all([
 resource('version.json',true),resource('shell.html'),resource('shell.css'),
 resource('presentation.css'),resource('modal.css'),resource('icons.json',true)
]);
if(version.build!==BUILD)throw new Error('双地区图鉴资源缓存版本不匹配，请完整部署并刷新。');
window.PKMRegionalPresentationAssets=Object.freeze({version:BUILD,exterior,css:shellCSS+'\n'+presentationCSS,modalCSS,icons});
