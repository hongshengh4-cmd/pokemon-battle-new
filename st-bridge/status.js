// 双地区图鉴 V8.1 · 仓库部署入口。
// 原卡继续 import st-bridge/status.js；原正则 mountDex 入口保持兼容。
import './regional-bootstrap.js?v=20261118-status-crown-v8.1';
import './regional-assets.js?v=20261118-status-crown-v8.1';
try{window.PKMRegionalHost.PKMKantoLegacyStatus?.dispose?.();}catch{}
await import('./regional-manager.js?v=20261118-status-crown-v8.1');
await import('./regional-presentation.js?v=20261118-status-crown-v8.1');
await import('./regional-status-core.js?v=20261118-status-crown-v8.1');
window.PKMRegionalHost.PKMRegionalDex?.refresh();
export const REGIONAL_REPOSITORY_BUILD='20261118-status-crown-v8.1';
