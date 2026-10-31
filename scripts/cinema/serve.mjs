import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.mp4':'video/mp4', '.m4a':'audio/mp4', '.pdf':'application/pdf', '.txt':'text/plain; charset=utf-8' };
const server = http.createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{Allow:'GET, HEAD'});res.end();return; }
    const url = new URL(req.url,'http://preview.local');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/sinematik') pathname = '/sinematik.html';
    const forceDownload = pathname === '/unduh-film' || pathname === '/unduh-film-4k' || url.searchParams.get('unduh') === '1';
    if (pathname === '/unduh-film' || pathname === '/unduh-film-4k') pathname = '/assets/cinema/dpd-gmpi-cinematic-4k.mp4';
    const file = resolve(root, '.' + pathname);
    const relative = file.slice(root.length + 1);
    if (!file.startsWith(root + sep) || relative.split(sep).some(part => part.startsWith('.') || part === 'node_modules')) { res.writeHead(403);res.end('Forbidden');return; }
    const info = await stat(file);
    if (!info.isFile()) throw Object.assign(new Error('Not a file'),{code:'ENOENT'});
    const headers = { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'X-Content-Type-Options':'nosniff', 'Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600' };
    if (forceDownload) headers['Content-Disposition'] = 'attachment; filename="DPD-GMPI-Sidoarjo-Cahaya-Perjuangan-4K.mp4"';
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) { res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return; }
      let start = match[1] ? Number(match[1]) : Math.max(0,info.size-Number(match[2]));
      let end = match[1] && match[2] ? Math.min(Number(match[2]),info.size-1) : info.size-1;
      if (start > end || start >= info.size) { res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return; }
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});
      if (req.method==='HEAD') res.end();else createReadStream(file,{start,end}).pipe(res);
    } else {
      res.writeHead(200,{...headers,'Content-Length':info.size});
      if (req.method==='HEAD') res.end();else createReadStream(file).pipe(res);
    }
  } catch (error) {
    res.writeHead(error.code==='ENOENT'||error.code==='ENOTDIR'?404:400,{'Content-Type':'text/plain; charset=utf-8'});
    res.end(error.code==='ENOENT'||error.code==='ENOTDIR'?'Tidak ditemukan':'Permintaan tidak valid');
  }
});
server.listen(port,'0.0.0.0',()=>console.log(`GMPI site and cinematic player: http://0.0.0.0:${port}\nPlayer: /sinematik.html`));
