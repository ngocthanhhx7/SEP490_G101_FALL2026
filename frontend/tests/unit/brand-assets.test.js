import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const tokens = Object.fromEntries([...fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8')
  .matchAll(/(--pwc-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [match[1], match[2]]));
const report = JSON.parse(fs.readFileSync(path.join(root, '../doc/ui-ux/p04-contrast-report.json'), 'utf8'));
function luminance(hex) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test.each(report.pairs)('contrast $foreground/$background meets $minimum without threshold rounding', (pair) => {
  const values = [luminance(tokens[`--pwc-${pair.foreground}`]), luminance(tokens[`--pwc-${pair.background}`])].sort((a, b) => a - b);
  const ratio = (values[1] + 0.05) / (values[0] + 0.05);
  expect(ratio).toBeGreaterThanOrEqual(pair.minimum);
  expect(Number(ratio.toFixed(3))).toBe(pair.ratio);
});

const faces = [...fs.readFileSync(path.join(root, 'src/styles/fonts.css'), 'utf8')
  .matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
test.each(faces)('static font declaration matches actual OS/2 weight and style: %s', (face) => {
  const file = face.match(/url\('\/fonts\/([^']+)'\)/)[1];
  const bytes = fs.readFileSync(path.join(root, 'public/fonts', file));
  const tables = {};
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const offset = 12 + index * 16;
    tables[bytes.toString('ascii', offset, offset + 4)] = bytes.readUInt32BE(offset + 8);
  }
  expect(tables.fvar).toBeUndefined();
  const weight = bytes.readUInt16BE(tables['OS/2'] + 4);
  const style = bytes.readUInt16BE(tables['OS/2'] + 62) & 1 ? 'italic' : 'normal';
  expect(Number(face.match(/font-weight:\s*(\d+);/)[1])).toBe(weight);
  expect(face.match(/font-style:\s*(\w+);/)[1]).toBe(style);
});
