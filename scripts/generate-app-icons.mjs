// Draws the app icon (design "S2": four habit cells, two ticked, one open,
// one missed) from one geometry into every raster and SVG the apps ship.
// Run with `node scripts/generate-app-icons.mjs` after changing the design.
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { oklchToHex } from '../packages/core/src/colors.ts';

// Geometry in icon units: the square icon spans 0–100.
const GROUND = '#0A0A0A';
const colours = {
  green: oklchToHex({ l: 0.8, c: 0.19, h: 150 }),
  amber: oklchToHex({ l: 0.84, c: 0.15, h: 80 }),
  red: oklchToHex({ l: 0.68, c: 0.21, h: 25 }),
  teal: oklchToHex({ l: 0.8, c: 0.14, h: 178 }),
};
const CELL = 30;
const RADIUS = 8;
const OUTLINE = 3.5;
const TICK = 4.5;
const CROSS = 3.5;
const tick = (x, y) => [
  [x + 7.5, y + 15.5],
  [x + 13, y + 21],
  [x + 23, y + 9.5],
];
// iOS and Android round the corners themselves; this radius is only for
// favicons and in-page marks, matching the iOS mask at small sizes.
const CORNER = 22.37;

/** Each layer is drawn in order; `erase` cuts through earlier layers. */
const layers = [
  { shape: { box: [17, 17, CELL, CELL, RADIUS] }, colour: colours.green },
  { shape: { line: tick(17, 17), width: TICK }, erase: true },
  {
    shape: {
      ring: [53, 17, CELL, CELL, RADIUS, OUTLINE],
    },
    colour: colours.amber,
  },
  {
    shape: {
      lines: [
        [
          [25, 61],
          [39, 75],
        ],
        [
          [39, 61],
          [25, 75],
        ],
      ],
      width: CROSS,
    },
    colour: colours.red,
  },
  { shape: { box: [53, 53, CELL, CELL, RADIUS] }, colour: colours.teal },
  { shape: { line: tick(53, 53), width: TICK }, erase: true },
];

function boxDistance(px, py, [x, y, w, h, r]) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distance(px, py, shape) {
  if (shape.box) return boxDistance(px, py, shape.box);
  if (shape.ring) {
    const [x, y, w, h, r, width] = shape.ring;
    const inner = [
      x + width,
      y + width,
      w - 2 * width,
      h - 2 * width,
      r - width,
    ];
    return Math.max(
      boxDistance(px, py, [x, y, w, h, r]),
      -boxDistance(px, py, inner),
    );
  }
  const paths = shape.lines ?? [shape.line];
  let nearest = Infinity;
  for (const points of paths) {
    for (let i = 1; i < points.length; i++) {
      nearest = Math.min(
        nearest,
        segmentDistance(px, py, points[i - 1], points[i]),
      );
    }
  }
  return nearest - shape.width / 2;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Renders RGBA pixels. `scale` and `offset` map icon units to pixels;
 * `ground` paints the icon square behind the cells (`rounded` for favicons);
 * `ink` replaces every cell colour (Android's monochrome layer).
 */
function render(size, { scale, offset = 0, ground, rounded = false, ink }) {
  const pixels = new Float64Array(size * size * 4);
  const paint = (shape, colour, erase) => {
    const [r, g, b] = colour ? rgb(colour) : [0, 0, 0];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ux = (x + 0.5 - offset) / scale;
        const uy = (y + 0.5 - offset) / scale;
        const coverage = Math.min(
          1,
          Math.max(0, 0.5 - distance(ux, uy, shape) * scale),
        );
        if (coverage === 0) continue;
        const i = (y * size + x) * 4;
        if (erase) {
          for (let c = 0; c < 4; c++) pixels[i + c] *= 1 - coverage;
          continue;
        }
        // Premultiplied "over" compositing.
        const keep = 1 - coverage;
        pixels[i] = r * coverage + pixels[i] * keep;
        pixels[i + 1] = g * coverage + pixels[i + 1] * keep;
        pixels[i + 2] = b * coverage + pixels[i + 2] * keep;
        pixels[i + 3] = 255 * coverage + pixels[i + 3] * keep;
      }
    }
  };
  for (const layer of layers) {
    paint(layer.shape, ink ?? layer.colour, layer.erase);
  }
  if (ground) {
    // Slide the ground under the cells so erased ticks show it through.
    const cells = pixels.slice();
    pixels.fill(0);
    paint({ box: [0, 0, 100, 100, rounded ? CORNER : 0] }, ground);
    for (let i = 0; i < cells.length; i += 4) {
      const keep = 1 - cells[i + 3] / 255;
      for (let c = 0; c < 4; c++) {
        pixels[i + c] = cells[i + c] + pixels[i + c] * keep;
      }
    }
  }
  const bytes = new Uint8Array(size * size * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    const alpha = pixels[i + 3];
    for (let c = 0; c < 3; c++) {
      bytes[i + c] = alpha > 0 ? Math.round((pixels[i + c] * 255) / alpha) : 0;
    }
    bytes[i + 3] = Math.round(alpha);
  }
  return bytes;
}

function png(size, rgba, { opaque = false } = {}) {
  const channels = opaque ? 3 : 4;
  const rows = Buffer.alloc(size * (size * channels + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * channels + 1);
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < channels; c++) {
        rows[row + 1 + x * channels + c] = rgba[(y * size + x) * 4 + c];
      }
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const round = (n) => Math.round(n * 100) / 100;
const points = (line) => line.map(([x, y]) => `${x} ${y}`).join(' ');

function svg() {
  const parts = [
    `<rect width="100" height="100" rx="${CORNER}" fill="${GROUND}"/>`,
  ];
  for (const { shape, colour, erase } of layers) {
    const fill = erase ? GROUND : colour;
    if (shape.box) {
      const [x, y, w, h, r] = shape.box;
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`,
      );
    } else if (shape.ring) {
      const [x, y, w, h, r, width] = shape.ring;
      const half = width / 2;
      parts.push(
        `<rect x="${round(x + half)}" y="${round(y + half)}" width="${round(w - width)}" height="${round(h - width)}" rx="${round(r - half)}" fill="none" stroke="${fill}" stroke-width="${width}"/>`,
      );
    } else {
      const d = (shape.lines ?? [shape.line])
        .map((line) => `M${points(line)}`)
        .join('');
      parts.push(
        `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parts.join('')}</svg>\n`;
}

// Android adaptive icons are 108 dp with 72 dp visible; the visible part
// gets the same proportions as the iOS icon, which keeps the cells inside
// the 66 dp safe zone.
const adaptive = (size) => ({
  scale: (size * 72) / 108 / 100,
  offset: (size * 18) / 108,
});
const root = new URL('../', import.meta.url);
const outputs = {
  'assets/icon.png': png(1024, render(1024, { scale: 10.24, ground: GROUND }), {
    opaque: true,
  }),
  'assets/android-icon-foreground.png': png(512, render(512, adaptive(512))),
  'assets/android-icon-background.png': png(
    512,
    new Uint8Array(512 * 512 * 4).map((_, i) =>
      i % 4 === 3 ? 255 : rgb(GROUND)[i % 4],
    ),
  ),
  'assets/android-icon-monochrome.png': png(
    432,
    render(432, { ...adaptive(432), ink: '#FFFFFF' }),
  ),
  'assets/splash-icon.png': png(1024, render(1024, { scale: 10.24 })),
  'assets/favicon.png': png(
    48,
    render(48, { scale: 0.48, ground: GROUND, rounded: true }),
  ),
  'apps/web/public/favicon.svg': svg(),
  'apps/landing/public/favicon.svg': svg(),
};
for (const [path, data] of Object.entries(outputs)) {
  await writeFile(new URL(path, root), data);
}
console.log(
  `Wrote ${Object.keys(outputs).length} icon files with ${Object.values(colours).join(', ')}`,
);
