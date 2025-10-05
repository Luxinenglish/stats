import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Lecture des données JSON
function readData() {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

// ✅ Écriture des données JSON
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 📡 Enregistrement d'une visite
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

// 📊 Récupération des stats de tous les sites
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

// 🧭 Dashboard HTML avec stats + graphique
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>📊 Pixel Stats Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: #f4f6f8;
      margin: 0;
      padding: 0;
    }
    header {
      background: #007bff;
      color: white;
      padding: 20px;
      text-align: center;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .card {
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      padding: 15px 25px;
      min-width: 180px;
      text-align: center;
    }
    .card h2 {
      margin: 5px 0;
      font-size: 1.5rem;
      color: #007bff;
    }
    .card p {
      margin: 0;
      color: #666;
    }
    .container {
      padding: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #007bff;
      color: white;
    }
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    tr:hover {
      background: #f1f1f1;
    }
    .active {
      color: green;
      font-weight: bold;
    }
    canvas {
      background: white;
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
  </style>
</head>
<body>

<header>
  <h1>📊 Pixel Stats — Dashboard en direct</h1>
  <div class="stats">
    <div class="card">
      <h2 id="totalSites">0</h2>
      <p>Sites suivis</p>
    </div>
    <div class="card">
      <h2 id="totalVisitors">0</h2>
      <p>Total visiteurs</p>
    </div>
    <div class="card">
      <h2 id="activeVisitors">0</h2>
      <p>Visiteurs actifs</p>
    </div>
    <div class="card">
      <h2 id="lastUpdate">--:--:--</h2>
      <p>Dernière mise à jour</p>
    </div>
  </div>
</header>

<div class="container">
  <canvas id="activeChart" height="100"></canvas>

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
</div>

<script>
  const ctx = document.getElementById('activeChart').getContext('2d');
  const activeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Visiteurs actifs (tous sites)',
        data: [],
        borderColor: '#007bff',
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Heure' } },
        y: { beginAtZero: true }
      }
    }
  });

  async function fetchSites() {
    const res = await fetch('/api/sites');
    const sites = await res.json();
    const now = new Date();

    const totalSites = sites.length;
    const totalVisitors = sites.reduce((acc, s) => acc + s.totalVisitors, 0);
    const activeVisitors = sites.reduce((acc, s) => acc + s.activeVisitors, 0);

    document.getElementById('totalSites').textContent = totalSites;
    document.getElementById('totalVisitors').textContent = totalVisitors;
    document.getElementById('activeVisitors').textContent = activeVisitors;
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();

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

    const timeLabel = now.toLocaleTimeString();
    activeChart.data.labels.push(timeLabel);
    activeChart.data.datasets[0].data.push(activeVisitors);
    if (activeChart.data.labels.length > 12) {
      activeChart.data.labels.shift();
      activeChart.data.datasets[0].data.shift();
    }
    activeChart.update();
  }

  fetchSites();
  setInterval(fetchSites, 10000);
</script>

</body>
</html>
  `);
});

// 🚀 Lancement du serveur
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Pixel Stats en ligne sur http://localhost:${PORT}`);
});
