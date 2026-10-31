import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, writeFileSync, mkdirSync, statSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { createRenderer, DURATION } = require(resolve(root, 'assets/cinema/film.js'));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const width = Number(arg('--width', 3840));
const height = Math.round(width * 9 / 16);
const fps = Number(arg('--fps', 24));
const output = resolve(root, arg('--out', 'assets/cinema/dpd-gmpi-cinematic-4k.mp4'));
if (![1280, 1920, 2560, 3840].includes(width) || ![24, 30, 60].includes(fps)) throw new Error('Use width 1280/1920/2560/3840 and fps 24/30/60.');
mkdirSync(dirname(output), { recursive: true });
GlobalFonts.registerFromPath(resolve(root, 'assets/fonts/anton-latin-400-normal.woff2'), 'Anton');
GlobalFonts.registerFromPath(resolve(root, 'assets/fonts/inter-latin-800-normal.woff2'), 'Inter');
const assets = {};
for (const [key, file] of Object.entries({ stage: 'stage.webp', left: 'figure-sayegi.webp', right: 'figure-hasmin.webp', crest: 'crest.webp' })) {
  assets[key] = await loadImage(resolve(root, 'assets/cinema', file));
}
const canvas = createCanvas(width, height);
const renderer = createRenderer(canvas, assets, { createCanvas });
renderer.render(15);
writeFileSync(resolve(root, 'assets/cinema/film-poster.jpg'), canvas.toBuffer('image/jpeg', 92));
console.log(`Poster ready. Rendering ${width}×${height}, ${fps} fps, ${DURATION}s.`);
if (process.argv.includes('--poster-only')) process.exit(0);

let ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (!process.env.FFMPEG) {
  const python = resolve(root, '.venv/bin/python');
  if (existsSync(python)) ffmpeg = execFileSync(python, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
}
const score = resolve(root, '.cache/cinema/score.wav');
if (!existsSync(score)) throw new Error('Generate the original score first: python scripts/cinema/make-score.py');
const frameDir = resolve(root, '.cache/cinema/frames');
mkdirSync(frameDir, { recursive: true });
const args = ['-hide_banner', '-y', '-framerate', String(fps), '-i', resolve(frameDir, 'frame-%05d.jpg'), '-i', score,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-threads', '1', '-x264-params', 'rc-lookahead=0:sync-lookahead=0:sliced-threads=1',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', '-metadata', 'title=DPD GMPI Sidoarjo — Cahaya Perjuangan',
  '-metadata', 'comment=Original-photo 2.5D parallax; original synthesized score.', output];
mkdirSync(resolve(root, '.cache/cinema'), { recursive: true });
const logPath = resolve(root, '.cache/cinema/ffmpeg.log');
const log = createWriteStream(logPath);
const frames = Math.round(DURATION * fps);
const start = Date.now();
const encodeOnly = process.argv.includes('--encode-only');
for (let i = 0; i < frames && !encodeOnly; i++) {
  renderer.render(i / fps);
  writeFileSync(resolve(frameDir, `frame-${String(i).padStart(5,'0')}.jpg`), canvas.toBuffer('image/jpeg', 96));
  if (i % fps === 0) console.log(`Frame ${i}/${frames} · ${Math.round(i / frames * 100)}% · ${Math.round((Date.now() - start) / 1000)}s elapsed`);
}

if (encodeOnly) console.log(`Encoding ${frames} existing frames.`);
const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); log.write(chunk); });
const exited = once(child, 'close');
const [code] = await exited;
log.end();
if (code !== 0) throw new Error(`FFmpeg exited ${code}\n${stderr}`);
console.log(`Done: ${output} (${(statSync(output).size / 1024 / 1024).toFixed(1)} MB) in ${Math.round((Date.now() - start) / 1000)}s.`);
