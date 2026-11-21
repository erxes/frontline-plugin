// The app's icons as SVG, which build.ts renders to PNG: the app icon, and the tray's icon for
// each state of the phone. One headset glyph, on a 1024 grid, draws them all.

/** The phone's state as the tray shows it: a call that rings or is on gets a dot. */
export type TrayState = 'ready' | 'offline' | 'call';

export const TRAY_STATES: TrayState[] = ['ready', 'offline', 'call'];

const HEADSET = `
  <path d="M298 532v-26a214 214 0 0 1 428 0v26" fill="none" stroke="currentColor" stroke-width="60" stroke-linecap="round"/>
  <rect x="258" y="476" width="120" height="210" rx="52"/>
  <rect x="646" y="476" width="120" height="210" rx="52"/>
  <path d="M706 676c0 62-50 96-120 96h-36" fill="none" stroke="currentColor" stroke-width="40" stroke-linecap="round"/>
  <rect x="452" y="738" width="120" height="68" rx="34"/>`;

/** The tile's colours, top to bottom: erxes's indigo, or grey while the phone is offline. */
const TILE = { ready: ['#7363f7', '#3b25bd'], offline: ['#a1a1aa', '#62626c'] };

const svg = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

const gradient = ([top, bottom]: string[]) =>
  `<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>
  </linearGradient>`;

/**
 * The app icon on Apple's grid: an 824 tile with a 185 corner and a soft shadow, inside 1024.
 * Windows and Linux take the same picture.
 */
export const appIcon = () =>
  svg(
    '0 0 1024 1024',
    `<defs>${gradient(TILE.ready)}
      <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <filter id="drop" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dy="12" stdDeviation="14" flood-opacity=".28"/>
      </filter>
      <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dy="6" stdDeviation="10" flood-color="#1a0f66" flood-opacity=".35"/>
      </filter>
    </defs>
    <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#tile)" filter="url(#drop)"/>
    <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#sheen)"/>
    <rect x="101" y="101" width="822" height="822" rx="184" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
    <g color="#fff" fill="#fff" filter="url(#lift)">${HEADSET}</g>`,
  );

type Dot = { x: number; y: number; r: number; fill: string };

/** The dot a call adds at the top right, with a gap cut around it. */
const dotted = (picture: string, { x, y, r, fill }: Dot) =>
  `<defs><mask id="gap"><rect width="1024" height="1024" fill="#fff"/>
    <circle cx="${x}" cy="${y}" r="${r * 1.4}"/></mask></defs>
  <g mask="url(#gap)">${picture}</g>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

/**
 * macOS's menu bar icon: a template, black on clear, that the system tints for a light or dark
 * bar. Offline is faint.
 */
export const trayTemplate = (state: TrayState) => {
  const glyph = `<g color="#000" fill="#000" opacity="${state === 'offline' ? 0.4 : 1}">${HEADSET}</g>`;

  return svg(
    '212 234 600 600',
    state === 'call' ? dotted(glyph, { x: 744, y: 300, r: 88, fill: '#000' }) : glyph,
  );
};

/**
 * The tray icon on Windows and Linux: the app's tile edge to edge, its headset larger to read at
 * 16 pixels, grey while offline.
 */
export const trayTile = (state: TrayState) => {
  const tile = `<defs>${gradient(state === 'offline' ? TILE.offline : TILE.ready)}</defs>
    <rect x="100" y="100" width="824" height="824" rx="200" fill="url(#tile)"/>
    <g color="#fff" fill="#fff" transform="translate(512 524) scale(1.2) translate(-512 -534)">${HEADSET}</g>`;

  return svg(
    '100 100 824 824',
    state === 'call' ? dotted(tile, { x: 794, y: 230, r: 126, fill: '#22c55e' }) : tile,
  );
};
