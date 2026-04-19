# AIDASH Design Model

## 1. System Vision

AIDASH is designed as an AI-native edge operating environment for headless systems. Its architecture combines telemetry, intelligence, control, safety, and recovery into one unified dashboard. The design goal is to move from passive monitoring to continuous observation, interpretation, protection, and action.

## 2. Architectural Principle

The system follows a layered control model:

`Sense -> Analyze -> Explain -> Protect -> Act -> Visualize`

This is the core logic of the platform:

- Sense system state continuously
- Analyze metrics and usage patterns
- Explain detected abnormal behavior
- Protect the system from unsafe actions
- Act through automated recovery or guided intervention
- Visualize all of this through one dashboard

## 3. High-Level Architecture

The overall design can be understood through six layers:

1. Presentation Layer
2. Control and Interaction Layer
3. Intelligence and Decision Layer
4. Security and Safety Layer
5. System Access and Data Layer
6. Persistence and Configuration Layer

## 4. Layer-Wise Design

### 4.1 Presentation Layer

This is the user-facing operating environment.

**Components**

- Dashboard UI
- Hero Terminal V2
- AI anomaly panel
- Process view
- File explorer
- WiFi and fleet panels
- Alerts and status indicators

**Responsibilities**

- Display live system state
- Show anomaly score, status, and human-readable reason
- Allow secure command execution
- Expose file operations and system visibility
- Present node and wireless information in a unified interface

**Design Role**

This layer turns raw backend state into an OS-like, operator-friendly control environment.

### 4.2 Control and Interaction Layer

This layer manages all user-triggered operations.

**Components**

- Command API
- File APIs
- WiFi APIs
- Node APIs
- Login and authentication flows
- Module toggles and system actions

**Responsibilities**

- Receive and validate dashboard requests
- Route actions to the correct subsystem
- Enforce control boundaries before execution
- Coordinate interaction between UI and backend logic

**Design Role**

Acts as the managed gateway between user interaction and low-level system functionality.

### 4.3 Intelligence and Decision Layer

This is the reasoning core of AIDASH.

**Components**

- Anomaly detection engine
- Rolling baseline history
- Command behavior learning
- Novelty scoring
- Explanation generator
- Alert classifier

**Responsibilities**

- Learn normal system behavior over time
- Compare live metrics against historical baselines
- Classify behavior into nominal, unusual, or critical states
- Identify suspicious command usage patterns
- Produce readable diagnostic reasoning
- Trigger decision outputs for alerts and recovery

**Design Role**

Converts system data into operational intelligence.

### 4.4 Security and Safety Layer

This layer protects both system state and user interaction.

**Components**

- Smart Safety Interceptor
- Whitelist enforcement
- Dangerous command detection
- Shadow Watcher for sensitive files
- Password and authentication logic

**Responsibilities**

- Block commands outside allowed scope
- Intercept destructive commands unless explicitly bypassed
- Monitor sensitive files for modification events
- Generate security alerts
- Reduce unsafe system interaction

**Design Role**

Provides a safety boundary between operator intent and system execution.

### 4.5 System Access and Data Layer

This layer interfaces directly with the operating system.

**Components**

- `/proc` metric readers
- `/sys` battery and thermal readers
- Process inspection commands
- Port and network inspection
- WiFi commands such as `iw`, `wpa_cli`, and `nmcli`
- Filesystem access functions

**Responsibilities**

- Collect CPU, memory, swap, process, battery, thermal, and network data
- Read active system state in real time
- Perform file and WiFi operations
- Execute validated shell commands
- Expose low-level data to higher layers

**Design Role**

Forms the bridge between the dashboard and the actual host machine.

### 4.6 Persistence and Configuration Layer

This layer stores learned state and runtime configuration.

**Components**

- Configuration JSON
- User store
- Command pattern store
- Server logs
- Node list

**Responsibilities**

- Persist user data and system configuration
- Store learned command behavior patterns
- Retain node discovery information
- Support lightweight operation without heavy databases

**Design Role**

Maintains continuity and low-overhead persistence.

## 5. Functional Flow Model

### 5.1 Monitoring Flow

1. Metrics are collected from Linux system interfaces.
2. CPU, memory, swap, process, battery, and WiFi data are normalized.
3. Current values are added to rolling history.
4. The anomaly engine compares current state against baseline behavior.
5. The system updates anomaly score, status, and explanation.
6. The dashboard reflects the new operational state in real time.

### 5.2 Intelligent Command Flow

1. The user enters a command in Hero Terminal.
2. The command passes through whitelist validation.
3. The command is checked for behavioral novelty.
4. The command is checked against dangerous command rules.
5. If safe, it is executed and learned as a future pattern.
6. If unsafe or unusual, it is intercepted and explained to the user.

### 5.3 Self-Healing Flow

1. A critical anomaly or extreme memory condition is detected.
2. The alert severity crosses the action threshold.
3. A recovery command is selected by reason category.
4. Recovery logic is executed automatically.
5. Completion or failure is logged as an alert.
6. The dashboard reflects the intervention status.

### 5.4 Security Monitoring Flow

1. Sensitive files are registered with the watcher.
2. File modification events are detected.
3. A security alert is generated.
4. The alert is pushed into dashboard state.
5. The operator can inspect and respond.

### 5.5 Federated Node Flow

1. A user adds a node through the dashboard.
2. Node data is stored in configuration.
3. The backend attempts remote statistics retrieval.
4. Node status is classified as online or unreachable.
5. Health summary is shown in the dashboard.

## 6. Core Design Modules

### 6.1 Telemetry Engine

- Direct system metric collection
- Low-overhead polling
- Rolling history maintenance
- Uptime and resource snapshots

### 6.2 Edge Anomaly Engine

- Baseline-driven anomaly scoring
- Deviation-based confidence estimation
- State classification
- Alert threshold handling

### 6.3 Explainability Engine

- Converts metric deviations into readable reasons
- Links anomaly scores to observable causes
- Supports user trust and interpretability

### 6.4 Hero Terminal Engine

- Shell execution interface
- Contextual monitoring
- Command learning
- Operator-facing execution channel

### 6.5 Safety Interceptor

- Whitelist enforcement
- Dangerous command interception
- User-facing warning and bypass mechanism

### 6.6 Recovery Engine

- Anomaly-triggered recovery selection
- Memory-pressure mitigation
- Automated corrective action execution

### 6.7 Security Shadow Watcher

- Integrity-style monitoring of sensitive files
- Immediate alert generation on change events

### 6.8 Edge Utility Services

- WiFi scan and connect
- File explorer operations
- Process visibility
- Node monitoring

## 7. Data Model Overview

### Input Data

- CPU usage
- Memory usage
- Swap usage
- Process count
- Uptime
- Battery state
- Thermal state
- WiFi state
- Active ports
- Command history patterns
- File modification events
- Node endpoints

### Derived Intelligence

- Anomaly score
- Anomaly status
- Explanation text
- Novelty score
- Alert severity
- Recovery trigger state
- Node reachability state

### Output State

- Dashboard metrics
- Alerts
- Terminal responses
- Explainable diagnostics
- Fleet summary
- WiFi availability
- File explorer state

## 8. Design Characteristics

### Unified

Monitoring, command execution, security, file access, and node visibility are exposed through one environment.

### Lightweight

The system uses native Node.js modules and flat-file persistence instead of heavy frameworks or databases.

### Explainable

The intelligence layer provides readable reasons rather than only silent scores.

### Protective

Commands and sensitive files are guarded through interceptors and watchers.

### Adaptive

The system responds to anomalies and memory pressure through automated logic.

### Edge-Oriented

The design is centered on headless Linux systems and constrained operational environments.

## 9. Professional Summary

AIDASH follows a layered, intelligence-driven design model in which system telemetry is continuously sensed, interpreted through lightweight anomaly logic, secured through command and file safeguards, and exposed through a unified OS-like dashboard that supports explainable, low-overhead, and partially autonomous edge operations.

## 10. Architecture Diagram Format

```text
                  AIDASH DESIGN MODEL

+-----------------------------------------------------------+
|                   PRESENTATION LAYER                      |
| Dashboard | Hero Terminal | XAI Panel | File Explorer     |
| Process View | WiFi Panel | Fleet View | Alerts           |
+-----------------------------------------------------------+
                          |
                          v
+-----------------------------------------------------------+
|              CONTROL AND INTERACTION LAYER                |
| Command API | File API | WiFi API | Node API | Auth       |
+-----------------------------------------------------------+
                          |
                          v
+-----------------------------------------------------------+
|             INTELLIGENCE AND DECISION LAYER               |
| Anomaly Engine | Baseline History | Behavior Learning     |
| Novelty Scoring | Explanation Generator | Alert Logic     |
+-----------------------------------------------------------+
                          |
                          v
+-----------------------------------------------------------+
|                SECURITY AND SAFETY LAYER                  |
| Safety Interceptor | Whitelist | Dangerous Cmd Guard      |
| Shadow Watcher | Security Alerts                          |
+-----------------------------------------------------------+
                          |
                          v
+-----------------------------------------------------------+
|               SYSTEM ACCESS AND DATA LAYER                |
| /proc | /sys | ps | ss | iw | wpa_cli | nmcli | FS        |
| Shell Execution | Process Data | Network Data             |
+-----------------------------------------------------------+
                          |
                          v
+-----------------------------------------------------------+
|            PERSISTENCE AND CONFIGURATION LAYER            |
| Config JSON | Users | Command Patterns | Logs | Nodes     |
+-----------------------------------------------------------+
```

## 11. Compact Slide Version

- **Input:** telemetry, commands, files, network, and nodes
- **Processing:** anomaly detection, behavior analysis, and explainability
- **Protection:** command interception and file monitoring
- **Action:** recovery, alerts, and controlled execution
- **Output:** unified edge dashboard
