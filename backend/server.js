const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');
const si = require('systeminformation');
const wifi = require('node-wifi');

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = 'aidash_session';
const CONFIG_PATH = path.join(__dirname, '../config/default.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const LOG_PATH = path.join(__dirname, '../server.log');
const ROOT_DIR = path.resolve(__dirname, '..');

wifi.init({ iface: null });

function getConfig() {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { modules: { alerts: true, ai: true, logs: true, disk: true, files: true } };
}

const WHITELIST_DEFAULT = ['ls', 'df -h', 'uptime', 'free -m', 'du -sh', 'ps aux', 'tail -n 100', 'git pull', 'npm install', 'whoami', 'last', 'nproc', 'lsblk', 'ls -lah'];

let alerts = [];
let sysMetrics = { 
    temp: 'N/A', 
    userList: 'None', 
    totalSessions: 0, 
    ports: 0, 
    cpuCores: [],
    battery: 'N/A',
    wifi: 'None',
    date: ''
};

// Historical data for graphs
let history = { cpu: [], mem: [], labels: [] };

async function updateMetrics() {
    sysMetrics.date = new Date().toLocaleString();
    const platform = os.platform();
    
    try {
        const [cpu, mem, temp, battery, users] = await Promise.all([
            si.currentLoad().catch(() => ({ cpus: [] })),
            si.mem().catch(() => ({})),
            si.cpuTemperature().catch(() => ({})),
            si.battery().catch(() => ({ hasBattery: false })),
            si.users().catch(() => [])
        ]);

        sysMetrics.cpuCores = cpu.cpus.map(c => c.load.toFixed(1));
        const currentLoad = cpu.currentLoad || 0;
        const memUsed = ((mem.active || 0) / (mem.total || 1)) * 100;

        // Update history (max 20 points)
        history.labels.push(new Date().toLocaleTimeString());
        history.cpu.push(currentLoad.toFixed(1));
        history.mem.push(memUsed.toFixed(1));
        if (history.labels.length > 20) {
            history.labels.shift();
            history.cpu.shift();
            history.mem.shift();
        }
        
        if (temp.main > 0) sysMetrics.temp = `${temp.main.toFixed(1)}°C`;
        else if (temp.max > 0) sysMetrics.temp = `${temp.max.toFixed(1)}°C`;
        else sysMetrics.temp = 'N/A';

        if (battery.hasBattery) {
            sysMetrics.battery = `${battery.percent}% ${battery.isCharging ? '(Charging)' : ''}`;
        } else sysMetrics.battery = 'N/A';

        const uniqueUsers = [...new Set(users.map(u => u.user))];
        sysMetrics.userList = uniqueUsers.join(', ') || 'None';
        sysMetrics.totalSessions = users.length;

        if (platform === 'darwin') {
            exec("networksetup -getairportnetwork en0", (err, stdout) => {
                if (!err && stdout.includes(': ')) sysMetrics.wifi = stdout.split(': ')[1].trim();
                else sysMetrics.wifi = 'None';
            });
        } else if (platform === 'linux') {
            // Aggressive WiFi check: try node-wifi first as it's the dedicated lib, then fallback
            wifi.getCurrentConnections((err, conn) => {
                if (!err && conn && conn.length > 0) {
                    sysMetrics.wifi = conn[0].ssid || 'None';
                } else {
                    exec("iwgetid -r || nmcli -t -f active,ssid dev wifi | grep '^yes' | cut -d: -f2", (err2, stdout) => {
                        if (!err2 && stdout.trim()) sysMetrics.wifi = stdout.trim();
                        else sysMetrics.wifi = 'None';
                    });
                }
            });
        }

        si.networkConnections().then(conns => {
            sysMetrics.ports = conns.filter(c => c.state === 'LISTEN' && c.protocol === 'tcp').length;
        }).catch(() => {});

    } catch (e) {
        console.error("Metric collection error:", e.message);
    }
}
setInterval(updateMetrics, 5000);
updateMetrics();

function evaluateAlerts() {
    const config = getConfig();
    if (config.modules && !config.modules.alerts) { alerts = []; return; }
    
    const newAlerts = [];
    const memUsage = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
    if (memUsage > 90) newAlerts.push({ type: 'Memory', message: `Critical: ${memUsage.toFixed(1)}%`, severity: 'danger' });
    const load = os.loadavg()[0];
    if (load > os.cpus().length * 0.9) newAlerts.push({ type: 'Load', message: `High: ${load.toFixed(2)}`, severity: 'danger' });
    alerts = newAlerts;
}
setInterval(evaluateAlerts, 30000);
evaluateAlerts();

function safePath(p) {
    const resolved = path.resolve(ROOT_DIR, p || '.');
    // Allow access to /host explicitly for host filesystem power
    if (!resolved.startsWith(ROOT_DIR) && !resolved.startsWith('/host')) throw new Error('Access Denied');
    return resolved;
}

const server = http.createServer((req, res) => {
    const { method, url } = req;
    const config = getConfig();
    const parsedUrl = new URL(url, `http://${req.headers.host}`);

    if (url === '/' && method === 'GET') {
        serveFile(res, path.join(__dirname, '../frontend/index.html'), 'text/html');
    } else if (url === '/api/login' && method === 'POST') {
        handleLogin(req, res);
    } else if (url === '/api/user/password' && method === 'POST') {
        handlePasswordChange(req, res);
    } else if (url === '/api/history' && method === 'GET') {
        handleJson(res, history);
    } else if (url === '/api/stats' && method === 'GET') {
        handleStats(res);
    } else if (url === '/api/services' && method === 'GET') {
        handleServices(res);
    } else if (url === '/api/config-services' && method === 'GET') {
        handleJson(res, config.services || []);
    } else if (url === '/api/alerts' && method === 'GET') {
        handleJson(res, alerts);
    } else if (url === '/api/disk' && method === 'GET') {
        if (config.modules.disk) handleDisk(res); else handleJson(res, { main: { usage: '0%' }, topDirs: [] });
    } else if (url === '/api/logs' && method === 'GET') {
        if (config.modules.logs) handleLogs(res); else res.end('Logs module disabled.');
    } else if (url === '/api/command' && method === 'POST') {
        handleCommand(req, res);
    } else if (url === '/api/ai/ask' && method === 'POST') {
        if (config.modules.ai) handleAiAsk(req, res); else handleJson(res, { text: 'AI module disabled.' });
    } else if (url === '/api/deploy' && method === 'POST') {
        handleDeploy(req, res);
    } else if (url.startsWith('/api/files/list') && method === 'GET') {
        if (config.modules.files) handleFileList(parsedUrl, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/read') && method === 'GET') {
        if (config.modules.files) handleFileRead(parsedUrl, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/write') && method === 'POST') {
        if (config.modules.files) handleFileWrite(req, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/delete') && method === 'POST') {
        if (config.modules.files) handleFileDelete(req, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/rename') && method === 'POST') {
        if (config.modules.files) handleFileRename(req, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/search') && method === 'GET') {
        if (config.modules.files) handleFileSearch(parsedUrl, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/download') && method === 'GET') {
        if (config.modules.files) handleFileDownload(parsedUrl, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/upload') && method === 'POST') {
        if (config.modules.files) handleFileUpload(req, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url === '/api/wifi/scan' && method === 'GET') {
        handleWifiScan(res);
    } else if (url === '/api/wifi/connect' && method === 'POST') {
        handleWifiConnect(req, res);
    } else if (url === '/api/modules' && method === 'GET') {
        handleJson(res, config.modules || {});
    } else {
        res.writeHead(404); res.end('Not Found');
    }
});

function serveFile(res, filePath, contentType) {
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
}

function handleJson(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function handleLogin(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            if (!body) throw new Error('Empty body');
            const { username, password } = JSON.parse(body);
            const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
            const user = users.find(u => u.username === username);
            const hashed = crypto.createHash('sha256').update(password || '').digest('hex');
            if (user && user.password === hashed) {
                res.writeHead(200, { 'Set-Cookie': `${SESSION_TOKEN}=admin; HttpOnly; Path=/`, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, role: user.role }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
            }
        } catch (e) { 
            res.writeHead(400, { 'Content-Type': 'application/json' }); 
            res.end(JSON.stringify({ success: false, message: 'Bad Request' })); 
        }
    });
}

function handlePasswordChange(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { username, oldPassword, newPassword } = JSON.parse(body);
            const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
            const userIdx = users.findIndex(u => u.username === username);
            const hashedOld = crypto.createHash('sha256').update(oldPassword || '').digest('hex');
            
            if (userIdx !== -1 && users[userIdx].password === hashedOld) {
                users[userIdx].password = crypto.createHash('sha256').update(newPassword || '').digest('hex');
                fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
                handleJson(res, { success: true });
            } else {
                res.writeHead(401); res.end(JSON.stringify({ success: false, message: 'Invalid current password' }));
            }
        } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false, message: 'Request Error' })); }
    });
}

function handleStats(res) {
    handleJson(res, { 
        uptime: os.uptime(), 
        totalMem: os.totalmem(), 
        freeMem: os.freemem(), 
        load: os.loadavg(), 
        cpus: os.cpus().length,
        os: { platform: os.platform(), release: os.release(), arch: os.arch(), hostname: os.hostname() },
        metrics: sysMetrics
    });
}

function handleServices(res) {
    exec('ps aux | grep node | grep -v grep', (err, stdout) => {
        const lines = (stdout || '').trim().split('\n').filter(l => l.length > 0);
        handleJson(res, lines.map(l => {
            const p = l.replace(/\s+/g, ' ').split(' ');
            return { name: `Proc ${p[1]}`, pid: p[1], cpu: p[2], mem: p[3], cmd: p.slice(10).join(' ') };
        }));
    });
}

function handleDisk(res) {
    exec('df -h /', (err, stdout) => {
        const lines = (stdout || '').trim().split('\n');
        if (lines.length < 2) { handleJson(res, { main: { usage: '0%' }, topDirs: [] }); return; }
        const p = lines[1].replace(/\s+/g, ' ').split(' ');
        const mainDisk = { path: '/', size: p[1], used: p[2], avail: p[3], usage: p[4] };
        exec('du -sh * 2>/dev/null | sort -rh | head -n 5', (err2, stdout2) => {
            const dirs = (stdout2 || '').trim().split('\n').map(l => {
                const parts = l.split('\t');
                return { name: parts[1], size: parts[0] };
            });
            handleJson(res, { main: mainDisk, topDirs: dirs });
        });
    });
}

function handleLogs(res) {
    if (fs.existsSync(LOG_PATH)) {
        const logs = fs.readFileSync(LOG_PATH, 'utf8').split('\n').slice(-100).join('\n');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(logs);
    } else { res.writeHead(200); res.end('No logs.'); }
}

function handleCommand(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { command } = JSON.parse(body);
            const config = getConfig();
            const whitelist = config.whitelist || WHITELIST_DEFAULT;
            if (!whitelist.some(w => command.startsWith(w))) { res.writeHead(403); res.end('Forbidden'); return; }
            exec(command, (err, stdout, stderr) => { handleJson(res, { output: stdout || stderr }); });
        } catch (e) { 
            res.writeHead(400, { 'Content-Type': 'application/json' }); 
            res.end(JSON.stringify({ success: false, message: 'Bad Request' })); 
        }
    });
}

function handleDeploy(req, res) {
    exec('git pull && npm install', (err, stdout, stderr) => {
        handleJson(res, { output: stdout || stderr, success: !err });
    });
}

function handleAiAsk(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { prompt, contextFile } = JSON.parse(body);
            const stats = {
                uptime: os.uptime(),
                load: os.loadavg(),
                mem: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
            };
            
            let response = { text: "I'm currently in offline mode. Ask me about CPU load, memory, or disk space.", suggestion: null };

            const p = prompt.toLowerCase();
            if (p.includes('load') || p.includes('cpu')) {
                response.text = `CPU load is ${stats.load[0].toFixed(2)}. ${stats.load[0] > 1.0 ? "It's a bit high." : "Looking good!"}`;
                response.suggestion = "ps aux";
            } else if (p.includes('mem') || p.includes('ram')) {
                response.text = `RAM usage is at ${stats.mem.toFixed(1)}%.`;
                response.suggestion = "free -m";
            } else if (p.includes('disk') || p.includes('space')) {
                response.text = "You should check your disk partitions.";
                response.suggestion = "df -h";
            } else if (p.includes('who are you')) {
                response.text = "I am the AiDash Assistant (Offline Mode).";
            }

            handleJson(res, response);
        } catch (e) { 
            res.writeHead(400, { 'Content-Type': 'application/json' }); 
            res.end(JSON.stringify({ success: false, message: 'Bad Request' })); 
        }
    });
}

function handleFileList(parsedUrl, res) {
    try {
        const dir = safePath(parsedUrl.searchParams.get('path'));
        const items = fs.readdirSync(dir, { withFileTypes: true });
        handleJson(res, items.map(i => {
            const fullPath = path.join(dir, i.name);
            let size = 0;
            try { if (i.isFile()) size = fs.statSync(fullPath).size; } catch (e) {}
            return { name: i.name, isDir: i.isDirectory(), size };
        }));
    } catch (e) { handleJson(res, { error: e.message }); }
}

function handleFileRead(parsedUrl, res) {
    try {
        const file = safePath(parsedUrl.searchParams.get('path'));
        if (!fs.statSync(file).isFile()) throw new Error('Not a file');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(fs.readFileSync(file));
    } catch (e) { res.writeHead(404); res.end(e.message); }
}

function handleFileWrite(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { path: p, content } = JSON.parse(body);
            const file = safePath(p);
            fs.writeFileSync(file, content);
            handleJson(res, { success: true });
        } catch (e) { res.writeHead(500); res.end(e.message); }
    });
}

function handleFileDelete(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { path: p } = JSON.parse(body);
            const target = safePath(p);
            if (fs.statSync(target).isDirectory()) fs.rmdirSync(target, { recursive: true });
            else fs.unlinkSync(target);
            handleJson(res, { success: true });
        } catch(e) { res.writeHead(500); res.end(e.message); }
    });
}

function handleFileRename(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { oldPath, newPath } = JSON.parse(body);
            fs.renameSync(safePath(oldPath), safePath(newPath));
            handleJson(res, { success: true });
        } catch(e) { res.writeHead(500); res.end(e.message); }
    });
}

function handleFileDownload(parsedUrl, res) {
    try {
        const target = safePath(parsedUrl.searchParams.get('path'));
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${path.basename(target)}"`
        });
        fs.createReadStream(target).pipe(res);
    } catch(e) { res.writeHead(404); res.end(e.message); }
}

function handleFileSearch(parsedUrl, res) {
    try {
        const q = parsedUrl.searchParams.get('q') || '';
        const dir = safePath(parsedUrl.searchParams.get('dir') || '.');
        const results = [];
        function search(currentDir) {
            if (results.length > 50) return;
            const items = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const i of items) {
                const full = path.join(currentDir, i.name);
                if (i.name.toLowerCase().includes(q.toLowerCase())) {
                    results.push({ name: i.name, path: path.relative(ROOT_DIR, full), isDir: i.isDirectory() });
                }
                if (i.isDirectory() && !['node_modules', '.git'].includes(i.name)) {
                    search(full);
                }
            }
        }
        search(dir);
        handleJson(res, results);
    } catch(e) { handleJson(res, { error: e.message }); }
}

function handleFileUpload(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { path: p, contentBase64 } = JSON.parse(body);
            const target = safePath(p);
            const buffer = Buffer.from(contentBase64.split(',')[1], 'base64');
            fs.writeFileSync(target, buffer);
            handleJson(res, { success: true });
        } catch(e) { res.writeHead(500); res.end(e.message); }
    });
}

function handleWifiScan(res) {
    const platform = os.platform();
    if (platform === 'darwin') {
        exec("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s", (err, stdout) => {
            const networks = [];
            if (!err && stdout) {
                stdout.split('\n').slice(1).forEach(line => {
                    const ssid = line.trim().split(/\s{2,}/)[0];
                    if (ssid && ssid !== 'SSID' && !ssid.startsWith('--')) networks.push({ ssid, signal: 'N/A' });
                });
            }
            const unique = Array.from(new Set(networks.map(n => n.ssid))).map(ssid => ({ ssid, signal: 'N/A' }));
            handleJson(res, unique);
        });
    } else {
        // Linux: direct nmcli command for SSID list
        exec("nmcli -t -f SSID dev wifi | sort -u", (err, stdout) => {
            if (!err && stdout) {
                const networks = stdout.split('\n')
                    .map(s => s.trim())
                    .filter(s => s && s !== 'SSID')
                    .map(s => ({ ssid: s, signal: 'N/A' }));
                handleJson(res, networks);
            } else {
                wifi.scan((err2, nets) => {
                    if (err2) return handleJson(res, []);
                    handleJson(res, nets.map(n => ({ ssid: n.ssid, signal: n.signalLevel })));
                });
            }
        });
    }
}

function handleWifiConnect(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { ssid, password } = JSON.parse(body);
            const platform = os.platform();
            if (platform === 'darwin') {
                exec(`networksetup -setairportnetwork en0 "${ssid}" "${password}"`, (err, stdout) => {
                    handleJson(res, { success: !err, output: stdout });
                });
            } else {
                wifi.connect({ ssid, password }, (err) => {
                    handleJson(res, { success: !err, output: err ? err.toString() : 'Connected' });
                });
            }
        } catch (e) { handleJson(res, { success: false, output: 'Bad Request' }); }
    });
}

function startServer(port) {
    server.listen(port, () => {
        console.log(`AiDash running on port ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is busy, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error(err);
        }
    });
}

startServer(PORT);
