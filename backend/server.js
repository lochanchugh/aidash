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
const LOG_PATH = path.join(__dirname, '../server.log');

// Whitelist for command execution
const WHITELIST = ['ls', 'df -h', 'uptime', 'free -m', 'du -sh', 'ps aux', 'tail -n 100', 'git pull', 'npm install'];

let alerts = [];

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

function getConfig() {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { modules: { alerts: true, ai: true, logs: true, disk: true } };
}

const server = http.createServer((req, res) => {
    const { method, url } = req;
    const config = getConfig();

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
            const { username, password } = JSON.parse(body);
            const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
            const user = users.find(u => u.username === username);
            const hashed = crypto.createHash('sha256').update(password).digest('hex');
            if (user && user.password === hashed) {
                res.writeHead(200, { 'Set-Cookie': `${SESSION_TOKEN}=admin; HttpOnly; Path=/`, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, role: user.role }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
            }
        } catch (e) { res.writeHead(400); res.end('Bad Request'); }
    });
}

function handleStats(res) {
    handleJson(res, { uptime: os.uptime(), totalMem: os.totalmem(), freeMem: os.freemem(), load: os.loadavg(), cpus: os.cpus().length });
}

function handleServices(res) {
    exec('ps aux | grep node | grep -v grep', (err, stdout) => {
        const lines = stdout.trim().split('\n').filter(l => l.length > 0);
        handleJson(res, lines.map(l => {
            const p = l.replace(/\s+/g, ' ').split(' ');
            return { name: `Proc ${p[1]}`, pid: p[1], cpu: p[2], mem: p[3], cmd: p.slice(10).join(' ') };
        }));
    });
}

function handleDisk(res) {
    exec('df -h /', (err, stdout) => {
        const lines = stdout.trim().split('\n');
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
            if (!WHITELIST.some(w => command.startsWith(w))) { res.writeHead(403); res.end('Forbidden'); return; }
            exec(command, (err, stdout, stderr) => { handleJson(res, { output: stdout || stderr }); });
        } catch (e) { res.writeHead(400); res.end('Bad Request'); }
    });
}

function handleDeploy(req, res) {
    // Deployment helper: git pull && npm install && restart
    exec('git pull && npm install', (err, stdout, stderr) => {
        handleJson(res, { output: stdout || stderr, success: !err });
    });
}

function handleAiAsk(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { prompt } = JSON.parse(body);
            const memUsage = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
            let text = memUsage > 80 ? "Memory is high. Check top processes." : "System is stable.";
            if (prompt.toLowerCase().includes('deploy')) {
                handleJson(res, { text: "I can help you deploy. I suggest running git pull.", suggestion: "git pull" });
            } else {
                handleJson(res, { text, suggestion: "ps aux" });
            }
        } catch (e) { res.writeHead(400); res.end('Bad Request'); }
    });
}

server.listen(PORT, () => { console.log(`AiDash running on port ${PORT}`); });
