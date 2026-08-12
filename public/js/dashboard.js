async function checkAuth() {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        if (!data.authenticated) { window.location.href = '/login.html'; }
    } catch (err) { console.error("Auth verification failed", err); }
}
checkAuth();

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (err) { console.error("Logout request failed", err); }
}

const consoleDiv = document.getElementById('console');
let mapsLoaded = false;
let lastKnownMap = "";

async function fetchServerStatus() {
    const statusBadge = document.getElementById('serverStatus');
    try {
        const res = await fetch('/api/status');
        if (res.status === 401) { window.location.href = '/login.html'; return; }
        const data = await res.json();
        
        // FIXED: Handles error output arrays cleanly without failing interface threads
        if (!data || !data.success || !data.online) {
            document.getElementById('serverName').innerText = "Server Offline / Handshake Failed";
            document.getElementById('currentMap').innerText = "-";
            document.getElementById('tScore').innerText = "0";
            document.getElementById('ctScore').innerText = "0";
            statusBadge.innerText = "OFFLINE";
            statusBadge.className = "status-badge offline";
            
            const errMsg = (data && data.error) ? data.error : "Connection Timeout";
            document.getElementById('playerTableBody').innerHTML = `<tr><td colspan="3" style="color: %23f44336;">Reason: ${escapeHtml(errMsg)}</td></tr>`;
            updateMapPreview("-");
            return;
        }

        document.getElementById('serverName').innerText = data.hostname;
        document.getElementById('currentMap').innerText = data.map;
        statusBadge.innerText = "ONLINE";
        statusBadge.className = "status-badge online";
        
        document.getElementById('tScore').innerText = data.score.t;
        document.getElementById('ctScore').innerText = data.score.ct;
        
        if (data.map !== lastKnownMap) {
            lastKnownMap = data.map;
            updateMapPreview(data.map);
        }

        updatePlayerTable(data.players);
        if (!mapsLoaded && data.availableMaps && data.availableMaps.length > 0) {
            populateMapDropdown(data.availableMaps);
        }
    } catch (err) {
        console.error("Dashboard Fetch Error Exception Context:", err);
        statusBadge.innerText = "OFFLINE";
        statusBadge.className = "status-badge offline";
        document.getElementById('serverName').innerText = "Panel API Endpoint Unreachable";
        document.getElementById('playerTableBody').innerHTML = `<tr><td colspan="3">Failed to talk to Web App Backend.</td></tr>`;
    }
}

function updateMapPreview(mapName) {
    const imgEl = document.getElementById('mapPreviewImg');
    if (!imgEl) return;

    if (!mapName || mapName === "-" || mapName === "Unknown Map") {
        imgEl.src = "data:image/svg+xml;utf8,<svg xmlns='http://w3.org' width='100' height='70' viewBox='0 0 100 70'><rect width='100' height='70' fill='%230d1117'/><circle cx='50' cy='35' r='10' stroke='%232d3748' stroke-width='2' fill='none'/></svg>";
        return;
    }

    const cleanMap = String(mapName).trim().toLowerCase();
    imgEl.src = `https://githubusercontent.com{cleanMap}.jpg`;

    imgEl.onerror = () => {
        imgEl.onerror = null; 
        imgEl.src = "data:image/svg+xml;utf8,<svg xmlns='http://w3.org' width='100' height='70' viewBox='0 0 100 70'><rect width='100' height='70' fill='%231a1f2c'/><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%234a5568' font-size='11' font-family='sans-serif'>CUSTOM MAP</text></svg>";
    };
}

function populateMapDropdown(maps) {
    const select = document.getElementById('mapDropdown');
    if (!select) return;
    select.innerHTML = maps.map(map => `<option value="${escapeHtml(map)}">${escapeHtml(map)}</option>`).join('');
    mapsLoaded = true;
}

function updatePlayerTable(players) {
    const tbody = document.getElementById('playerTableBody');
    if (!tbody) return;
    
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
    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const data = await res.json();
        consoleDiv.innerHTML += `${data.output || data.error || 'Done.'}\n\n`;
    } catch (err) { consoleDiv.innerHTML += `Connection Error: ${err.message}\n\n`; }
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function sendCustomCommand() {
    const input = document.getElementById('customCmd');
    if (!input || !input.value.trim()) return;
    sendCommand(input.value);
    input.value = '';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('softRebootBtn').addEventListener('click', () => {
        if(confirm("Sending 'quit' tells LGSM to auto-reboot the engine. Proceed?")) sendCommand('quit');
    });

    document.getElementById('executeCmdBtn').addEventListener('click', sendCustomCommand);
    document.getElementById('customCmd').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendCustomCommand(); });

    document.getElementById('changeMapBtn').addEventListener('click', () => {
        const select = document.getElementById('mapDropdown');
        if (select && select.value) sendCommand(`changelevel ${select.value}`);
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
            if (sid === "BOT" || sid.includes("HLTV")) return alert("Cannot ban system entities.");
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
