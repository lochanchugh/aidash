const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = 'aidash_session';
const USERS_PATH = path.join(__dirname, 'users.json');

const services = [
    { name: 'Reverse Proxy', description: 'Nginx', port: 80, status: 'running' },
    { name: 'API Server', description: 'Node.js app', port: 5000, status: 'running' },
    { name: 'File Manager', description: 'SFTPGo', port: 8080, status: 'stopped' }
];

const alerts = [
    { id: 1, type: 'Memory', message: 'High RAM usage (85%)', severity: 'warning', date: new Date().toISOString() },
    { id: 2, type: 'Service', message: 'File Manager stopped unexpectedly', severity: 'danger', date: new Date().toISOString() }
];

const WHITELIST = ['ls', 'df -h', 'uptime', 'npm -v'];

const server = http.createServer((req, res) => {
    const { method, url } = req;
    console.log(`${method} ${url}`);

    if (url === '/' && method === 'GET') {
        serveFile(res, path.join(__dirname, '../frontend/index.html'), 'text/html');
    } else if (url === '/api/login' && method === 'POST') {
        handleLogin(req, res);
    } else if (url === '/api/stats' && method === 'GET') {
        handleStats(req, res);
    } else if (url === '/api/services' && method === 'GET') {
        handleJson(res, services);
    } else if (url === '/api/alerts' && method === 'GET') {
        handleJson(res, alerts);
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
        res.writeHead(404);
        res.end('Not Found');
        return;
    }
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
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
                res.writeHead(200, {
                    'Set-Cookie': `${SESSION_TOKEN}=admin_token; HttpOnly; Path=/`,
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({ success: true, role: user.role }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
            }
        } catch (e) {
            res.writeHead(400); res.end('Bad Request');
        }
    });
}

function handleStats(req, res) {
    const stats = { uptime: process.uptime(), memory: process.memoryUsage(), platform: process.platform, load: [0.1, 0.2, 0.1] };
    handleJson(res, stats);
}

function handleDisk(res) {
    const diskData = [
        { path: '/', size: '20GB', used: '15GB', avail: '5GB', usage: '75%' },
        { path: '/var/log', size: '2GB', used: '1.2GB', avail: '0.8GB', usage: '60%' }
    ];
    handleJson(res, diskData);
}

function handleCommand(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { command } = JSON.parse(body);
            if (!WHITELIST.includes(command)) {
                res.writeHead(403); res.end('Command not whitelisted');
                return;
            }
            exec(command, (err, stdout, stderr) => {
                handleJson(res, { output: stdout || stderr });
            });
        } catch (e) {
            res.writeHead(400); res.end('Bad Request');
        }
    });
}

function handleAiAsk(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const { prompt } = JSON.parse(body);
            const answer = { text: "I suggest checking the disk usage.", suggestion: "df -h" };
            handleJson(res, answer);
        } catch (e) {
            res.writeHead(400); res.end('Bad Request');
        }
    });
}

server.listen(PORT, () => {
    console.log(`AiDash running on port ${PORT}`);
});
