// Repository module bootstrap: discover the real helper/Tavern realm only.
// Never replace host APIs, storage, chat or saved variables.
(()=>{'use strict';
 let host=window;
 try{for(let i=0;i<12&&host.parent!==host&&host.parent.document;i++)host=host.parent;}catch{}
 window.PKMRegionalHost=host;
 window.ST_BRIDGE_PACK='kanto-main';
 window.PKM_BUNDLED_PLOT=false;
 window.PKM_APP_BASE_URL=String(window.PKM_APP_BASE_URL||host.PKM_APP_BASE_URL||new URL('../',import.meta.url).href).replace(/\/?$/,'/');
})();
