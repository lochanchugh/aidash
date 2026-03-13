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
            // Linux WiFi Fallback: try iwgetid first, then nmcli
            exec("iwgetid -r || nmcli -t -f active,ssid dev wifi | grep '^yes' | cut -d: -f2", (err, stdout) => {
                if (!err && stdout.trim()) sysMetrics.wifi = stdout.trim();
                else {
                    wifi.getCurrentConnections((err2, conn) => {
                        if (!err2 && conn && conn.length > 0) sysMetrics.wifi = conn[0].ssid || 'None';
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
    if (!resolved.startsWith(ROOT_DIR)) throw new Error('Access Denied');
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
    } else if (url === '/api/gemini/status' && method === 'GET') {
        handleGeminiStatus(res, config);
    } else if (url === '/api/gemini/run' && method === 'POST') {
        handleGeminiRun(req, res, config);
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
                mem: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
                platform: os.platform(),
                hostname: os.hostname()
            };
            
            const config = getConfig();
            const geminiCmd = config.geminiPath || 'gemini';
            
            const contextPrompt = `You are a server assistant.
Context:
System: ${stats.platform} (${stats.hostname})
Uptime: ${stats.uptime}s
Load: ${stats.load.join(', ')}
RAM Usage: ${stats.mem.toFixed(1)}%
${contextFile ? `User is viewing: ${contextFile}` : ''}

Question: ${prompt}

Rules:
1. Be concise.
2. If a command helps, add "SUGGESTION: command" at the end.
3. Only suggest: ${config.whitelist.join(', ')}
`;

            exec(`${geminiCmd} "${contextPrompt.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
                const output = stdout || stderr || "Assistant unavailable.";
                let suggestion = null;
                const match = output.match(/SUGGESTION:\s*(.+)/i);
                if (match) {
                    suggestion = match[1].trim();
                }
                
                handleJson(res, { 
                    text: output.replace(/SUGGESTION:\s*.+/i, '').trim(), 
                    suggestion: (suggestion && config.whitelist.some(w => suggestion.startsWith(w))) ? suggestion : null
                });
            });
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
                const lines = stdout.split('\n').slice(1);
                for (const line of lines) {
                    const ssid = line.trim().split(/\s{2,}/)[0];
                    if (ssid && ssid !== 'SSID') networks.push({ ssid, signal: 'N/A' });
                }
            }
            handleJson(res, networks);
        });
    } else {
        wifi.scan((err, networks) => {
            if (err) {
                exec("nmcli -t -f SSID dev wifi", (err2, stdout2) => {
                    if (err2) return handleJson(res, []);
                    const n = stdout2.split('\n').filter(s => s).map(s => ({ ssid: s, signal: 'N/A' }));
                    handleJson(res, n);
                });
            } else {
                handleJson(res, networks.map(n => ({ ssid: n.ssid, signal: n.signalLevel })));
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

function handleGeminiStatus(res, config) {
    const geminiCmd = config.geminiPath || 'gemini';
    exec(`${geminiCmd} --version`, (err) => {
        handleJson(res, { available: !err });
    });
}

function handleGeminiRun(req, res, config) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { prompt } = JSON.parse(body);
            const geminiCmd = config.geminiPath || 'gemini';
            exec(`${geminiCmd} "${prompt.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
                handleJson(res, { output: stdout || stderr, success: !err });
            });
        } catch (e) { handleJson(res, { success: false, output: 'Bad Request' }); }
    });
}

server.listen(PORT, () => { console.log(`AiDash running on port ${PORT}`); });
