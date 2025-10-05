// server.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');

// 🧱 Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 📖 Lecture des données JSON
function readData() {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}', 'utf-8');
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// ✍️ Écriture des données JSON
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
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

// 📊 Stats en direct (total, actifs, dernier passage)
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

// 📅 Statistiques des 7 derniers jours
app.get('/api/stats/weekly', (req, res) => {
    const data = readData();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const weeklyStats = {};
    Object.keys(data).forEach(site => {
        const visits = data[site];
        const recentVisits = visits.filter(v => now - v.timestamp <= sevenDays);
        weeklyStats[site] = recentVisits.length;
    });

    res.json(weeklyStats);
});

// 🔀 Fusion de deux sites en un seul
app.post('/api/sites/merge', (req, res) => {
    const { a, b, into } = req.body;

    if (!a || !b || !into) {
        return res.status(400).json({ error: 'Missing fields: a, b, into' });
    }
    if (a === b) {
        return res.status(400).json({ error: 'Fields a and b must be different' });
    }

    const data = readData();
    if (!data[a] || !data[b]) {
        return res.status(404).json({ error: 'One or both source sites not found' });
    }

    const merged = [...data[a], ...data[b]].sort((x, y) => x.timestamp - y.timestamp);

    if (!data[into]) data[into] = [];
    data[into] = [...data[into], ...merged].sort((x, y) => x.timestamp - y.timestamp);

    if (into !== a) delete data[a];
    if (into !== b) delete data[b];

    writeData(data);
    return res.json({ status: 'ok', site: into, total: data[into].length });
});

// 🧭 Dashboard HTML
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>📊 Pixel Stats Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }
    header { background: #007bff; color: white; padding: 20px; text-align: center; }
    .stats { display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; margin-top: 10px; }
    .card { background: white; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); padding: 15px 25px; min-width: 180px; text-align: center; }
    .card h2 { margin: 5px 0; font-size: 1.5rem; color: #007bff; }
    .card p { margin: 0; color: #666; }
    .container { padding: 20px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #007bff; color: white; }
    tr:nth-child(even) { background: #f9f9f9; }
    tr:hover { background: #f1f1f1; }
    .active { color: green; font-weight: bold; }
    canvas { background: white; padding: 10px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
  </style>
</head>
<body>

<header>
  <h1>📊 Pixel Stats — Dashboard en direct</h1>
  <div class="stats">
    <div class="card"><h2 id="totalSites">0</h2><p>Sites suivis</p></div>
    <div class="card"><h2 id="totalVisitors">0</h2><p>Total visiteurs</p></div>
    <div class="card"><h2 id="activeVisitors">0</h2><p>Visiteurs actifs</p></div>
    <div class="card"><h2 id="lastUpdate">--:--:--</h2><p>Dernière mise à jour</p></div>
  </div>
</header>

<div class="container">
  <canvas id="combinedChart" height="120"></canvas>

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

  <canvas id="weeklyPieChart" height="80" style="max-height: 400px; margin-top: 20px;"></canvas>
</div>

<script>
  const ctxCombined = document.getElementById('combinedChart').getContext('2d');
  const combinedChart = new Chart(ctxCombined, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Total visiteurs actifs',
        data: [],
        borderColor: '#007bff',
        borderWidth: 2,
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { title: { display: true, text: 'Heure' } },
        y: { beginAtZero: true }
      }
    }
  });

  const siteColors = {};
  const predefinedColors = [
    '#28a745', '#dc3545', '#ffc107', '#17a2b8',
    '#6f42c1', '#e83e8c', '#fd7e14', '#20c997', '#6610f2'
  ];
  function getColorForSite(site) {
    if (!siteColors[site]) {
      const n = Object.keys(siteColors).length;
      if (n < predefinedColors.length) siteColors[site] = predefinedColors[n];
      else siteColors[site] = \`hsl(\${n*137.5},70%,50%)\`;
    }
    return siteColors[site];
  }

  const weeklyPieChart = new Chart(document.getElementById('weeklyPieChart').getContext('2d'), {
    type: 'pie',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        title: { display: true, text: 'Répartition des visiteurs par site (7 derniers jours)' }
      }
    }
  });

  async function fetchWeeklyStats() {
    const res = await fetch('/api/stats/weekly');
    const stats = await res.json();
    const sites = Object.keys(stats);
    const values = Object.values(stats);
    const colors = sites.map(getColorForSite);
    weeklyPieChart.data.labels = sites;
    weeklyPieChart.data.datasets[0].data = values;
    weeklyPieChart.data.datasets[0].backgroundColor = colors;
    weeklyPieChart.update();
  }

  async function fetchSites() {
    const res = await fetch('/api/sites');
    const sites = await res.json();
    const now = new Date();

    document.getElementById('totalSites').textContent = sites.length;
    document.getElementById('totalVisitors').textContent = sites.reduce((a,s)=>a+s.totalVisitors,0);
    document.getElementById('activeVisitors').textContent = sites.reduce((a,s)=>a+s.activeVisitors,0);
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();

    const tbody = document.getElementById('siteList');
    tbody.innerHTML = '';
    sites.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>\${s.site}</td>
        <td class="\${s.activeVisitors>0?'active':''}">\${s.activeVisitors}</td>
        <td>\${s.totalVisitors}</td>
        <td>\${s.lastVisit?new Date(s.lastVisit).toLocaleString():'-'}</td>
      \`;
      tbody.appendChild(tr);
    });

    const timeLabel = now.toLocaleTimeString();
    combinedChart.data.labels.push(timeLabel);
    if (combinedChart.data.labels.length > 12) {
      combinedChart.data.labels.shift();
      combinedChart.data.datasets.forEach(ds => ds.data.shift());
    }

    const totalActive = sites.reduce((a,s)=>a+s.activeVisitors,0);
    combinedChart.data.datasets[0].data.push(totalActive);

    sites.forEach(site => {
      let ds = combinedChart.data.datasets.find(d=>d.label===site.site);
      if (!ds) {
        ds = {
          label: site.site,
          data: new Array(combinedChart.data.labels.length-1).fill(0),
          borderColor: getColorForSite(site.site),
          fill: false,
          tension: 0.3
        };
        combinedChart.data.datasets.push(ds);
      }
      ds.data.push(site.activeVisitors);
    });

    combinedChart.update();
  }

  fetchSites();
  fetchWeeklyStats();
  setInterval(fetchSites, 10000);
  setInterval(fetchWeeklyStats, 30000);
</script>

</body>
</html>
  `);
});

// 🚀 Lancement
const PORT = 1100;
app.listen(PORT, () => {
    console.log(`✅ Pixel Stats en ligne sur http://localhost:${PORT}/dashboard`);
});
