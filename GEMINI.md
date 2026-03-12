# AiDash Project Context

## Project Identity
- **Name**: AiDash
- **Tagline**: "A minimal AI-powered server dashboard."
- **Goal**: Lightweight server monitoring and control for very small servers.
- **Priorities**: Minimal RAM usage, minimal disk usage, minimal dependencies, fast startup.

## Core Requirements (Original Prompt)
- **Authentication**: Secure login (admin/admin), hashed passwords (SHA-256), session-based.
- **Dashboard**: Real-time stats (CPU load, RAM usage, Disk capacity, Uptime).
- **Service Management**: Monitor processes (focused on Node.js) and control via command palette.
- **Service Link Dashboard**: UI listing services and ports for quick access.
- **Alert System**: Notifications for high resource usage (e.g., >90% RAM, high load).
- **Log Viewer**: Live streaming from `server.log` with search/filtering capabilities.
- **Disk Explorer**: Breakdown of top-consuming folders using real system calls (`df`, `du`).
- **AI Assistant**: Diagnostic chat interface suggesting approved commands (never auto-executing).
- **Command Palette**: Keyboard-driven (Ctrl+K) interface for whitelisted commands.

## Architecture
- **Backend**: Node.js (`backend/server.js`) using built-in modules (`http`, `fs`, `os`, `crypto`, `child_process`).
- **Frontend**: Vanilla HTML/JS/CSS (`frontend/index.html`) in a single-page application.
- **Configuration**: JSON-based (`config/default.json`) for services and command whitelisting.

## Current Progress & Status
- [x] Initial Project Structure & Git Workflow
- [x] Backend Foundation & API Implementation
- [x] Secure Authentication (SHA-256)
- [x] Real-time Dashboard UI (Live Stats)
- [x] Process Monitoring (Real `ps aux` calls)
- [x] Service Link Dashboard (Config-driven)
- [x] Log Viewer & Real-time Filtering
- [x] Disk Explorer (Real `df` and `du` calls)
- [x] AI Diagnostic Assistant (Context-aware)
- [x] Keyboard-driven Command Palette (Ctrl+K)
- [x] Documentation & Open Source Quality README

## Technical Details
- **Credentials**: `admin` / `admin`
- **Port**: 3000 (default)
- **Whitelisted Commands**: `ls`, `df -h`, `uptime`, `free -m`, `du -sh`, `ps aux`, `tail -n 100`

## Future Roadmap
- Implementation of the modular design (enabling/disabling modules via config).
- Expanded Deployment Helper (Git pull, dependency install, restart).
- Support for external notifications (Webhooks, email).
