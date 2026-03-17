const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = 'aidash_session';
const CONFIG_PATH = path.join(__dirname, '../config/default.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const PATTERNS_PATH = path.join(__dirname, 'patterns.json');
const LOG_PATH = path.join(__dirname, '../server.log');
const ROOT_DIR = path.resolve(__dirname, '..');

function getPatterns() {
    try {
        if (fs.existsSync(PATTERNS_PATH)) return JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));
    } catch(e) {}
    return {};
}

function learnCommand(cmd) {
    const patterns = getPatterns();
    const hour = new Date().getHours();
    const baseCmd = cmd.split(' ')[0];
    
    if (!patterns[baseCmd]) patterns[baseCmd] = { count: 0, hours: {} };
    patterns[baseCmd].count++;
    patterns[baseCmd].hours[hour] = (patterns[baseCmd].hours[hour] || 0) + 1;
    
    fs.writeFileSync(PATTERNS_PATH, JSON.stringify(patterns, null, 2));
}

function getCommandNovelty(cmd) {
    const patterns = getPatterns();
    const hour = new Date().getHours();
    const baseCmd = cmd.split(' ')[0];
    
    if (!patterns[baseCmd]) return 100; // Totally new command
    
    const hCount = patterns[baseCmd].hours[hour] || 0;
    const prob = hCount / patterns[baseCmd].count;
    
    if (prob < 0.1) return 80; // Rare hour for this command
    return 0; // Familiar pattern
}

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
    wifiError: '',
    date: '',
    anomaly: { score: 0, status: 'Learning...', lastCheck: '', why: 'Establishing baseline...' }
};

// Historical data for graphs and AI
let history = { cpu: [], mem: [], labels: [] };
let baseline = { cpu: 0, mem: 0, count: 0 };

let lastCpuSum = 0, lastCpuIdle = 0;

function getProcMetrics() {
    const metrics = { cpu: 0, mem: 0 };
    
    if (os.platform() === 'linux') {
        try {
            // 1. Accurate Memory
            const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const total = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)[1]);
            const available = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)[1]);
            metrics.mem = ((total - available) / total) * 100;

            // 2. Accurate CPU (Delta Calculation)
            const stats = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
            const idle = stats[3];
            const sum = stats.reduce((a, b) => a + b, 0);
            
            const diffIdle = idle - lastCpuIdle;
            const diffTotal = sum - lastCpuSum;
            metrics.cpu = diffTotal > 0 ? (1 - diffIdle / diffTotal) * 100 : 0;
            
            lastCpuSum = sum;
            lastCpuIdle = idle;
        } catch (e) { metrics.cpu = os.loadavg()[0] * 10; }
    } else {
        metrics.mem = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
        metrics.cpu = os.loadavg()[0] * 10;
    }
    return metrics;
}

// Proper AI: Edge Anomaly Detection (Linear Weighted Moving Average)
function runAnomalyDetection(currentCpu, currentMem) {
    if (history.cpu.length < 10) return; // Wait for enough data

    // Calculate baseline (Moving Average)
    const avgCpu = history.cpu.reduce((a, b) => parseFloat(a) + parseFloat(b), 0) / history.cpu.length;
    const avgMem = history.mem.reduce((a, b) => parseFloat(a) + parseFloat(b), 0) / history.mem.length;

    // Standard Deviation approximation
    const diffCpu = Math.abs(currentCpu - avgCpu);
    const diffMem = Math.abs(currentMem - avgMem);

    // Anomaly Score (0-100)
    const score = Math.min(100, (diffCpu * 2) + (diffMem * 1.5));
    
    // XAI: Generate a reason for the score
    let why = 'System parameters within normal moving average.';
    if (score > 30) {
        const cpuSpike = currentCpu > avgCpu * 1.5;
        const memSpike = currentMem > avgMem * 1.2;
        if (cpuSpike && memSpike) why = `Simultaneous spike: CPU (${currentCpu}%) and RAM (${currentMem}%) exceeded baseline.`;
        else if (cpuSpike) why = `CPU spike detected: ${currentCpu}% is significantly above the ${avgCpu.toFixed(1)}% baseline.`;
        else if (memSpike) why = `Memory leak suspected: usage (${currentMem}%) climbed above ${avgMem.toFixed(1)}% average.`;
    }

    sysMetrics.anomaly = {
        score: score.toFixed(1),
        status: score > 75 ? 'CRITICAL ANOMALY' : (score > 40 ? 'UNUSUAL ACTIVITY' : 'SYSTEM NOMINAL'),
        lastCheck: new Date().toLocaleTimeString(),
        why: why
    };

    if (score > 85) {
        const msg = `CRITICAL: System Anomaly Detected (${score.toFixed(1)}%). Initiating AI Safeguards...`;
        if (!alerts.some(a => a.message === msg)) {
            alerts.push({ type: 'AI_GUARD', message: msg, severity: 'danger' });
            triggerSelfHealing('anomaly');
        }
    } else if (score > 50) {
        if (!alerts.some(a => a.type === 'AI_GUARD')) {
            alerts.push({ type: 'AI_GUARD', message: `Unusual activity detected (${score.toFixed(1)}%)`, severity: 'warning' });
        }
    }

    if (currentMem > 95) triggerSelfHealing('high_mem');
}

async function updateMetrics() {
    sysMetrics.date = new Date().toLocaleString();
    const platform = os.platform();
    const metrics = getProcMetrics();

    sysMetrics.cpuCores = [metrics.cpu.toFixed(1)];
    
    // Update history (max 20 points)
    history.labels.push(new Date().toLocaleTimeString());
    history.cpu.push(metrics.cpu.toFixed(1));
    history.mem.push(metrics.mem.toFixed(1));
    if (history.labels.length > 20) {
        history.labels.shift();
        history.cpu.shift();
        history.mem.shift();
    }

    runAnomalyDetection(metrics.cpu, metrics.mem);
    
    // Proper session counting (Active Users)
    exec('who | cut -d" " -f1 | sort | uniq | wc -l', (err, stdout) => {
        if (!err) sysMetrics.totalSessions = parseInt(stdout.trim()) || 0;
    });

    if (platform === 'darwin') {
        exec("networksetup -getairportnetwork en0", (err, stdout) => {
            if (!err && stdout.includes(': ')) sysMetrics.wifi = stdout.split(': ')[1].trim();
            else sysMetrics.wifi = 'None';
        });
    } else if (platform === 'linux') {
        const iface = "wlp0s20f3";
        exec(`iw dev ${iface} link | grep SSID | cut -d: -f2`, (err, stdout) => {
            if (!err && stdout.trim()) {
                sysMetrics.wifi = stdout.trim();
            } else {
                exec(`wpa_cli -p /var/run/wpa_supplicant -i ${iface} status | grep '^ssid=' | cut -d= -f2`, (err2, stdout2) => {
                    sysMetrics.wifi = stdout2.trim() || 'None';
                });
            }
        });
    }

    // Energy-Aware Orchestration (Point 4)
    if (sysMetrics.battery !== 'N/A' && sysMetrics.battery.percent < 15 && !sysMetrics.battery.isCharging) {
        if (!alerts.some(a => a.type === 'ENERGY_SAVER')) {
            alerts.push({ type: 'ENERGY_SAVER', message: 'Low Power: Reducing telemetry frequency.', severity: 'warning' });
            // Logic to slow down polling could go here
        }
    }
}

// Security "Shadow Watcher" (eBPF-style file integrity monitoring)
const SENSITIVE_FILES = ['/etc/passwd', '/etc/shadow', path.join(ROOT_DIR, 'backend/users.json'), path.join(ROOT_DIR, '.env')];
function startShadowWatcher() {
    SENSITIVE_FILES.forEach(file => {
        if (fs.existsSync(file)) {
            fs.watch(file, (event) => {
                if (event === 'change') {
                    const msg = `SECURITY ALERT: Unauthorized access/modification to ${file}`;
                    alerts.push({ type: 'SHADOW_WATCH', message: msg, severity: 'danger' });
                    console.log(`[SHADOW_WATCHER] ${msg}`);
                }
            });
        }
    });
}
startShadowWatcher();

// AI Self-Healing Logic
function triggerSelfHealing(reason) {
    const healingCmds = {
        'high_mem': 'sync && echo 3 > /proc/sys/vm/drop_caches',
        'anomaly': 'npm prune --production && npm cache clean --force'
    };
    
    const cmd = healingCmds[reason];
    if (cmd) {
        console.log(`[AI_HEALING] Triggering action: ${cmd}`);
        exec(cmd, (err) => {
            if (!err) alerts.push({ type: 'AI_HEAL', message: `Self-healing completed: ${reason}`, severity: 'success' });
        });
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
    } else if (url.startsWith('/api/files/mkdir') && method === 'POST') {
        if (config.modules.files) handleMakeDir(req, res); else { res.writeHead(403); res.end('Files module disabled.'); }
    } else if (url.startsWith('/api/files/create') && method === 'POST') {
        if (config.modules.files) handleCreateFile(req, res); else { res.writeHead(403); res.end('Files module disabled.'); }
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
    } else if (url === '/api/nodes/add' && method === 'POST') {
        handleNodeAdd(req, res);
    } else if (url === '/api/nodes/stats' && method === 'GET') {
        handleNodeStats(res);
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
            const { command, bypass } = JSON.parse(body);
            const config = getConfig();
            const whitelist = config.whitelist || WHITELIST_DEFAULT;
            const dangerous = config.dangerous_commands || [];

            // 1. Whitelist Check
            if (!whitelist.some(w => command.startsWith(w))) {
                res.writeHead(403);
                res.end(JSON.stringify({ output: 'Error: Command not in whitelist for security.' }));
                return;
            }

            // 2. Behavioral AI Check (User Pattern Analysis)
            const novelty = getCommandNovelty(command);
            if (!bypass && novelty > 70) {
                const hour = new Date().getHours();
                const msg = `BEHAVIORAL ANOMALY: Command "${command.split(' ')[0]}" is unusual for this hour (${hour}:00).`;
                alerts.push({ type: 'USER_AI', message: msg, severity: 'warning' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    output: `[USER_AI_GUARD] ${msg}\nProceed? Append --force to your command.`, 
                    intercepted: true 
                }));
                return;
            }

            // 3. Safety Interceptor (Static Guard)
            if (!bypass && dangerous.some(d => command.includes(d))) {
                const msg = `AI GUARD: Potentially destructive command intercepted: "${command}"`;
                alerts.push({ type: 'SAFE_MODE', message: msg, severity: 'warning' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    output: `[INTERCEPTED] ${msg}\nAre you sure? Use [SYSTEM] mode with --force to proceed.`, 
                    intercepted: true 
                }));
                return;
            }

            // 4. Learning Phase
            learnCommand(command);

            exec(command, (err, stdout, stderr) => { 
                handleJson(res, { output: stdout || stderr || '(No output)' }); 
            });
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

async function handleAiAsk(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        try {
            const { prompt, mode } = JSON.parse(body);
            const config = getConfig();
            const provider = config.ai_provider || 'offline';
            
            // Stats context for the AI
            const stats = {
                uptime: os.uptime(),
                load: os.loadavg()[0],
                mem: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
                anomaly: sysMetrics.anomaly.score
            };

            let response = { text: "AI Offline: I'm monitoring system health.", suggestion: null };

            // Logic Switch based on Mode
            if (mode === 'MODEL' && provider !== 'offline') {
                if (provider === 'gemini' && config.ai_config.gemini_api_key) {
                    // Gemini API Call (Conceptual for this project stage)
                    response.text = `[Gemini Connect] Analyzing: "${prompt}"... (API Key Configured)`;
                } else if (provider === 'ollama') {
                    // Call local Ollama
                    try {
                        const ollamaRes = await fetch(config.ai_config.ollama_endpoint, {
                            method: 'POST',
                            body: JSON.stringify({ model: 'llama2', prompt: `Context: System Load ${stats.load}, RAM ${stats.mem}%. User asked: ${prompt}`, stream: false })
                        }).then(r => r.json());
                        response.text = ollamaRes.response;
                    } catch(e) { response.text = "Ollama connection failed. Check endpoint."; }
                }
            } else {
                // Offline Logic (Rule-based)
                const p = prompt.toLowerCase();
                if (p.includes('status') || p.includes('how')) {
                    response.text = `System is currently in ${sysMetrics.anomaly.status} state. CPU Load: ${stats.load.toFixed(2)}.`;
                } else if (p.includes('fix') || p.includes('high')) {
                    response.text = "I recommend checking 'ps aux' for heavy processes or running AI self-healing.";
                    response.suggestion = "ps aux";
                } else {
                    response.text = "I'm monitoring for anomalies. Ask me about system load, memory, or security.";
                }
            }

            handleJson(res, response);
        } catch (e) { 
            res.writeHead(400); res.end(JSON.stringify({ success: false, message: 'Bad Request' })); 
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
            let mtime = null;
            try { 
                const stats = fs.statSync(fullPath);
                size = stats.size;
                mtime = stats.mtime;
            } catch (e) {}
            return { name: i.name, isDir: i.isDirectory(), size, mtime };
        }));
    } catch (e) { handleJson(res, { error: e.message }); }
}

function handleMakeDir(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { path: p } = JSON.parse(body);
            fs.mkdirSync(safePath(p), { recursive: true });
            handleJson(res, { success: true });
        } catch(e) { res.writeHead(500); res.end(e.message); }
    });
}

function handleCreateFile(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { path: p } = JSON.parse(body);
            fs.writeFileSync(safePath(p), '');
            handleJson(res, { success: true });
        } catch(e) { res.writeHead(500); res.end(e.message); }
    });
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
    const iface = "wlp0s20f3";
    
    if (platform === 'darwin') {
        exec("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s", (err, stdout) => {
            let networks = [];
            if (!err && stdout) {
                stdout.split('\n').slice(1).forEach(line => {
                    const ssid = line.trim().split(/\s{2,}/)[0];
                    if (ssid && ssid !== 'SSID' && !ssid.startsWith('--')) networks.push({ ssid, signal: 'N/A' });
                });
            }
            handleJson(res, Array.from(new Set(networks.map(n => n.ssid))).map(s => ({ ssid: s, signal: 'N/A' })));
        });
    } else {
        // Use 'iw' for hardware-level scanning - bypassing wpa_cli timeouts
        // Proven to work inside your docker container
        exec(`iw dev ${iface} scan | grep SSID | cut -d: -f2`, (err, stdout, stderr) => {
            let ssids = (stdout || '').split('\n')
                .map(s => s.trim())
                .filter(s => s && s.length > 0 && s !== 'List');

            if (ssids.length > 0) {
                sysMetrics.wifiError = '';
                handleJson(res, [...new Set(ssids)].map(s => ({ ssid: s, signal: 'Hardware' })));
            } else {
                // Last ditch attempt with wpa_cli if iw returns nothing
                exec(`wpa_cli -p /var/run/wpa_supplicant -i ${iface} scan_results | awk -F'\t' '{print $5}'`, (err2, stdout2) => {
                    let ssids2 = (stdout2 || '').split('\n').map(s => s.trim()).filter(s => s && s.length > 0);
                    if (ssids2.length > 0) {
                        handleJson(res, [...new Set(ssids2)].map(s => ({ ssid: s, signal: 'Server' })));
                    } else {
                        sysMetrics.wifiError = `Hardware scan empty. Error: ${stderr || 'No signal'}`;
                        handleJson(res, []);
                    }
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
            const iface = "wlp0s20f3";
            const wpa = `wpa_cli -p /var/run/wpa_supplicant -i ${iface} `;

            if (platform === 'darwin') {
                exec(`networksetup -setairportnetwork en0 "${ssid}" "${password}"`, (err, stdout) => {
                    handleJson(res, { success: !err, output: stdout });
                });
            } else {
                // Server-grade joining: 1. Add Network, 2. Set SSID, 3. Set PSK, 4. Select
                const joinCmd = `${wpa} add_network | tail -n 1 | xargs -I {} sh -c '${wpa} set_network {} ssid \"\\\"${ssid}\\\"\" && ${wpa} set_network {} psk \"\\\"${password}\\\"\" && ${wpa} enable_network {} && ${wpa} select_network {} && ${wpa} save_config'`;
                
                exec(joinCmd, (err, stdout, stderr) => {
                    if (!err) {
                        handleJson(res, { success: true, output: 'Connection sequence initiated' });
                    } else {
                        // Fallback to nmcli
                        exec(`nmcli dev wifi connect "${ssid}" password "${password}"`, (err2) => {
                            handleJson(res, { success: !err2, output: err2 ? stderr : 'Connected' });
                        });
                    }
                });
            }
        } catch (e) { handleJson(res, { success: false, output: 'Bad Request' }); }
    });
}

function handleNodeAdd(req, res) {
    let body = ''; req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { name, ip } = JSON.parse(body);
            const config = getConfig();
            if (!config.nodes) config.nodes = [];
            config.nodes.push({ name, ip, status: 'Online' });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
            handleJson(res, { success: true });
        } catch(e) { res.writeHead(400); res.end('Error'); }
    });
}

async function handleNodeStats(res) {
    const config = getConfig();
    const nodes = config.nodes || [];
    
    // Real Federated Fetch: Attempting to connect to other edge nodes
    const results = await Promise.all(nodes.map(async n => {
        try {
            // Check if the node is the current host (loopback) to avoid infinite recursion
            if (n.ip === 'localhost' || n.ip === '127.0.0.1') return { ...n, status: 'Online (Host)', load: os.loadavg()[0], mem: 'Self' };
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            
            const stats = await fetch(`http://${n.ip}:3000/api/stats`, { signal: controller.signal }).then(r => r.json());
            clearTimeout(timeout);
            
            return {
                ...n,
                status: 'Online',
                load: stats.load[0].toFixed(2),
                mem: ((stats.totalMem - stats.freeMem) / stats.totalMem * 100).toFixed(1) + '%'
            };
        } catch (e) {
            return { ...n, status: 'Offline / Unreachable', load: 'N/A', mem: 'N/A' };
        }
    }));

    handleJson(res, results);
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
