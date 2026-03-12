# AiDash
"A minimal AI-powered server dashboard."

AiDash is a lightweight server dashboard designed for small servers with minimal RAM and disk usage.

## Features
- **Dashboard**: Real-time CPU, RAM, and disk monitoring.
- **Service Management**: Monitor and control system services.
- **Service Link Dashboard**: Quick access to service URLs and ports.
- **Alert System**: Notifications for high resource usage or service failures.
- **AI Assistant**: Diagnose issues and receive command suggestions.
- **Command Palette**: Keyboard-driven command execution (Ctrl+K).
- **Disk Explorer**: Visualize directory storage breakdown.

## Installation
1. Clone the repository.
2. Run the backend: `node backend/server.js`.
3. Access the dashboard at `http://localhost:3000`.

## Configuration
Edit `config/default.json` to customize ports, services, and whitelisted commands.

## Security
- Password hashing using SHA-256.
- Session-based authentication.
- Whitelisted command execution to prevent arbitrary shell access.
