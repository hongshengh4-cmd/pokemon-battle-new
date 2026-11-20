/* Pure shared configuration boundary for weather/terrain. No battle rules.
 * Loaded as a classic script in the battle and a side-effect import by the host.
 * SPDX-License-Identifier: MIT */
(function (root) {
  'use strict';
  const version = '20261118-field-interactions-v1';
  const weatherIds = Object.freeze({sun:'sunnyday',rain:'raindance',sand:'sandstorm',snow:'snowscape',hail:'hail',harshsun:'desolateland',heavyrain:'primordialsea',strongwinds:'deltastream'});
  const terrainIds = Object.freeze({electric:'electricterrain',grassy:'grassyterrain',misty:'mistyterrain',psychic:'psychicterrain'});
  const key = value => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {weather:Object.create(null),terrain:Object.create(null)};
  function names(kind, id, values) { for (const value of [id,...values]) aliases[kind][key(value)] = id; }
  names('weather','sun',['sunnyday','sunny','晴','晴天','大晴天','晴天场地']);
  names('weather','rain',['raindance','rainy','雨','下雨','雨天','雨天场地']);
  names('weather','sand',['sandstorm','沙暴','沙尘暴']);
  names('weather','snow',['snowscape','雪','下雪','雪天','降雪']);
  // Past moves remain available, so hail must not silently become Gen 9 snow.
  names('weather','hail',['冰雹','冰雹天气']);
  names('weather','harshsun',['desolateland','harshsunlight','极端晴天','大日照','终结之地']);
  names('weather','heavyrain',['primordialsea','heavyrain','大雨','暴雨','始源之海']);
  names('weather','strongwinds',['deltastream','strongwinds','乱流','强风','德尔塔气流']);
  names('terrain','electric',['electricterrain','电气场地','电气']);
  names('terrain','grassy',['grassyterrain','青草场地','青草']);
  names('terrain','misty',['mistyterrain','薄雾场地','薄雾']);
  names('terrain','psychic',['psychicterrain','精神场地','精神']);
  Object.freeze(aliases.weather);Object.freeze(aliases.terrain);
  const normalize = (kind, value) => aliases[kind]?.[key(value)] || '';
  const isClear = value => value == null || ['','none','clear','normal','无','无天气','无场地','正常','正常天气','普通天气'].includes(key(value));
  const turns = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  function environment(value = {}) {
    const src = typeof value === 'string' ? {weather:value,terrain:normalize('terrain',value)} : value && typeof value === 'object' ? value : {};
    return {weather:normalize('weather',src.weather),weatherTurns:turns(src.weatherTurns),terrain:normalize('terrain',src.terrain),terrainTurns:turns(src.terrainTurns)};
  }
  const weatherId = value => weatherIds[normalize('weather',value)] || '';
  const terrainId = value => terrainIds[normalize('terrain',value)] || '';
  const visualWeather = value => { const id=normalize('weather',value);return ({harshsun:'sun',heavyrain:'rain'})[id] || id; };
  root.PKMFieldEnvironment = Object.freeze({version,normalize,environment,weatherId,terrainId,visualWeather,isClear,turns,weatherIds,terrainIds});
})(typeof globalThis !== 'undefined' ? globalThis : this);
