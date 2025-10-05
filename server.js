import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');
const STATS_FILE = path.join(__dirname, 'stats.json');
const CHART_FILE = path.join(__dirname, 'chart.json'); // 🆕 pour persister le graphique du dashboard

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Utils JSON
function readJSON(file, fallback = {}) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// 📡 Enregistrement visite
app.post('/api/track', (req, res) => {
    const { site, page, referrer, userAgent } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const timestamp = Date.now();

    const data = readJSON(DATA_FILE);
    if (!data[site]) data[site] = [];
    data[site].push({ page, referrer, userAgent, ip, timestamp });
    writeJSON(DATA_FILE, data);

    // Mise à jour stats cumulées
    const stats = readJSON(STATS_FILE);
    if (!stats[site]) stats[site] = { daily: {}, monthly: {}, yearly: {} };

    const now = new Date();
    const dayKey = now.toISOString().split('T')[0];
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = `${now.getFullYear()}`;

    stats[site].daily[dayKey] = (stats[site].daily[dayKey] || 0) + 1;
    stats[site].monthly[monthKey] = (stats[site].monthly[monthKey] || 0) + 1;
    stats[site].yearly[yearKey] = (stats[site].yearly[yearKey] || 0) + 1;

    writeJSON(STATS_FILE, stats);

    res.json({ status: 'ok' });
});

// 📊 API sites temps réel
app.get('/api/sites', (req, res) => {
    const data = readJSON(DATA_FILE);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    const sites = Object.keys(data).map(site => {
        const visits = data[site];
        const total = visits.length;
        const active = visits.filter(v => now - v.timestamp <= fiveMinutes).length;
        const lastVisit = visits.length > 0 ? visits[visits.length - 1].timestamp : null;

        return { site, totalVisitors: total, activeVisitors: active, lastVisit };
    });

    res.json(sites);
});

// 📈 API données du graphique persistant
app.get('/api/chart', (req, res) => {
    const chart = readJSON(CHART_FILE, { labels: [], values: [] });
    res.json(chart);
});

app.post('/api/chart', (req, res) => {
    const { label, value } = req.body;
    const chart = readJSON(CHART_FILE, { labels: [], values: [] });

    chart.labels.push(label);
    chart.values.push(value);

    // on garde uniquement les 144 points (24h si maj toutes les 10min)
    if (chart.labels.length > 144) {
        chart.labels.shift();
        chart.values.shift();
    }

    writeJSON(CHART_FILE, chart);
    res.json({ status: 'ok' });
});

// 📅 API stats cumulées
app.get('/api/stats', (req, res) => {
    const stats = readJSON(STATS_FILE);
    res.json(stats);
});

// 🧭 Page dashboard avec graphique persistant
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>📊 Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: sans-serif; background: #f4f6f8; margin: 0; }
    header { background: #007bff; color: white; padding: 20px; text-align: center; }
    .stats { display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; margin-top: 10px; }
    .card { background: white; border-radius: 10px; padding: 10px 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    canvas { background: white; margin: 20px; border-radius: 8px; padding: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
  </style>
</head>
<body>
  <header>
    <h1>📊 Dashboard temps réel</h1>
    <div class="stats">
      <div class="card"><h2 id="totalSites">0</h2><p>Sites suivis</p></div>
      <div class="card"><h2 id="totalVisitors">0</h2><p>Total visiteurs</p></div>
      <div class="card"><h2 id="activeVisitors">0</h2><p>Visiteurs actifs</p></div>
    </div>
  </header>

  <canvas id="chart"></canvas>

  <script>
    const ctx = document.getElementById('chart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Visiteurs actifs', data: [], borderColor: '#007bff', fill: false }] },
      options: { scales: { y: { beginAtZero: true } } }
    });

    async function loadChart() {
      const res = await fetch('/api/chart');
      const data = await res.json();
      chart.data.labels = data.labels;
      chart.data.datasets[0].data = data.values;
      chart.update();
    }

    async function updateStats() {
      const res = await fetch('/api/sites');
      const sites = await res.json();
      const totalSites = sites.length;
      const totalVisitors = sites.reduce((a,s)=>a+s.totalVisitors,0);
      const activeVisitors = sites.reduce((a,s)=>a+s.activeVisitors,0);

      document.getElementById('totalSites').textContent = totalSites;
      document.getElementById('totalVisitors').textContent = totalVisitors;
      document.getElementById('activeVisitors').textContent = activeVisitors;

      const label = new Date().toLocaleTimeString();
      await fetch('/api/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, value: activeVisitors })
      });
      loadChart();
    }

    loadChart();
    updateStats();
    setInterval(updateStats, 60000); // toutes les minutes
  </script>
</body>
</html>
  `);
});

// 📅 Page stats historique
app.get('/stats', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>📈 Stats historiques</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: sans-serif; background: #f4f6f8; margin: 0; padding: 20px; }
    h1 { text-align: center; }
    canvas { background: white; padding: 10px; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>📈 Stats historiques par site</h1>
  <select id="period">
    <option value="daily">Journalières</option>
    <option value="monthly">Mensuelles</option>
    <option value="yearly">Annuelles</option>
  </select>

  <canvas id="historyChart"></canvas>

  <script>
    const ctx = document.getElementById('historyChart').getContext('2d');
    const historyChart = new Chart(ctx, { type: 'line', data: { labels: [], datasets: [] } });

    async function loadHistory() {
      const period = document.getElementById('period').value;
      const res = await fetch('/api/stats');
      const stats = await res.json();
      const labelsSet = new Set();
      const datasets = [];

      for (const [site, periods] of Object.entries(stats)) {
        const entries = Object.entries(periods[period] || {}).sort(([a],[b]) => a.localeCompare(b));
        entries.forEach(([k]) => labelsSet.add(k));
        datasets.push({
          label: site,
          data: entries.map(([_, v]) => v),
          borderColor: '#'+Math.floor(Math.random()*16777215).toString(16),
          fill: false
        });
      }

      const labels = Array.from(labelsSet).sort((a,b)=>a.localeCompare(b));
      historyChart.data.labels = labels;
      historyChart.data.datasets = datasets;
      historyChart.update();
    }

    document.getElementById('period').addEventListener('change', loadHistory);
    loadHistory();
  </script>
</body>
</html>
  `);
});

// 🕛 Reset logs bruts à minuit
function scheduleDailyReset() {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 0) - now;
    setTimeout(() => {
        console.log('🕛 Reset journalier des logs bruts');
        writeJSON(DATA_FILE, {});
        scheduleDailyReset();
    }, msUntilMidnight);
}
scheduleDailyReset();

// 🚀 Serveur
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Serveur sur http://localhost:${PORT}`));
