// --- 1. AUTH CHECK & LOGOUT GUARD ---
async function checkAuth() {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        if (!data.authenticated) {
            window.location.href = '/login.html';
        }
    } catch (err) {
        console.error("Auth verification failed", err);
    }
}
checkAuth();

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (err) {
        console.error("Logout request failed", err);
    }
}

// --- 2. DASHBOARD FUNCTIONS ---
const consoleDiv = document.getElementById('console');
let mapsLoaded = false; // Prevents select box options from flashing/re-rendering every 5 seconds

async function fetchServerStatus() {
    const statusBadge = document.getElementById('serverStatus');
    try {
        const res = await fetch('/api/status');
        
        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await res.json();
        
        if (!data.success || !data.online) {
            document.getElementById('serverName').innerText = data.error || "Server Unreachable";
            document.getElementById('currentMap').innerText = "-";
            statusBadge.innerText = "OFFLINE";
            statusBadge.className = "status-badge offline";
            document.getElementById('playerTableBody').innerHTML = `<tr><td colspan="3">${data.error || 'Connection Failed'}</td></tr>`;
            return;
        }

        document.getElementById('serverName').innerText = data.hostname;
        document.getElementById('currentMap').innerText = data.map;
        statusBadge.innerText = "ONLINE";
        statusBadge.className = "status-badge online";
        
        updatePlayerTable(data.players);
        
        // Dynamically populates dropdown based on live parsed maps.ini list from server payload
        if (!mapsLoaded && data.availableMaps && data.availableMaps.length > 0) {
            populateMapDropdown(data.availableMaps);
        }

    } catch (err) {
        console.error("Frontend Fetch Error:", err);
        statusBadge.innerText = "OFFLINE";
        statusBadge.className = "status-badge offline";
        document.getElementById('serverName').innerText = "API Connection Lost";
        document.getElementById('playerTableBody').innerHTML = `<tr><td colspan="3">Failed to communicate with Web Backend.</td></tr>`;
    }
}

function populateMapDropdown(maps) {
    const select = document.getElementById('mapDropdown');
    select.innerHTML = maps.map(map => `<option value="${escapeHtml(map)}">${escapeHtml(map)}</option>`).join('');
    mapsLoaded = true;
}

function updatePlayerTable(players) {
    const tbody = document.getElementById('playerTableBody');
    if (!players || players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Server is empty.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    players.forEach(p => {
        const row = document.createElement('tr');
        const nameStr = escapeHtml(p.name);
        const steamStr = escapeHtml(p.steamid);
        const userStr = escapeHtml(p.userid);

        row.innerHTML = `
            <td><b>${nameStr}</b></td>
            <td><code>${steamStr}</code></td>
            <td>
                <button class="kick-player-btn" data-userid="${userStr}" data-name="${nameStr}">Kick</button>
                <button class="danger ban-player-btn" data-steamid="${steamStr}" data-name="${nameStr}">Ban</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function sendCommand(command) {
    consoleDiv.innerHTML += `> ${command}\n`;
    consoleDiv.scrollTop = consoleDiv.scrollHeight;

    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const data = await res.json();
        consoleDiv.innerHTML += `${data.output || data.error || 'Done.'}\n\n`;
    } catch (err) {
        consoleDiv.innerHTML += `Connection Error: ${err.message}\n\n`;
    }
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function sendCustomCommand() {
    const input = document.getElementById('customCmd');
    if (!input.value.trim()) return;
    sendCommand(input.value);
    input.value = '';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- 3. EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('softRebootBtn').addEventListener('click', () => {
        if(confirm("Sending 'quit' tells LGSM to auto-reboot the binary. Proceed?")) sendCommand('quit');
    });

    document.getElementById('executeCmdBtn').addEventListener('click', sendCustomCommand);
    document.getElementById('customCmd').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') sendCustomCommand();
    });

    // Execute the level load command target from dropdown value selection
    document.getElementById('changeMapBtn').addEventListener('click', () => {
        const select = document.getElementById('mapDropdown');
        if (select.value) {
            sendCommand(`changelevel ${select.value}`);
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('rcon-action-btn')) {
            const cmd = e.target.getAttribute('data-cmd');
            if (cmd) sendCommand(cmd);
        }

        if (e.target && e.target.classList.contains('kick-player-btn')) {
            const uid = e.target.getAttribute('data-userid');
            const name = e.target.getAttribute('data-name');
            if (confirm(`Are you sure you want to kick ${name}?`)) {
                sendCommand(`kick #${uid}`);
                setTimeout(fetchServerStatus, 1000);
            }
        }

        if (e.target && e.target.classList.contains('ban-player-btn')) {
            const sid = e.target.getAttribute('data-steamid');
            const name = e.target.getAttribute('data-name');
            if (sid === "BOT" || sid.includes("HLTV")) {
                alert("You cannot ban bots or HLTV proxies.");
                return;
            }
            if (confirm(`Permanently ban ${name}?`)) {
                sendCommand(`banid 0 ${sid} kick`);
                sendCommand(`writeid`);
                setTimeout(fetchServerStatus, 1000);
            }
        }
    });

    fetchServerStatus();
    setInterval(fetchServerStatus, 5000);
});
