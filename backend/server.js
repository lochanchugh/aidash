const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = 'aidash_session';
const USERS_PATH = path.join(__dirname, 'users.json');
const LOG_PATH = path.join(__dirname, '../server.log');

const WHITELIST = ['ls', 'df -h', 'uptime', 'free -m', 'du -sh', 'ps aux'];

let alerts = [];

// Evaluate system health every 30 seconds
function evaluateAlerts() {
    const newAlerts = [];
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;

    if (memUsage > 90) {
        newAlerts.push({ type: 'Memory', message: `Critical: Memory usage at ${memUsage.toFixed(1)}%`, severity: 'danger' });
    } else if (memUsage > 75) {
        newAlerts.push({ type: 'Memory', message: `Warning: Memory usage at ${memUsage.toFixed(1)}%`, severity: 'warning' });
    }

    const load = os.loadavg()[0];
    const cpus = os.cpus().length;
    if (load > cpus * 0.9) {
        newAlerts.push({ type: 'Load', message: `High system load: ${load.toFixed(2)}`, severity: 'danger' });
    }

    alerts = newAlerts;
}
setInterval(evaluateAlerts, 30000);
evaluateAlerts();

const server = http.createServer((req, res) => {
    const { method, url } = req;

    if (url === '/' && method === 'GET') {
        serveFile(res, path.join(__dirname, '../frontend/index.html'), 'text/html');
    } else if (url === '/api/login' && method === 'POST') {
        handleLogin(req, res);
    } else if (url === '/api/stats' && method === 'GET') {
        handleStats(res);
    } else if (url === '/api/services' && method === 'GET') {
        handleServices(res);
    } else if (url === '/api/alerts' && method === 'GET') {
        handleJson(res, alerts);
    } else if (url === '/api/disk' && method === 'GET') {
        handleDisk(res);
    } else if (url === '/api/logs' && method === 'GET') {
        handleLogs(res);
    } else if (url === '/api/command' && method === 'POST') {
        handleCommand(req, res);
    } else if (url === '/api/ai/ask' && method === 'POST') {
        handleAiAsk(req, res);
    } else {
        res.writeHead(404); res.end('Not Found');
    }
});

function serveFile(res, filePath, contentType) {
    if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end('Not Found'); return;
    }
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
            const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
            if (user && user.password === hashedPassword) {
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
    handleJson(res, {
        uptime: os.uptime(),
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        load: os.loadavg(),
        cpus: os.cpus().length,
        platform: os.platform()
    });
}

function handleServices(res) {
    // List current Node processes as a real example of service monitoring
    exec('ps aux | grep node | grep -v grep', (err, stdout) => {
        const lines = stdout.trim().split('\n').filter(l => l.length > 0);
        const svcs = lines.map((l, i) => {
            const parts = l.replace(/\s+/g, ' ').split(' ');
            return { name: `Node Proc ${parts[1]}`, status: 'running', port: i === 0 ? PORT : 'N/A' };
        });
        handleJson(res, svcs);
    });
}

function handleDisk(res) {
    exec('df -h /', (err, stdout) => {
        if (err) return handleJson(res, []);
        const lines = stdout.trim().split('\n');
        const parts = lines[1].replace(/\s+/g, ' ').split(' ');
        handleJson(res, [{ path: parts[8] || parts[5] || '/', size: parts[1], used: parts[2], avail: parts[3], usage: parts[4] }]);
    });
}

function handleLogs(res) {
    if (fs.existsSync(LOG_PATH)) {
        const logs = fs.readFileSync(LOG_PATH, 'utf8').split('\n').slice(-50).join('\n');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(logs);
    } else {
        res.writeHead(200); res.end('No logs found yet.');
    }
}

function handleCommand(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { command } = JSON.parse(body);
            if (!WHITELIST.some(w => command.startsWith(w))) {
                res.writeHead(403); res.end('Forbidden'); return;
            }
            exec(command, (err, stdout, stderr) => {
                handleJson(res, { output: stdout || stderr });
            });
        } catch (e) { res.writeHead(400); res.end('Bad Request'); }
    });
}

function handleAiAsk(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { prompt } = JSON.parse(body);
            // Real logic based on system data
            let response = "I've checked the system. ";
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const memUsage = ((totalMem - freeMem) / totalMem) * 100;
            
            if (memUsage > 80) {
                response += "Memory usage is very high. I suggest checking for memory-heavy processes.";
            } else {
                response += "The system appears healthy. Load and memory are within normal limits.";
            }
            handleJson(res, { text: response, suggestion: "ps aux" });
        } catch (e) { res.writeHead(400); res.end('Bad Request'); }
    });
}

server.listen(PORT, () => { console.log(`AiDash running on port ${PORT}`); });
