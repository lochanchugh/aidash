# AIDASH | Autonomous Edge Management & AI Guardian
"The high-performance, AI-native operating environment for headless edge servers."

AIDASH (formerly AiDash V2) is a specialized B.Tech project focusing on **Resource-Optimized Intelligence** for servers with limited power and memory. It transforms a standard monitoring tool into an **Autonomous Guardian** capable of anomaly detection and self-healing.

## 🎓 B.Tech Project Thesis: Core Innovations

### 1. Hero Terminal V2 (AI-Native Interface)
The terminal is no longer a "side tool"—it is the **Intelligence Hub**.
- **Contextual Awareness**: Real-time analysis of typed commands against historical usage patterns.
- **Triple-Mode Switching**:
    - `[SYSTEM]`: Standard raw shell access.
    - `[AI_EDGE]`: Local diagnostic assistant for system load and logs.
    - `[MODEL]`: Cloud/Local LLM integration (Gemini/Ollama) for code generation and deep debugging.

### 2. Edge Anomaly Engine (Predictive Security)
Moving from *threshold-based alerts* to *pattern-based detection*.
- **Local ML Inference**: A lightweight Moving Average & Standard Deviation model runs in the backend to "learn" your server's normal heartbeat.
- **Threat Scoring**: Real-time 0-100% anomaly score integrated into the Hero Section.
- **Proactive Interception**: Intercepts dangerous system states before hardware failure or security breaches occur.

### 4. Smart Safety Interceptor
A proactive security layer that sits between the user and the shell.
- **AI-Native Guard**: Intercepts high-risk commands (e.g., `rm -rf`, `mkfs`) based on a dynamically configurable danger list.
- **Alert Integration**: Every interception is logged to the Hero Terminal and the Security Hub.
- **Controlled Bypass**: Requires an explicit `--force` flag in `SYSTEM` mode, ensuring no accidental destructive actions.

### 5. Multi-Provider AI Integration
The `MODEL` mode supports hot-swapping between intelligence backends:
- **Offline Mode**: Rule-based diagnostic logic for zero-connectivity environments.
- **Ollama**: Local LLM integration (e.g., Llama 2) for privacy-focused, offline-capable deep analysis.
- **Gemini**: Cloud-based high-reasoning for complex system debugging and optimization suggestions.

## 🚀 Key Features
- **Real-time Performance Metrics**: Zero-overhead CPU/Memory tracking.
- **System Terminal (Ctrl+T / Cmd+T)**: Full interactive shell terminal for real-time command execution.
- **Headless WiFi Module**: Hardware-level scanning via `iw` and robust joining via `wpa_cli`.
- **Enhanced File Explorer**: Full access to the host filesystem (`/host`) with built-in text editor.
- **Advanced Battery Hub**: Deep battery analytics for edge devices (Voltage, Health, and Capacity).
- **Command Palette (Ctrl+K / Cmd+K)**: Instant access to whitelisted system tools.

## 🛠 Deployment (Optimized for Efficiency)
1. **Clone and Setup**:
   ```bash
   git clone -b aidash-ai-core https://github.com/lochanchugh/aidash.git
   cd aidash
   ```
2. **Start the Optimized Container**:
   ```bash
   docker-compose up -d --build
   ```

## 📝 Technical Specs
- **Backend**: Node.js 20 (Alpine)
- **Frontend**: Vanilla JS (Zero-Framework for RAM efficiency)
- **Metrics**: Direct Linux Kernel /proc parsing
- **AI**: Edge-based Anomaly Engine
