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

// Environment variable map list override
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
        }, 4000);

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
        const statusOutput = await sendRconCommand('status');
        const lines = statusOutput.split('\n');
        const players = [];
        let hostname = "CS 1.6 Server";
        let map = "Unknown Map";

        lines.forEach(line => {
            if (line.includes('hostname:')) {
                hostname = line.replace('hostname:', '').trim();
            }
            
            // FIXED: Added array index targeting to fix split error
            if (line.includes('map     :')) {
                const mapParts = line.split('map     :');
                if (mapParts.length > 1) {
                    const atParts = mapParts[1].split('at:');
                    map = atParts[0].trim();
                }
            }
            
            // FIXED: Specified array indices explicitly to isolate structural variables
            const playerMatch = line.match(/^\s*#\s*(\d+)\s+"(.+?)"\s+(\d+)\s+(STEAM_\d+:\d+:\d+|VALVE_\d+:\d+:\d+|BOT|HLTV)\s+/);
            if (playerMatch) {
                players.push({ 
                    userid: playerMatch[3], 
                    name: playerMatch[2], 
                    steamid: playerMatch[4] 
                });
            }
        });

        let availableMaps = [];
        if (MAPS_INI_LIST.trim() !== '') {
            availableMaps = MAPS_INI_LIST.split(',').map(m => m.trim()).filter(Boolean);
        } else {
            availableMaps = ["de_dust2", "de_inferno", "de_nuke", "de_train", "cs_italy"];
        }

        res.json({ success: true, online: true, hostname, map, players, availableMaps });
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
