// A tiny pretend product for trying the whole flow. Serves on http://localhost:5555
// 1) npm run products -- add demo "Demo Product" http://localhost:5555
// 2) npm start (the login site)   3) npm run demo   4) open http://localhost:5555
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const LOGIN_URL = (process.env.DEMO_LOGIN_URL || process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8').replaceAll('__LOGIN_URL__', LOGIN_URL);
http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); })
  .listen(5555, () => console.log('Demo product on http://localhost:5555  (login site: ' + LOGIN_URL + ')'));
