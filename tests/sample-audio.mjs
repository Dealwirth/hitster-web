import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync('data/catalog.json','utf8'));
const songs = cat.songs;
const pick = [];
const seen = new Set();
for (let i = 0; i < 60 && pick.length < 36; i++) {
  const s = songs[Math.floor(Math.random()*songs.length)];
  if (seen.has(s.id)) continue;
  seen.add(s.id);
  pick.push(s);
}
let ok=0, fail=[];
for (const s of pick) {
  const t=Date.now();
  try {
    const r = await fetch(`http://localhost:12000/api/audio/${s.id}`, { method:'HEAD' });
    const len = Number(r.headers.get('content-length')||0);
    const ct = r.headers.get('content-type')||'';
    if (r.status===200 && len>10000 && ct.startsWith('audio/')) { ok++; console.log('OK ', s.id, s.artist,'-',s.title, ct, len, `${Date.now()-t}ms`); }
    else { fail.push(`${s.id} ${s.artist} - ${s.title}: ${r.status} ${ct} ${len}`); }
  } catch(e) { fail.push(`${s.id}: ${e.message}`); }
}
console.log(`\n${ok}/${pick.length} audio samples OK`);
if (fail.length) { console.log('FAILURES:'); fail.forEach(f=>console.log(' -',f)); process.exit(1); }
