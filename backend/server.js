const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = 'aidash_session';

const USERS_PATH = path.join(__dirname, 'users.json');

const server = http.createServer((req, res) => {
    const { method, url } = req;
    console.log(`${method} ${url}`);

    if (url === '/' && method === 'GET') {
        serveFile(res, path.join(__dirname, '../frontend/index.html'), 'text/html');
    } else if (url === '/api/login' && method === 'POST') {
        handleLogin(req, res);
    } else if (url === '/api/stats' && method === 'GET') {
        handleStats(req, res);
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
            res.writeHead(400);
            res.end('Bad Request');
        }
    });
}

function handleStats(req, res) {
    // Basic system stats for the dashboard
    const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        load: [0.1, 0.2, 0.1] // Placeholder
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
}

server.listen(PORT, () => {
    console.log(`AiDash running on port ${PORT}`);
});
