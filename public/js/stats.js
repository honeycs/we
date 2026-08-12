// --- 1. AUTH WATCH GUARD ---
async function checkAuth() {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        if (!data.authenticated) { window.location.href = '/login.html'; }
    } catch (err) { console.error("Auth routing block validation failure", err); }
}
checkAuth();

// --- 2. LEADERTBOARD TALLY LOGIC ---
async function fetchPlayerLeaderboard() {
    const tbody = document.getElementById('statsTableBody');
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        if (!data.success || !data.stats || data.stats.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="color: #ff5252;">Failed to load player engine metrics records. Ensure amx_top15 is accessible.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.stats.map(p => {
            const kills = parseInt(p.kills) || 0;
            const deaths = parseInt(p.deaths) || 1; // Protects against division by zero errors
            const kdRatio = (kills / deaths).toFixed(2);

            return `
                <tr>
                    <td><span class="rank-badge">#${escapeHtml(p.rank)}</span></td>
                    <td><b>${escapeHtml(p.name)}</b></td>
                    <td><code>${escapeHtml(p.steamid)}</code></td>
                    <td style="color: #4caf50; font-weight: 600;">${escapeHtml(p.kills)}</td>
                    <td style="color: #ff5252;">${escapeHtml(p.deaths)}</td>
                    <td style="color: #58a6ff;">${escapeHtml(p.headshots)}</td>
                    <td><b style="color: ${kdRatio >= 1 ? '#4caf50' : '#e2e8f0'}">${kdRatio}</b></td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Leaderboard scrape failure", err);
        tbody.innerHTML = `<tr><td colspan="7">Network communications break down when scraping metrics.</td></tr>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', fetchPlayerLeaderboard);
