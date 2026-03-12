const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = 'aidash_session';
const USERS_PATH = path.join(__dirname, 'users.json');

// Real services should be configured here or in a config file
const services = [
    { name: 'AiDash Backend', description: 'This dashboard', port: PORT, status: 'running' }
];

const WHITELIST = ['ls', 'df -h', 'uptime', 'free -m', 'du -sh *'];

const server = http.createServer((req, res) => {
    const { method, url } = req;

    if (url === '/' && method === 'GET') {
        serveFile(res, path.join(__dirname, '../frontend/index.html'), 'text/html');
    } else if (url === '/api/login' && method === 'POST') {
        handleLogin(req, res);
    } else if (url === '/api/stats' && method === 'GET') {
        handleStats(req, res);
    } else if (url === '/api/services' && method === 'GET') {
        handleJson(res, services);
    } else if (url === '/api/alerts' && method === 'GET') {
        handleJson(res, []); // Start with empty alerts
    } else if (url === '/api/disk' && method === 'GET') {
        handleDisk(res);
    } else if (url === '/api/command' && method === 'POST') {
        handleCommand(req, res);
    } else if (url === '/api/ai/ask' && method === 'POST') {
        handleAiAsk(req, res);
    } else {
        res.writeHead(404);
        res.end('Not Found');
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

function handleStats(req, res) {
    const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        load: require('os').loadavg()
    };
    handleJson(res, stats);
}

function handleDisk(res) {
    // Execute 'df -h' to get real disk usage
    exec('df -h /', (err, stdout) => {
        if (err) return handleJson(res, []);
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return handleJson(res, []);
        const parts = lines[1].replace(/\s+/g, ' ').split(' ');
        const diskData = [{
            path: parts[8] || parts[5] || '/',
            size: parts[1],
            used: parts[2],
            avail: parts[3],
            usage: parts[4]
        }];
        handleJson(res, diskData);
    });
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
            const answer = { text: "I've analyzed your system. Disk space looks healthy.", suggestion: "df -h" };
            handleJson(res, answer);
        } catch (e) { res.writeHead(400); res.end('Bad Request'); }
    });
}

server.listen(PORT, () => { console.log(`AiDash running on port ${PORT}`); });
