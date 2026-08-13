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

async function fetchServerStatus() {
    const statusBadge = document.getElementById('serverStatus');
    try {
        const res = await fetch('/api/status');
        if (res.status === 401) { window.location.href = '/login.html'; return; }
        const data = await res.json();
        
        if (!data || !data.success || !data.online) {
            document.getElementById('serverName').innerText = "Server Offline / Handshake Failed";
            document.getElementById('currentMap').innerText = "-";
            document.getElementById('tScore').innerText = "0";
            document.getElementById('ctScore').innerText = "0";
            statusBadge.innerText = "OFFLINE";
            statusBadge.className = "status-badge offline";
            
            const errMsg = (data && data.error) ? data.error : "Connection Timeout";
            document.getElementById('playerTableBody').innerHTML = `<tr><td colspan="3" style="color: #f44336;">Reason: ${escapeHtml(errMsg)}</td></tr>`;
            return;
        }

        document.getElementById('serverName').innerText = data.hostname;
        document.getElementById('currentMap').innerText = data.map;
        statusBadge.innerText = "ONLINE";
        statusBadge.className = "status-badge online";
        
        document.getElementById('tScore').innerText = data.score.t;
        document.getElementById('ctScore').innerText = data.score.ct;

        updatePlayerTable(data.players);
        if (!mapsLoaded && data.availableMaps && data.availableMaps.length > 0) {
            populateMapDropdown(data.availableMaps);
        }
    } catch (err) {
        statusBadge.innerText = "OFFLINE";
        statusBadge.className = "status-badge offline";
        document.getElementById('serverName').innerText = "Panel API Endpoint Unreachable";
        document.getElementById('playerTableBody').innerHTML = `<tr><td colspan="3">Failed to talk to Web App Backend.</td></tr>`;
    }
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

// Fixed escaping parameters mapping
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

    // Action listener for password submission trigger box
document.getElementById('submitPassBtn').addEventListener('click', submitNewPassword);
document.getElementById('serverPassInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') submitNewPassword(); });

    // Listeners for the Unban Form Component
    const submitUnbanBtn = document.getElementById('submitUnbanBtn');
    const unbanTargetInput = document.getElementById('unbanTargetInput');
    if (submitUnbanBtn) submitUnbanBtn.addEventListener('click', submitUnbanRequest);
    if (unbanTargetInput) unbanTargetInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitUnbanRequest(); });

    
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

// 🟢 PASTE THE FUNCTION OUTSIDE THE LOOPS AT THE VERY BOTTOM OF DASHBOARD.JS:
    async function submitNewPassword() {
        const configSelect = document.getElementById('configPassDropdown');
        const input = document.getElementById('serverPassInput');
        
        const targetConfig = configSelect.value;
        const pass = input.value.trim();
        
        if (!pass) return alert("Password entry cannot be blank.");

        consoleDiv.innerHTML += `> Deploying password update payload to [${targetConfig}]...\n`;
        try {
            const res = await fetch('/api/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetConfig: targetConfig, newPassword: pass })
            });
            const data = await res.json();
            consoleDiv.innerHTML += `${data.message || data.error}\n\n`;
            if(data.success) input.value = '';
        } catch (err) {
            consoleDiv.innerHTML += `Password Patch Error: ${err.message}\n\n`;
        }
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

// Standalone handler to process unban queries down to the backend API routing layer
async function submitUnbanRequest() {
    const typeSelect = document.getElementById('unbanTypeDropdown');
    const input = document.getElementById('unbanTargetInput');
    const consoleDiv = document.getElementById('console');
    
    const unbanType = typeSelect.value;
    const targetValue = input.value.trim();
    
    if (!targetValue) return alert("Please specify a target identifier to unban.");

    consoleDiv.innerHTML += `> Sending unban directive for ${unbanType}: [${targetValue}]...\n`;
    consoleDiv.scrollTop = consoleDiv.scrollHeight;

    try {
        const res = await fetch('/api/unban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: unbanType, target: targetValue })
        });
        const data = await res.json();
        consoleDiv.innerHTML += `${data.message || data.error}\n\n`;
        if (data.success) input.value = '';
    } catch (err) {
        consoleDiv.innerHTML += `Unban Transaction Error: ${err.message}\n\n`;
    }
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}
