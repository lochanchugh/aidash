# AiDash | Extreme Server Dashboard
"A lightweight, OS-like dashboard for headless Linux servers."

AiDash V2 is a high-performance system monitoring hub designed for servers with limited resources. It provides a real-time, interactive UI to manage hardware, files, and networking without a desktop environment.

## 🚀 Key Features
- **Real-time Performance Metrics**: Rolling 20-point history charts for CPU and Memory.
- **System Terminal (Ctrl+T / Cmd+T)**: Full interactive shell terminal for real-time command execution and diagnostic output.
- **Headless WiFi Module**: Hardware-level scanning via `iw` and robust joining via `wpa_cli` (designed for server environments).
- **Enhanced File Explorer**: 
  - Full access to the host filesystem (`/host`) with built-in text editor.
  - Create new files and folders directly from the UI.
  - Real-time file size display and one-click file downloads.
  - Safe file deletion and save capabilities.
- **Advanced Battery Hub**: One-click toggle for deep battery analytics (Voltage, Cycle count, Health, and Capacity).
- **Command Palette (Ctrl+K / Cmd+K)**: Instant access to 10+ whitelisted system tools (Disk usage, Process tree, Block devices, etc.).
- **Security Hub**: Admin password management and network configuration in a dedicated modal.
- **Service Monitoring**: Quick-links to other apps/ports hosted on your machine.
- **Diagnostic AI**: Offline-mode assistant for system load analysis.

## 🛠 Docker Deployment (Recommended)
The dashboard is optimized for Docker to handle complex hardware permissions automatically.

1. **Clone and Setup**:
   ```bash
   git clone https://github.com/lochanchugh/aidash.git
   cd aidash
   ```

2. **Grant Hardware Permissions** (Crucial for WiFi):
   ```bash
   sudo chmod 777 /run/wpa_supplicant
   ```

3. **Start the Container**:
   ```bash
   docker-compose up -d --build
   ```

## ⚙️ Technical Power
To provide "Beyond-Docker" capabilities, the following configurations are used:
- **`privileged: true`**: Allows access to the laptop's hardware.
- **`network_mode: "host"`**: Ensures the dashboard sees the real Wi-Fi card.
- **Socket Mounting**: Links `/run/wpa_supplicant` and `/var/run/dbus` for real-time network control.
- **Host Mounting**: Mounts the server's root filesystem to `/host` for the File Explorer.

## 🔒 Security
- **Admin Authentication**: Required for all system actions.
- **Password Hashing**: SHA-256 protection for credentials.
- **Command Whitelisting**: Prevents arbitrary shell execution.
- **Host Isolation**: File access is restricted to the `/host` mount path.

## 📝 Configuration
- `backend/users.json`: Manage admin credentials.
- `config/default.json`: Customize modules and whitelisted commands.
- `backend/server.js`: Defaulted to `wlp0s20f3` Wi-Fi interface.
