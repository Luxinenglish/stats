import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb://localhost:27017/pixelxstats', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const visitSchema = new mongoose.Schema({
    site: String,
    page: String,
    ip: String,
    userAgent: String,
    referrer: String,
    timestamp: { type: Date, default: Date.now }
});

const Visit = mongoose.model('Visit', visitSchema);

// 🔸 API de tracking
app.post('/api/track', async (req, res) => {
    const { site, page, referrer, userAgent } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await Visit.create({ site, page, ip, userAgent, referrer });
    res.json({ status: 'ok' });
});

// 🔸 API de stats
app.get('/api/stats/:site', async (req, res) => {
    const site = req.params.site;
    const total = await Visit.countDocuments({ site });
    const now = new Date();
    const activeSince = new Date(now.getTime() - 5 * 60 * 1000);
    const active = await Visit.countDocuments({ site, timestamp: { $gte: activeSince } });

    res.json({ site, totalVisitors: total, activeVisitors: active });
});

// 🔸 Dashboard HTML par défaut
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Nouvelle route : liste tous les sites + stats
app.get('/api/sites', async (req, res) => {
    // Récupérer tous les noms de sites uniques
    const sites = await Visit.aggregate([
        { $group: { _id: '$site', lastVisit: { $max: '$timestamp' }, total: { $sum: 1 } } },
        { $sort: { lastVisit: -1 } }
    ]);

    const now = new Date();
    const activeSince = new Date(now.getTime() - 5 * 60 * 1000);

    // Pour chaque site, calculer le nombre de visiteurs actifs
    const result = await Promise.all(
        sites.map(async s => {
            const activeCount = await Visit.countDocuments({
                site: s._id,
                timestamp: { $gte: activeSince }
            });
            return {
                site: s._id,
                totalVisitors: s.total,
                activeVisitors: activeCount,
                lastVisit: s.lastVisit
            };
        })
    );

    res.json(result);
});


app.listen(3000, () => console.log('✅ Serveur en ligne sur http://localhost:3000'));
