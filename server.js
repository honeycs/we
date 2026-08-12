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

// UDP-configured Rcon execution wrapper for GoldSrc
function sendRconCommand(command) {
    return new Promise((resolve, reject) => {
        const client = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD, {
            tcp: false,
            challenge: false
        });
        let finished = false;

        const timer = setTimeout(() => {
            try { client.disconnect(); } catch(e) {}
            if (!finished) reject(new Error('UDP RCON Connection Timed Out'));
        }, 3000);

        client.on('auth', () => {
            client.send(command);
        });

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

        try {
            client.connect();
        } catch (err) {
            clearTimeout(timer);
            reject(err);
        }
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
    } else {
        res.status(401).json({ success: false, error: "Invalid credentials" });
    }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/check-auth', (req, res) => { res.json({ authenticated: !!(req.session && req.session.loggedIn) }); });

app.post('/api/command', isAuthenticated, async (req, res) => {
    try {
        const output = await sendRconCommand(req.body.command);
        res.json({ success: true, output });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/status', isAuthenticated, async (req, res) => {
    try {
        const statusOutput = await sendRconCommand('status');
        const lines = statusOutput.split('\n');
        const players = [];
        let hostname = "CS 1.6 Server";
        let map = "Unknown Map";

        lines.forEach(line => {
            // Fix map layout matching for classic GoldSrc string structures
            if (line.includes('hostname:')) {
                hostname = line.replace('hostname:', '').trim();
            }
            if (line.includes('map     :')) {
                // Extracts exactly the map name between 'map     :' and 'at:'
                const rawMap = line.split('map     :')[1];
                if (rawMap) map = rawMap.split('at:')[0].trim();
            }
            
            // GoldSource Engine regex pattern matching active players
            const playerMatch = line.match(/^\s*#\s*(\d+)\s+"(.+?)"\s+(\d+)\s+(STEAM_\d+:\d+:\d+|VALVE_\d+:\d+:\d+|BOT|HLTV)\s+/);
            if (playerMatch) {
                players.push({
                    userid: playerMatch[3],   // Fixed index allocation pointers
                    name: playerMatch[2],     // Extracts clean string payload
                    steamid: playerMatch[4]   // Protects against array passing
                });
            }
        });
        res.json({ success: true, online: true, hostname, map, players });
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
