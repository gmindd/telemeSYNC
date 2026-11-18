import type { Translations } from '../i18n/index.ts';

/** Slugs of output file names per metric/overlay, in each language (en, pt, fr, es, de). */
export const METRIC_SLUGS: Record<string, Translations> = {
  speed: ['speed', 'velocidade', 'vitesse', 'velocidad', 'geschwindigkeit'],
  altitude: ['altitude', 'altitude', 'altitude', 'altitud', 'hoehe'],
  grade: ['gradient', 'inclinacao', 'pente', 'pendiente', 'steigung'],
  heartRate: ['hr', 'fc', 'fc', 'fc', 'hf'],
  cadence: ['cadence', 'cadencia', 'cadence', 'cadencia', 'trittfrequenz'],
  power: ['power', 'potencia', 'puissance', 'potencia', 'leistung'],
  temperature: ['temperature', 'temperatura', 'temperature', 'temperatura', 'temperatur'],
  distance: ['distance', 'distancia', 'distance', 'distancia', 'distanz'],
  elevationGain: ['elevation-gain', 'desnivel', 'denivele', 'desnivel', 'hoehenmeter'],
  elapsedTime: ['time', 'tempo', 'temps', 'tiempo', 'zeit'],
  localTime: ['clock', 'hora', 'heure', 'hora', 'uhrzeit'],
  map: ['map', 'mapa', 'carte', 'mapa', 'karte'],
  elevationProfile: ['profile', 'perfil', 'profil', 'perfil', 'profil'],
  dialMap: ['round-map', 'mapa-circular', 'carte-ronde', 'mapa-circular', 'runde-karte'],
  dialProfile: ['profile-card', 'perfil-cartao', 'profil-carte', 'perfil-tarjeta', 'profil-karte'],
  segmentLive: ['segment', 'segmento', 'segment', 'segmento', 'segment'],
  segmentLaps: ['laps', 'voltas', 'tours', 'vueltas', 'runden'],
  dialSummary: ['compact-panel', 'painel-compacto', 'panneau-compact', 'panel-compacto', 'kompakt-panel'],
};

/** File slug words for the gadgets of the other sports ("corrida-mostrador-fc.mov"). */
export const SPORT_SLUGS: Record<'running' | 'snow', Translations> = {
  running: ['run', 'corrida', 'course', 'carrera', 'lauf'],
  snow: ['snow', 'neve', 'neige', 'nieve', 'schnee'],
};
export const DIAL_SLUG: Translations = ['dial', 'mostrador', 'cadran', 'esfera', 'rundinstrument'];

Object.assign(METRIC_SLUGS, {
  pace: ['pace', 'ritmo', 'allure', 'ritmo', 'pace'],
  gap: ['gap', 'ritmo-ajustado', 'allure-ajustee', 'ritmo-ajustado', 'gap'],
  runCadence: ['cadence', 'cadencia', 'cadence', 'cadencia', 'schrittfrequenz'],
  verticalSpeed: ['vertical-speed', 'velocidade-vertical', 'vitesse-verticale', 'velocidad-vertical', 'vertikalgeschwindigkeit'],
  runSplits: ['splits', 'parciais', 'temps-intermediaires', 'parciales', 'zwischenzeiten'],
  runGhost: ['pr-ghost', 'fantasma-pr', 'fantome-record', 'fantasma-record', 'pr-geist'],
  slope: ['slope', 'declive', 'pente', 'pendiente', 'gefaelle'],
  verticalDrop: ['vertical-drop', 'desnivel-descido', 'denivele-descendu', 'desnivel-bajado', 'abfahrtshoehenmeter'],
  maxSpeed: ['max-speed', 'velocidade-maxima', 'vitesse-max', 'velocidad-maxima', 'hoechstgeschwindigkeit'],
  snowRunLive: ['run', 'descida', 'descente', 'bajada', 'abfahrt'],
  snowRuns: ['runs', 'descidas', 'descentes', 'bajadas', 'abfahrten'],
});
