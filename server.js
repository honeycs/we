const express = require('express');
const session = require('express-session');
const { Rcon } = require('rcon-client');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration (Use environment variables on your hosting provider)
const RCON_HOST = process.env.RCON_HOST || 'YOUR_SERVER_IP';
const RCON_PORT = parseInt(process.env.RCON_PORT || '27015');
const RCON_PASSWORD = process.env.RCON_PASSWORD || 'YOUR_RCON_PASSWORD';

// UI Web Panel Credentials
const PANEL_USERNAME = process.env.PANEL_USERNAME || 'admin';
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'ChangeMe123!'; 
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-key-change-this';

// Setup Session Middleware
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 Hours Session
}));

// RCON Helper Function
async function sendRconCommand(command) {
    const rcon = new Rcon({ host: RCON_HOST, port: RCON_PORT, password: RCON_PASSWORD });
    await rcon.connect();
    const response = await rcon.send(command);
    await rcon.end();
    return response;
}

// Authentication Middleware to protect routes
function isAuthenticated(req, res, next) {
    if (req.session && req.session.loggedIn) {
        return next();
    }
    res.status(401).json({ success: false, error: "Unauthorized. Please log in." });
}

// --- AUTHENTICATION ROUTES ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === PANEL_USERNAME && password === PANEL_PASSWORD) {
        req.session.loggedIn = true;
        res.json({ success: true, message: "Logged in successfully" });
    } else {
        res.status(401).json({ success: false, error: "Invalid username or password" });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Check if user is logged in (for frontend routing)
app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.loggedIn) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// --- PROTECTED APIS ---
app.post('/api/command', isAuthenticated, async (req, res) => {
    const { command } = req.body;
    try {
        const output = await sendRconCommand(command);
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
        let hostname = "Unknown Server";
        let map = "Unknown Map";

        lines.forEach(line => {
            if (line.startsWith('hostname:')) hostname = line.replace('hostname:', '').trim();
            if (line.startsWith('map     :')) map = line.substring(9, line.indexOf('at:')).trim();
            
            const playerMatch = line.match(/^\s*#\s*(\d+)\s+"(.+?)"\s+(\d+)\s+(STEAM_\d+:\d+:\d+|VALVE_\d+:\d+:\d+|BOT|HLTV)\s+/);
            if (playerMatch) {
                players.push({
                    index: playerMatch[1],
                    name: playerMatch[2],
                    userid: playerMatch[3],
                    steamid: playerMatch[4]
                });
            }
        });
        res.json({ success: true, online: true, hostname, map, players });
    } catch (error) {
        res.json({ success: true, online: false, error: "Server is offline." });
    }
});

// --- STATIC FILES AND DASHBOARD SERVICE ---
// Serve login page to anyone
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Protect the core index.html dashboard file from unauthenticated users
app.get('/', (req, res) => {
    if (req.session && req.session.loggedIn) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Serve rest of public folder files safely
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Panel Web UI active on port ${PORT}`));
