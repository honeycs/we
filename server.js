const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const Rcon = require('node-rcon'); // Swapped to node-rcon for UDP
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

// Safe UDP RCON Execution Wrapper
function sendRconCommand(command) {
    return new Promise((resolve, reject) => {
        // Instantiate modern GoldSrc UDP protocol instance
        const rcon = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);
        let executed = false;

        // Force a safety timeout window so web threads never hang
        const timer = setTimeout(() => {
            rcon.disconnect();
            if (!executed) reject(new Error('UDP RCON Query Timed Out'));
        }, 3000);

        rcon.on('auth', () => {
            rcon.send(command);
        });

        rcon.on('response', (str) => {
            executed = true;
            clearTimeout(timer);
            rcon.disconnect();
            resolve(str || "Done.");
        });

        rcon.on('error', (err) => {
            executed = true;
            clearTimeout(timer);
            rcon.disconnect();
            reject(err);
        });

        rcon.connect();
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
            if (line.startsWith('hostname:')) hostname = line.replace('hostname:', '').trim();
            if (line.startsWith('map     :')) map = line.substring(9, line.indexOf('at:')).trim();
            const playerMatch = line.match(/^\s*#\s*(\d+)\s+"(.+?)"\s+(\d+)\s+(STEAM_\d+:\d+:\d+|VALVE_\d+:\d+:\d+|BOT|HLTV)\s+/);
            if (playerMatch) {
                players.push({
                    userid: playerMatch[1],
                    name: playerMatch[2],
                    steamid: playerMatch[4]
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
app.listen(PORT, () => console.log(`UDP Engine panel running on port ${PORT}`));
