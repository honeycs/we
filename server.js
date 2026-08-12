const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const Rcon = require('rcon'); 
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const RCON_HOST = process.env.RCON_HOST || 'YOUR_SERVER_IP';
const RCON_PORT = parseInt(process.env.RCON_PORT || '27015');
const RCON_PASSWORD = process.env.RCON_PASSWORD || 'YOUR_RCON_PASSWORD';
const MAPS_INI_LIST = process.env.MAPS_INI_LIST || '';

const PANEL_USERNAME = process.env.PANEL_USERNAME || 'admin';
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'ChangeMe123!'; 
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-key-change-this';

app.use(session({
    store: new FileStore({ path: './sessions', ttl: 86400, retries: 0 }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, secure: false }
}));

function sendRconCommand(command) {
    return new Promise((resolve, reject) => {
        const client = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD, {
            tcp: false,
            challenge: true 
        });
        let finished = false;

        const timer = setTimeout(() => {
            try { client.disconnect(); } catch(e) {}
            if (!finished) reject(new Error('UDP RCON Handshake Timed Out'));
        }, 3500);

        client.on('auth', () => { client.send(command); });
        client.on('response', (str) => {
            finished = true;
            clearTimeout(timer);
            try { client.disconnect(); } catch(e) {}
            resolve(str || "Done.");
        });
        client.on('error', (err) => {
            finished = true;
            clearTimeout(timer);
            try { client.disconnect(); } catch(e) {}
            reject(err);
        });

        try { client.connect(); } catch (err) { clearTimeout(timer); reject(err); }
    });
}

function isAuthenticated(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.status(401).json({ success: false, error: "Unauthorized" });
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === PANEL_USERNAME && password === PANEL_PASSWORD) {
        req.session.loggedIn = true;
        res.json({ success: true });
    } else { res.status(401).json({ success: false, error: "Invalid credentials" }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/check-auth', (req, res) => { res.json({ authenticated: !!(req.session && req.session.loggedIn) }); });

app.post('/api/command', isAuthenticated, async (req, res) => {
    try {
        const output = await sendRconCommand(req.body.command);
        res.json({ success: true, output });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/status', isAuthenticated, async (req, res) => {
    try {
        // Query both endpoints concurrently to avoid double-handshake stalls
        const [statusResult, matchResult] = await Promise.allSettled([
            sendRconCommand('status'),
            sendRconCommand('amx_match_status')
        ]);

        if (statusResult.status === 'rejected') {
            throw new Error(statusResult.reason.message);
        }

        const statusOutput = statusResult.value;
        const matchOutput = matchResult.status === 'fulfilled' ? matchResult.value : "";

        const lines = statusOutput.split('\n');
        const players = [];
        let hostname = "CS 1.6 Server";
        let map = "Unknown Map";

        lines.forEach(line => {
            if (line.includes('hostname:')) {
                hostname = line.replace('hostname:', '').trim();
            }
            
            // FIXED FIXED FIXED: Target index [1] of the split array string before running the secondary split!
            if (line.includes('map     :')) {
                const mapParts = line.split('map     :');
                if (mapParts && mapParts.length > 1) {
                    const atParts = mapParts[1].split('at:');
                    if (atParts && atParts.length > 0) {
                        map = atParts[0].trim();
                    }
                }
            }
            
            const playerMatch = line.match(/^\s*#\s*(\d+)\s+"(.+?)"\s+(\d+)\s+(STEAM_\d+:\d+:\d+|VALVE_\d+:\d+:\d+|BOT|HLTV)\s+/);
            if (playerMatch && playerMatch.length >= 5) {
                players.push({ 
                    userid: playerMatch[1], 
                    name: playerMatch[2], 
                    steamid: playerMatch[4] 
                });
            }
        });

        let score = { t: 0, ct: 0 };
        if (matchOutput) {
            const tMatch = matchOutput.match(/Terrorists:\s*(\d+)/i);
            const ctMatch = matchOutput.match(/Counter-Terrorists:\s*(\d+)/i);
            if (tMatch && tMatch.length > 1) score.t = parseInt(tMatch[1]);
            if (ctMatch && ctMatch.length > 1) score.ct = parseInt(ctMatch[1]);
        }

        let availableMaps = [];
        if (MAPS_INI_LIST.trim() !== '') {
            availableMaps = MAPS_INI_LIST.split(',').map(m => m.trim()).filter(Boolean);
        } else {
            availableMaps = ["de_dust2", "de_inferno", "de_nuke", "de_train", "cs_italy"];
        }

        res.json({ success: true, online: true, hostname, map, players, availableMaps, score });
    } catch (error) {
        res.json({ success: true, online: false, error: error.message });
    }
});

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/', (req, res) => {
    if (req.session && req.session.loggedIn) res.sendFile(path.join(__dirname, 'public', 'index.html'));
    else res.redirect('/login.html');
});
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UDP Rcon panel running on port ${PORT}`));
