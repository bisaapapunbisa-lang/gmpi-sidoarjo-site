import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync('index.html', 'utf8');
const section = source.match(/<section class="section leadership-section"[\s\S]*?<\/section>/)?.[0];
assert(section, 'Leadership section remains');
for (const cls of ['leadership-actions', 'leadership-film-link', 'leadership-download-link', 'leadership-org-link']) {
  assert(!section.includes(`class="${cls}"`), `${cls} must not appear below video`);
}
assert(section.includes('id="leadership-video"'));
assert(section.includes('class="leadership-sound"'));
assert(source.includes('id="struktur"'));
assert(fs.existsSync('sinematik.html'));
assert(fs.existsSync('assets/cinema/dpd-gmpi-cinematic-4k.mp4'));
console.log('PASS: three action boxes removed; video, sound button, structure and film assets retained');
