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
