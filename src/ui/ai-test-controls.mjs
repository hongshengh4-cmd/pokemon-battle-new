// SPDX-License-Identifier: MIT
// UI-only seven-tier routing; no large diagnostic panel. Search policies, tier budgets and battle rules stay
// in the unmodified AI/engine modules. Never mutate an incoming scene config.
import {TIERS} from '../ai/profile.mjs?v=npc-tier-wiring-v1&cmd=kanto-crown-v72';
import {profileForBattle} from '../ai/browser-ai.mjs?v=npc-tier-wiring-v1&replacement=public-reserves-v71&cmd=kanto-crown-v72&features=seven-tier-v71';

export const AI_TEST_UI_BUILD = 'ai-test-ui-v2-compact';
export const TEST_TIERS = Object.freeze(['novice','regular','veteran','leader','ace','elite','champion','master']);
const LEGACY = Object.freeze({novice:'easy',regular:'normal',veteran:'hard',leader:'hard',ace:'expert',elite:'expert',champion:'expert',master:'expert'});
const OLD_SELECTION = Object.freeze({easy:'novice',normal:'regular',hard:'leader',expert:'elite'});
export function normalizeTestTier(value) {
  const tier = OLD_SELECTION[value] || value;
  if (!TEST_TIERS.includes(tier)) throw new TypeError('请选择有效的电脑 AI 档位。');
  return tier;
}
export function displayTestTier(tier) { return TIERS[tier]?.label || '未知档位'; }
export function legacyDifficultyForTest(value) { return LEGACY[normalizeTestTier(value)]; }

export function profileForTestUI(cfg, selectedTier, enemyKey, encounterType = 'trainer') {
  // Imported/host scenes are authoritative. The manual menu is NOT a fallback
  // for missing scene fields and cannot overwrite a named NPC or scene tier.
  if (cfg) { if (encounterType==='wild'||cfg.type==='wild'||cfg.aiContext?.type==='wild')return profileForBattle({type:'wild'},null,null);return profileForBattle(cfg,cfg.difficulty,null); }
  const wild = encounterType === 'wild';
  const tier = normalizeTestTier(selectedTier);
  const context = wild
    ? {type:'wild',encounter:{type:'wild'},opponent:'野生宝可梦'}
    : {type:'trainer',opponent:'独立测试对手',ai:{tier,intent:'serious',reason:'独立测试界面明确选择；只用于本场电脑 AI 和缺省敌方努力值，不改人物档位或玩家存档。'}};
  const profile = profileForBattle(context, LEGACY[tier], enemyKey);
  return {...profile,source:wild?'wild':'manual-test',manualTest:!wild,testUiMode:wild?'wild':'manual'};
}
