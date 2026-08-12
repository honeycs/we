const express = require('express');
const session = require('express-session');
const { Rcon } = require('rcon-client');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURATION ---
// These variables should be securely configured in your Render/Koyeb environment settings
const RCON_HOST = process.env.RCON_HOST || 'YOUR_SERVER_IP';
const RCON_PORT = parseInt(process.env.RCON_PORT || '27015');
const RCON_PASSWORD = process.env.RCON_PASSWORD || 'YOUR_RCON_PASSWORD';

// Panel Access Credentials
const PANEL_USERNAME = process.env.PANEL_USERNAME || 'admin';
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'ChangeMe123!'; 
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-key-change-this';

// --- SESSION MIDDLEWARE ---
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 Hours Session
        secure: false // Set to true if your panel runs on HTTPS
    }
}));

// --- HELPER FUNCTIONS ---
// Base RCON connection handler
async function sendRconCommand(command) {
    const rcon = new Rcon({ host: RCON_HOST, port: RCON_PORT, password: RCON_PASSWORD });
    await rcon.connect();
    const response = await rcon.send(command);
    await rcon.end();
    return response;
}

// Timeout wrapper to prevent the Web UI from hanging indefinitely if the game server is dead
function withTimeout(promise, ms = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('RCON Connection Timeout')), ms))
    ]);
}

// Security Middleware to block unauthenticated API requests
function isAuthenticated(req, res, next) {
    if (req.session && req.session.loggedIn) {
        return next();
    }
    res.status(401).json({ success: false, error: "Unauthorized. Please log in." });
}

// --- AUTHENTICATION API ENDPOINTS ---
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

app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.loggedIn) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// --- PROTECTED GAME SERVER APIs ---

// Endpoint to send custom or fast-toggle RCON commands
app.post('/api/command', isAuthenticated, async (req, res) => {
    const { command } = req.body;
    try {
        const output = await withTimeout(sendRconCommand(command), 5000);
        res.json({ success: true, output });
    } catch (error) {
        console.error(`RCON Command [${command}] Failed:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to scrape server telemetry and player list data
app.get('/api/status', isAuthenticated, async (req, res) => {
    try {
        // Fetch status with a strict 5-second failure window
        const statusOutput = await withTimeout(sendRconCommand('status'), 5000);
        const lines = statusOutput.split('\n');
        const players = [];
        let hostname = "Unknown Server";
        let map = "Unknown Map";

        lines.forEach(line => {
            if (line.startsWith('hostname:')) hostname = line.replace('hostname:', '').trim();
            if (line.startsWith('map     :')) map = line.substring(9, line.indexOf('at:')).trim();
            
            // GoldSource Engine regex pattern matching active players
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
        // Prints the specific connection error directly to your cloud host runtime terminal logs
        console.error("Status Scrape Failed. Error Context:", error.message);
        res.json({ success: true, online: false, error: error.message });
    }
});

// --- FILE ROUTING MANAGEMENT ---

// Unprotected access route for login assets
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route firewall to lock the index.html dashboard file away from non-logged users
app.get('/', (req, res) => {
    if (req.session && req.session.loggedIn) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Default assets folder fallback mapping 
app.use(express.static(path.join(__dirname, 'public')));

// --- INITIALIZE APPLICATION ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Panel Web UI active on port ${PORT}`));
