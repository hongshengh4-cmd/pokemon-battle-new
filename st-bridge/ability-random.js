/*
 * Ordinary-ability selector for the site's flat src/data/pokedex.json ability arrays.
 * Slot 0/1 are ordinary abilities; H (hidden) and S (special) are never randomized.
 * Static two-slot index generated/checked against Pokémon Showdown's Pokedex slot metadata;
 * 37 site's extra form aliases inherit their base species slots.
 * Source: https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts
 */
(function(root, factory) {
  const api = factory();
  root.PKMNormalAbility = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DUAL_NORMAL_IDS = new Set(`
  ababo abra absol accelgor aerodactyl aggron aipom alakazam alomomola ambipom annihilape appletun appletungmax applin
  arbok arcanine arcaninehisui archaludon arctovish arctozolt argalis ariados aron astrolotl audino aurumoth avalugg
  avalugghisui axew azumarill azurill banette barbaracle barboach basculegion basculegionf basculin basculinbluestriped
  basculinwhitestriped beartic beheeyem bellibolt bergmite bewear bibarel bidoof binacle bisharp blipbug blissey blitzle
  boldore bombirdier bonsly bouffalant bounsweet brattler braviary braviaryhisui breezi breloom bronzong bronzor bruxish
  budew buneary bunnelby caimanoe camerupt capsakid carkol carracosta cawdet cawmodore centiskorch centiskorchgmax
  cetitan cetoddle chandelure chansey chatot chewtle chinchou chuggalong chuggon cinccino clefable clefairy cleffa
  clodsire cloyster coalossal coalossalgmax colossoil comfey conkeldurr corphish corsola corviknight corviknightgmax
  corvisquire cottonee crabominable crabrawler crawdaunt cresceidon croagunk crucibelle crustle cubchoo cubone cupra
  cutiefly cyclohm dedenne deerling deerlingautumn deerlingsummer deerlingwinter delcatty delibird dewgong diggersby
  diglett diglettalola dipplin dodrio doduo dondozo dorsoil dottler dracovish dracozolt dragalge dragapult draggalong
  drakloak drampa drapion drednaw drednawgmax dreepy drifblim drifloon drilbur drowzee druddigon dubwool ducklett
  dudunsparce dudunsparcethreesegment dugtrio dugtrioalola dunsparce duohm duosion duraludon duraludongmax durant
  dwebble eevee eeveegmax eeveestarter ekans eldegoss electrike electrode electrodehisui elgyem embirch equilibra
  escavalier espathra espurr excadrill farfetchd farigiraf feebas fidgit finneon flamigo flapple flapplegmax flarelm
  flittle floatoy flox fraxure frillish furret gallade galvantula garbodor garbodorgmax gardevoir garganacl gastrodon
  gastrodoneast geodude geodudealola gigalith girafarig glalie glameow gligar gliscor goldeen golduck golem golemalola
  golett golurk goodra goodrahisui goomy gossifleur gothita gothitelle gothorita gourgeist gourgeistlarge gourgeistsmall
  gourgeistsuper grafaiai granbull graveler graveleralola grimer grimeralola grimmsnarl grimmsnarlgmax growlithe
  growlithehisui grumpig gulpin gumshoos gurdurr hakamoo happiny hariyama hatenna hatterene hatterenegmax hattrem
  hawlucha haxorus heatmor heliolisk helioptile hemogoblin heracross herdier hitmonchan hitmonlee hitmontop honchkrow
  hoothoot hoppip horsea houndoom houndour hydrapple hypno igglybuff illumise impidimp indeedee indeedeef inkay jangmoo
  jellicent jigglypuff joltik jumbao jumpluff justyke jynx kabuto kabutops kadabra kangaskhan karrablast kerfluffle
  kilowattrel kingambit kingdra kingler kinglergmax kirlia kitsunoh klang klawf kleavor klink klinklang koffing kommoo
  krabby krilowatt krokorok krookodile lairon lampent lanturn lapras laprasgmax leavanny lechonk ledian ledyba
  lickilicky lickitung liepard lilligant lilliganthisui lillipup linoone linoonegalar litleo litwick lombre lopunny
  lotad lucario ludicolo lumineon luxio luxray lycanroc lycanrocmidnight mabosstiff machamp machampgmax machoke machop
  magcargo magnemite magneton magnezone makuhita malaconda malamar mamoswine mandibuzz manectric mankey mantine mantyke
  maractus mareanie marill marowak marowakalola maschiff maushold mausholdfour mawile meowstic meowsticf meowth
  meowthalola meowthgalar meowthgmax miasmaw miasmite mienfoo mienshao mightyena milotic miltank mimejr minccino monohm
  morelull morgrem mrmime mrmimegalar mrrime mudbray mudsdale muk mukalola mumbao munchlax munna murkrow musharna nacli
  naclstack natu naviathan nickit nidoking nidoqueen nidoranf nidoranm nidorina nidorino noctowl nohface noibat noivern
  nosepass numel nuzleaf obliteryx obstagoon octillery oinkologne oinkolognef omanyte omastar onix oranguru orbeetle
  orbeetlegmax overqwil pachirisu palpitoad pancham pangoro paras parasect patrat pawmi pawmo pawmot pawniard pelipper
  perrserker persian persianalola petilil phantump pidgeot pidgeotto pidgey pidove pikipek piloswine pinsir plasmanta
  pluffle pokestarsmeargle politoed poliwag poliwhirl poliwrath ponyta ponytagalar poochyena porygon porygon2 porygonz
  primeape probopass protowatt psyduck pumpkaboo pumpkaboolarge pumpkaboosmall pumpkaboosuper purrloin purugly pyroak
  pyroar quagsire qwilfish qwilfishhisui ralts rapidash rapidashgalar raticate raticatealola rattata rattataalola rebble
  relicanth remoraid reuniclus revenankh rhydon rhyhorn rhyperior ribombee riolu rockruff roggenrola rolycoly rookidee
  roselia roserade rufflet sableye saharaja saharascal sandaconda sandacondagmax sandile sawk sawsbuck scatterbug
  scattervein scizor scolipede scovillain scrafty scraggy scraptor scratchet scyther seadra seaking sealeo seedot seel
  seismitoad sentret sewaddle shellder shellos shelloseast shelmet shiftry shiinotic shinx shox shroodle shroomish
  shuckle shuppet sigilyph silicobra sizzlipede skarmory skiploom skitty skorupi skrelp skuntank sliggoo sliggoohisui
  slowbro slowbrogalar slowking slowkinggalar slowpoke slowpokegalar slugma smeargle smoochum sneasel sneaselhisui
  sneasler snorlax snorlaxgmax snorunt snubbull snugglow solosis solotl spheal spinarak spinda spoink squawkabilly
  squawkabillyblue squawkabillywhite squawkabillyyellow stantler starmie staryu steelix steenee stoutland stratagem
  stufful stunfisk stunky sudowoodo sunflora sunkern swadloon swalot swanna swinub swoobat syclant syclar tactite
  tadbulb tandemaus tangela tangrowth tauros taurospaldeaaqua taurospaldeablaze taurospaldeacombat teddiursa tentacool
  tentacruel thievul throh timburr tinkatink tinkaton tinkatuff tirtouga togedemaru togekiss togepi togetic tomohawk
  torkoal toucannon toxapex toxel toxicroak toxtricity toxtricitygmax toxtricitylowkey toxtricitylowkeygmax tranquill
  trapinch trevenant tropius trubbish trumbeak tsareena tympole tyrogue unfezant ursaluna ursaring vanillish vanillite
  vanilluxe venipede venomoth venonat vivillon vivillonarchipelago vivilloncontinental vivillonelegant vivillonfancy
  vivillongarden vivillonhighplains vivillonicysnow vivillonjungle vivillonmarine vivillonmodern vivillonmonsoon
  vivillonocean vivillonpokeball vivillonpolar vivillonriver vivillonsandstorm vivillonsavanna vivillonsun
  vivillontundra volbeat volkraken volkritter voltorb voltorbhisui voodoll voodoom vullaby wailmer wailord walrein
  watchog wattrel weezing weezinggalar whimsicott whirlipede whiscash wigglytuff wiglett wingull woobat wooloo wooper
  wooperpaldea wugtrio wyrdeer xatu yanma yanmega yungoos zebstrika zigzagoon zigzagoongalar
  `.trim().split(/\s+/));
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function tokens(raw) {
    if (Array.isArray(raw)) return raw.flatMap(tokens);
    if (raw && typeof raw === 'object') return tokens(raw.current ?? raw.selected ?? raw.name ?? raw.id ?? raw.ability ?? Object.values(raw));
    if (typeof raw !== 'string') return [];
    const value = raw.trim();
    if (/^[\[{]/.test(value)) {
      try { return tokens(JSON.parse(value)); } catch (_) {}
    }
    return value.split(/[\/／、,，;；|｜+＋\n]+/)
      .map(x => x.trim()
        .replace(/^(?:隐藏特性|隱藏特性|梦特性|夢特性|普通特性|一般特性|特性|ability)\s*[:：]\s*/i, '')
        .replace(/[（(【\[]\s*(?:隐藏|隱藏|梦|夢|普通|一般|特性|H|HA|hidden)[^）)】\]]*[）)】\]]/gi, '')
        .replace(/(?:隐藏特性|隱藏特性|梦特性|夢特性)$/, '')
        .trim())
      .filter(Boolean);
  }

  function abilityKey(value) {
    const key = normalize(value);
    // The embedded Calyrex form labels include the rider in the local table;
    // the site's canonical ability dictionary uses the shared `asone` key.
    return /^asone(?:glastrier|spectrier)$/.test(key) ? 'asone' : key;
  }

  function findLegal(raw, legal = [], zh = {}) {
    if (!Array.isArray(legal)) return null;
    for (const token of tokens(raw)) {
      const tokenKey = abilityKey(token);
      // Traditional / old / decorated Chinese names resolve through the shared
      // official-name policy (src/data/name-aliases.js) when it is loaded.
      let officialKey = '';
      try { officialKey = globalThis.PKMOfficialNames?.resolve?.('abilities', token) || ''; } catch (_) {}
      const found = legal.find(ability => ability === token ||
        (tokenKey && abilityKey(ability) === tokenKey) ||
        (officialKey && abilityKey(ability) === officialKey) ||
        (zh && zh[abilityKey(ability)] === token));
      if (found) return found;
    }
    return null;
  }

  function ordinaryOptions(speciesId, legal = []) {
    if (!Array.isArray(legal)) return [];
    const count = DUAL_NORMAL_IDS.has(normalize(speciesId)) ? 2 : 1;
    // The site's arrays follow slot order: numeric slots 0/1 first, then H/S.
    // Slice before filtering so a blank placeholder can never promote a hidden slot.
    return legal.slice(0, count).filter(value => typeof value === 'string' && value.trim());
  }

  function pick(speciesId, legal = [], random = Math.random) {
    const options = ordinaryOptions(speciesId, legal);
    if (!options.length) return null;
    let value = Number(random());
    if (!Number.isFinite(value)) value = 0;
    value = Math.max(0, Math.min(value, 1 - Number.EPSILON));
    return options[Math.min(options.length - 1, Math.floor(value * options.length))];
  }

  // A recorded legal choice always wins (including a legal hidden/special ability).
  // Random ordinary selection is only a fallback for a missing/invalid choice.
  function select(speciesId, current, legal = [], zh = {}, random = Math.random) {
    return findLegal(current, legal, zh) || pick(speciesId, legal, random);
  }

  return {
    version: '20261115-normal-ability-random-v2',
    dualNormalIds: DUAL_NORMAL_IDS,
    tokens,
    normalize,
    abilityKey,
    findLegal,
    ordinaryOptions,
    pick,
    select,
  };
});
