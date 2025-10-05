import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 📡 Enregistrer les visites
app.post('/api/track', (req, res) => {
    const { site, page, referrer, userAgent } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const timestamp = Date.now();

    const data = readData();
    if (!data[site]) data[site] = [];
    data[site].push({ page, referrer, userAgent, ip, timestamp });

    writeData(data);
    res.json({ status: 'ok' });
});

// 📊 Stats pour tous les sites
app.get('/api/sites', (req, res) => {
    const data = readData();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    const sites = Object.keys(data).map(site => {
        const visits = data[site];
        const total = visits.length;
        const active = visits.filter(v => now - v.timestamp <= fiveMinutes).length;
        const lastVisit = visits.length > 0 ? visits[visits.length - 1].timestamp : null;

        return {
            site,
            totalVisitors: total,
            activeVisitors: active,
            lastVisit
        };
    });

    res.json(sites);
});

// 🧭 Dashboard accessible via /dashboard
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard Pixel Stats</title>
  <style>
    body { font-family: Arial; background: #f6f8fa; padding: 20px; }
    h1 { text-align: center; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { padding: 10px; border-bottom: 1px solid #ddd; }
    th { background: #007bff; color: white; }
    tr:hover { background: #f1f1f1; }
    .active { color: green; font-weight: bold; }
  </style>
</head>
<body>
  <h1>📊 Pixel Stats — Statistiques des sites connectés</h1>
  <table>
    <thead>
      <tr>
        <th>Site</th>
        <th>Visiteurs actifs</th>
        <th>Total visiteurs</th>
        <th>Dernière activité</th>
      </tr>
    </thead>
    <tbody id="siteList"></tbody>
  </table>

  <script>
    async function fetchSites() {
      const res = await fetch('/api/sites');
      const sites = await res.json();
      const tbody = document.getElementById('siteList');
      tbody.innerHTML = '';

      sites.forEach(site => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>\${site.site}</td>
          <td class="\${site.activeVisitors > 0 ? 'active' : ''}">\${site.activeVisitors}</td>
          <td>\${site.totalVisitors}</td>
          <td>\${site.lastVisit ? new Date(site.lastVisit).toLocaleString() : '-'}</td>
        \`;
        tbody.appendChild(tr);
      });
    }

    fetchSites();
    setInterval(fetchSites, 10000);
  </script>
</body>
</html>
  `);
});

app.listen(3000, () => {
    console.log('✅ Pixel Stats lancé sur http://localhost:3000');
});