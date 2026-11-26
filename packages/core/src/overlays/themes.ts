import { pick, type Lang, type Translations } from '../i18n/index.ts';
import type { Sport } from '../telemetry/sport.ts';

// Overlay themes: the look of the gadgets. The app organises gadgets on three axes that are the same everywhere:
// the sport (which metrics), the theme (the look) and the category (the kind of gadget).

export type ThemeId = 'default' | 'glass' | 'natal' | 'hud' | 'minimal' | 'tv' | 'cyber' | 'ice' | 'outdoor';
/** Themes built from the shared kit (their gadget ids are `${theme}.${role}`). */
export type KitThemeId = 'hud' | 'minimal' | 'tv' | 'cyber' | 'ice' | 'outdoor';

export interface ThemeInfo {
  id: ThemeId;
  /**
   * stable = offered in the app; preview = finished but only shown with "Show themes in testing" switched on.
   * To make a theme official, change its status here.
   */
  status: 'stable' | 'preview';
  /** Sports the theme is designed for (shown first for them); empty = any sport. */
  sports: Sport[];
  name: Translations;
  lead: Translations;
  /** Colour of the theme's card in the app. */
  accent: string;
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'default',
    status: 'stable',
    sports: [],
    name: ['Default', 'Predefinido', 'Par défaut', 'Predeterminado', 'Standard'],
    lead: [
      'The classic designs: numbers, dials with a chainring rim, panels with charts, maps and profiles.',
      'Os designs clássicos: números, mostradores com aro de prato, painéis com gráfico, mapas e perfis.',
      'Les designs classiques : chiffres, cadrans à couronne, panneaux avec graphique, cartes et profils.',
      'Los diseños clásicos: números, esferas con aro de plato, paneles con gráfico, mapas y perfiles.',
      'Die klassischen Designs: Zahlen, Rundinstrumente mit Kettenblatt-Rand, Panels mit Diagramm, Karten und Profile.',
    ],
    accent: '#ff7a1a',
  },
  {
    id: 'glass',
    status: 'preview',
    sports: [],
    name: ['Glass', 'Vidro', 'Verre', 'Cristal', 'Glas'],
    lead: [
      'Clear glass spheres with a half-moon of light in the colour of the value, so the video stays the star.',
      'Esferas de vidro transparente com uma meia-lua de luz na cor do valor, para o vídeo continuar a ser o protagonista.',
      'Des sphères de verre transparent avec un croissant de lumière de la couleur de la valeur : la vidéo reste la vedette.',
      'Esferas de cristal transparente con una media luna de luz del color del valor: el vídeo sigue siendo el protagonista.',
      'Klare Glaskugeln mit einem Lichtbogen in der Farbe des Werts, damit das Video im Mittelpunkt bleibt.',
    ],
    accent: '#7fd8ff',
  },
  {
    id: 'minimal',
    status: 'preview',
    sports: ['running', 'hiking'],
    name: ['Minimal Pro', 'Minimal Pro', 'Minimal Pro', 'Minimal Pro', 'Minimal Pro'],
    lead: [
      'Sports-watch faces: matte black, white ticks, one orange accent, big numbers. Made for running and trail.',
      'Mostradores de relógio desportivo: preto mate, marcas brancas, um só acento laranja, números grandes. Para corrida e trail.',
      'Des cadrans de montre sport : noir mat, graduations blanches, un seul accent orange, grands chiffres. Pour la course et le trail.',
      'Esferas de reloj deportivo: negro mate, marcas blancas, un solo acento naranja, números grandes. Para running y trail.',
      'Sportuhr-Zifferblätter: mattschwarz, weiße Striche, ein einziger orangefarbener Akzent, große Zahlen. Für Laufen und Trail.',
    ],
    accent: '#ff5a1f',
  },
  {
    id: 'ice',
    status: 'preview',
    sports: ['ski'],
    name: ['Ice', 'Gelo', 'Glace', 'Hielo', 'Eis'],
    lead: [
      'Frosted ice and frozen glass, cyan and white, the run as a glacier, runs and vertical drop. Made for ski and snowboard.',
      'Gelo e vidro gelado, ciano e branco, a descida como um glaciar, descidas e desnível. Para ski e snowboard.',
      'Glace et verre givré, cyan et blanc, la descente comme un glacier, descentes et dénivelé. Pour le ski et le snowboard.',
      'Hielo y cristal escarchado, cian y blanco, la bajada como un glaciar, bajadas y desnivel. Para esquí y snowboard.',
      'Vereistes Glas, Cyan und Weiß, die Abfahrt als Gletscher, Abfahrten und Höhenmeter. Für Ski und Snowboard.',
    ],
    accent: '#67e8f9',
  },
  {
    id: 'outdoor',
    status: 'preview',
    sports: ['hiking', 'cycling', 'running'],
    name: ['Outdoor', 'Outdoor', 'Outdoor', 'Outdoor', 'Outdoor'],
    lead: [
      'Expedition gear: brass, leather, kraft paper with contour lines, road signs and trail markers. For mountain bike, gravel and hiking.',
      'Equipamento de expedição: latão, couro, papel kraft com curvas de nível, sinais e postes de trilho. Para BTT, gravel e caminhada.',
      'Matériel d’expédition : laiton, cuir, papier kraft à courbes de niveau, panneaux et balises. Pour le VTT, le gravel et la randonnée.',
      'Equipo de expedición: latón, cuero, papel kraft con curvas de nivel, señales y postes de sendero. Para BTT, gravel y senderismo.',
      'Expeditionsausrüstung: Messing, Leder, Kraftpapier mit Höhenlinien, Schilder und Wegweiser. Für Mountainbike, Gravel und Wandern.',
    ],
    accent: '#a3b18a',
  },
  {
    id: 'tv',
    status: 'preview',
    sports: ['cycling', 'running'],
    name: ['TV broadcast', 'Transmissão TV', 'Diffusion TV', 'Retransmisión TV', 'TV-Übertragung'],
    lead: [
      'Live race graphics: LIVE badge, stats column, climb lower third with the distance to the top.',
      'Grafismo de corrida em direto: selo AO VIVO, coluna de métricas, faixa da subida com a distância até ao topo.',
      'Habillage de course en direct : badge EN DIRECT, colonne de mesures, bandeau de montée avec la distance au sommet.',
      'Grafismo de carrera en directo: sello EN DIRECTO, columna de métricas, faja de la subida con la distancia a la cima.',
      'Live-Renngrafik: LIVE-Badge, Messwert-Spalte, Bauchbinde mit der Distanz bis zum Gipfel.',
    ],
    accent: '#facc15',
  },
  {
    id: 'hud',
    status: 'preview',
    sports: ['cycling', 'ski'],
    name: ['Aviation HUD', 'HUD aviação', 'HUD aviation', 'HUD de aviación', 'Flug-HUD'],
    lead: [
      'Thin green lines like a fighter jet’s head-up display: pitch ladder for the grade, heading tape, speed and altitude tapes.',
      'Linhas verdes finas como o visor de um caça: escala de pitch para a inclinação, fita de rumo, fitas de velocidade e altitude.',
      'Lignes vertes fines comme l’affichage tête haute d’un avion de chasse : échelle de tangage pour la pente, cap, vitesse et altitude.',
      'Líneas verdes finas como el visor de un caza: escala de cabeceo para la pendiente, cinta de rumbo, velocidad y altitud.',
      'Dünne grüne Linien wie das Head-up-Display eines Kampfjets: Nickleiter für die Steigung, Kursband, Geschwindigkeit und Höhe.',
    ],
    accent: '#4ade80',
  },
  {
    id: 'cyber',
    status: 'preview',
    sports: ['cycling', 'running'],
    name: ['Cyberpunk', 'Cyberpunk', 'Cyberpunk', 'Cyberpunk', 'Cyberpunk'],
    lead: [
      'Neon magenta and cyan, angular frames, digital numbers, an ECG line on the heart rate and a synthwave profile. Best at night.',
      'Néon magenta e ciano, molduras angulares, números digitais, linha de ECG na FC e perfil synthwave. Fica melhor à noite.',
      'Néon magenta et cyan, cadres anguleux, chiffres numériques, tracé ECG sur la FC et profil synthwave. Idéal de nuit.',
      'Neón magenta y cian, marcos angulares, números digitales, línea de ECG en la FC y perfil synthwave. Mejor de noche.',
      'Neon in Magenta und Cyan, kantige Rahmen, Digitalziffern, EKG-Linie bei der HF und Synthwave-Profil. Am besten nachts.',
    ],
    accent: '#ff2bd6',
  },
  {
    id: 'natal',
    status: 'stable',
    sports: [],
    name: ['Christmas 🎄', 'Natal 🎄', 'Noël 🎄', 'Navidad 🎄', 'Weihnachten 🎄'],
    lead: [
      'Festive versions of the gadgets: snow, lights, holly, candy canes, Santa hats, wreaths, a snow globe and a mug of hot chocolate.',
      'Versões festivas dos gadgets: neve, luzes, azevinho, bengalas de Natal, gorros do Pai Natal, coroas, um globo de neve e uma caneca de chocolate quente.',
      'Des versions festives des gadgets : neige, guirlandes, houx, sucres d’orge, bonnets du Père Noël, couronnes, une boule à neige et une tasse de chocolat chaud.',
      'Versiones festivas de los gadgets: nieve, luces, acebo, bastones de caramelo, gorros de Papá Noel, coronas, una bola de nieve y una taza de chocolate caliente.',
      'Festliche Versionen der Gadgets: Schnee, Lichterketten, Stechpalme, Zuckerstangen, Weihnachtsmützen, Kränze, eine Schneekugel und heiße Schokolade.',
    ],
    accent: '#e11d48',
  },
];

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export const themeName = (id: ThemeId, lang: Lang | undefined) => pick(themeInfo(id).name, lang);
export const themeLead = (id: ThemeId, lang: Lang | undefined) => pick(themeInfo(id).lead, lang);

/**
 * Themes offered in the app, in order: Default, then the ones designed for the sport, then the rest.
 * Themes in testing only with `showPreview`.
 */
export function offeredThemes(sport: Sport | undefined, showPreview: boolean): ThemeId[] {
  const ok = THEMES.filter((t) => t.status === 'stable' || showPreview);
  const score = (t: ThemeInfo) => (t.id === 'default' ? 0 : sport && t.sports.includes(sport) ? 1 : 2);
  return ok
    .map((t, i) => ({ t, i }))
    .sort((a, b) => score(a.t) - score(b.t) || a.i - b.i)
    .map(({ t }) => t.id);
}

// ---------------------------------------------------------------------------------------------
// Gadget categories: the same in every theme, so the app reads the same whatever the look.

export type GadgetCategory = 'dials' | 'panels' | 'maps' | 'nav' | 'extras' | 'numbers' | 'segments';
export const GADGET_CATEGORIES: GadgetCategory[] = ['dials', 'panels', 'maps', 'nav', 'extras', 'numbers', 'segments'];

const CATEGORY_NAMES: Record<GadgetCategory, Translations> = {
  dials: ['Dials', 'Mostradores', 'Cadrans', 'Esferas', 'Rundinstrumente'],
  panels: ['Panels', 'Painéis', 'Panneaux', 'Paneles', 'Panels'],
  maps: ['Maps and profiles', 'Mapas e perfis', 'Cartes et profils', 'Mapas y perfiles', 'Karten und Profile'],
  nav: ['Navigation', 'Navegação', 'Navigation', 'Navegación', 'Navigation'],
  extras: ['Theme extras', 'Extras do tema', 'Extras du thème', 'Extras del tema', 'Theme-Extras'],
  numbers: ['Numbers', 'Números', 'Chiffres', 'Números', 'Zahlen'],
  segments: ['Segments and laps', 'Segmentos e voltas', 'Segments et tours', 'Segmentos y vueltas', 'Segmente und Runden'],
};

export const categoryName = (c: GadgetCategory, lang: Lang | undefined) => pick(CATEGORY_NAMES[c], lang);

const SPORT_NAMES: Record<Sport, Translations> = {
  cycling: ['Cycling', 'Ciclismo', 'Vélo', 'Ciclismo', 'Radfahren'],
  running: ['Running and trail', 'Corrida e trail', 'Course et trail', 'Running y trail', 'Laufen und Trail'],
  ski: ['Ski and snowboard', 'Ski e snowboard', 'Ski et snowboard', 'Esquí y snowboard', 'Ski und Snowboard'],
  hiking: ['Hiking', 'Caminhada', 'Randonnée', 'Senderismo', 'Wandern'],
  other: ['Other', 'Outro', 'Autre', 'Otro', 'Andere'],
};

export const sportName = (s: Sport, lang: Lang | undefined) => pick(SPORT_NAMES[s], lang);
