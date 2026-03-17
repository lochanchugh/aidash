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

### 2. Edge Anomaly Engine (Predictive & Behavioral)
Moving from *threshold-based alerts* to *intelligent pattern-based detection*.
- **Local ML Inference**: A lightweight Moving Average model runs in the backend to "learn" your server's normal heartbeat.
- **Behavioral Fingerprinting**: The AI learns your command history. If a whitelisted command is run at an unusual time (e.g., `cat` at 3 AM), the **User-Behavior Analytics (UBA)** flags it.
- **Explainable AI (XAI)**: No "Black Box" metrics. The dashboard provides a human-readable **"Why?"** for every anomaly (e.g., *"CPU spike detected: 45% is significantly above the 10% baseline"*).
- **Proactive Interception**: Intercepts dangerous system states before hardware failure or security breaches occur.

### 4. Smart Safety Interceptor
A proactive security layer that sits between the user and the shell.
- **AI-Native Guard**: Intercepts high-risk commands (e.g., `rm -rf`, `mkfs`) based on a dynamically configurable danger list.
- **Alert Integration**: Every interception is logged to the Hero Terminal and the Security Hub.
- **Controlled Bypass**: Requires an explicit `--force` flag in `SYSTEM` mode, ensuring no accidental destructive actions.

### 6. Federated Fleet Commander
Designed for distributed edge clusters.
- **Node Adoption**: Centralized dashboard to "adopt" other AiDash edge nodes.
- **Unified Health View**: Real-time aggregated stats (Load, RAM, Status) for the entire fleet from a single interface.

### 7. XAI Audit & Transparency
Proving the AI isn't a "Black Box" for academic and professional review.
- **Mathematical Transparency**: View the moving baseline, Euclidean variance, and UBA pattern recognition states.
- **Audit Logs**: Human-readable explanations for every automated intervention.

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
