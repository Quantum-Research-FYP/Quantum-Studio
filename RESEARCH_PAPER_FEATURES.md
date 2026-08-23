# Quantum Experiment Studio: System Architecture & Feature Reference

> **Academic & Research Reference Manual**  
> _A Comprehensive Feature Reference and Technical Specification for Quantum Circuit Design, IDE Simulation, Hardware Execution, Visual Diagnostics, and Research Paper Publication._

---

## Executive Feature Summary

```
+---------------------------------------------------------------------------------------------------+
|                                     QUANTUM EXPERIMENT STUDIO                                     |
+---------------------------------------------------------------------------------------------------+
|  1. VISUAL CIRCUIT BUILDER           2. BROWSER QUANTUM IDE           3. STARTER TEMPLATES        |
|  - Drag & Drop Timeline Grid         - VS Code-style Monaco/CodeMirror - Bell State               |
|  - 6-Framework Code Exporter         - Backend Selector (Simulator /  - Grover's 2-Qubit Search   |
|    (Qiskit, Cirq, PennyLane,           Real IBM QPU Hardware)         - Quantum Teleportation     |
|     TKET, Braket, OpenQASM 3)        - Parameterized Noise Panel      - Deutsch-Jozsa Algorithm   |
|  - Real-Time Circuit Statistics      - Output Terminal & Live 3D      - GHZ State                 |
|  - Step-by-Step Stepper & 3D           Visualizer Sync                - Quantum Fourier Transform |
|    Rotatable Q-Sphere & Bloch                                                                     |
+---------------------------------------------------------------------------------------------------+
|  4. AI CIRCUIT SYNTHESIS             5. EXPERIMENT PERSISTENCE        6. SYSTEM ARCHITECTURE      |
|  - Natural Language Draft Generator  - Mongo DB Persistence           - React 18 + Vite SPA       |
|  - Deterministic Safety Validator    - Cryptographic 192-bit Sharing  - Node.js Express API        |
|  - Immutable Provenance Tracking     - AES-256 Hardware Encryptor     - FastAPI Qiskit Engine     |
+---------------------------------------------------------------------------------------------------+
```

---

## Table of Contents

- [1. Visual Quantum Circuit Builder Engine](#1-visual-quantum-circuit-builder-engine)
  - [1.1 Drag-and-Drop & Click-to-Place Circuit Canvas](#11-drag-and-drop--click-to-place-circuit-canvas)
  - [1.2 Multi-Framework Code Converter (6 Frameworks)](#12-multi-framework-code-converter-6-frameworks)
  - [1.3 Circuit Statistics & Real-Time Profiler](#13-circuit-statistics--real-time-profiler)
  - [1.4 Step-by-Step Execution Stepper with Rotatable 3D Q-Sphere & Visualizers](#14-step-by-step-execution-stepper-with-rotatable-3d-q-sphere--visualizers)
- [2. Browser-Based Quantum IDE (VS Code Experience)](#2-browser-based-quantum-ide-vs-code-experience)
  - [2.1 VS Code-Style Editor & File System](#21-vs-code-style-editor--file-system)
  - [2.2 Execution Backend Selection (Simulator vs. Real IBM QPU)](#22-execution-backend-selection-simulator-vs-real-ibm-qpu)
  - [2.3 Parameterized Noise Simulator Panel](#23-parameterized-noise-simulator-panel)
  - [2.4 Integrated Output Terminal & Live Visualizer Sync](#24-integrated-output-terminal--live-visualizer-sync)
- [3. Interactive Starter Templates & Educational Modules](#3-interactive-starter-templates--educational-modules)
- [4. AI-Assisted Circuit Synthesis & Provenance Tracking](#4-ai-assisted-circuit-synthesis--provenance-tracking)
- [5. Experiment Management, Security, & System Architecture](#5-experiment-management-security--system-architecture)
- [6. Environment Variables, API Routes & Deployment](#6-environment-variables-api-routes--deployment)

---

## 1. Visual Quantum Circuit Builder Engine

### 1.1 Drag-and-Drop & Click-to-Place Circuit Canvas

- **Interactive Multi-Qubit Timeline**: A drag-and-drop timeline grid allowing users to visually position, arrange, reorder, or delete quantum gates across configurable qubit wires ($N \ge 1$) and classical registers.
- **Complete Gate Library**:
  - **Single-Qubit Gates**: Hadamard ($H$), Pauli-X ($X$), Pauli-Y ($Y$), Pauli-Z ($Z$), Phase ($S$), $S^\dagger$ ($SDG$), $\pi/8$ ($T$), $T^\dagger$ ($TDG$), Square-Root X ($SX$), $SX^\dagger$ ($SXDG$), Identity ($ID$).
  - **Parametric Single-Qubit Gates**: Rotation-X ($RX(\theta)$), Rotation-Y ($RY(\theta)$), Rotation-Z ($RZ(\theta)$), Phase Shift ($P(\lambda)$), Universal Gate ($U(\theta, \phi, \lambda)$) with mathematical expression parsing (`pi`, `pi/2`, `3*pi/4`, `-pi/4`).
  - **Two-Qubit Gates**: Controlled-NOT ($CX$), Controlled-Y ($CY$), Controlled-Z ($CZ$), Controlled-Hadamard ($CH$), Swap ($SWAP$), Controlled-RX ($CRX(\theta)$), Controlled-RY ($CRY(\theta)$), Controlled-RZ ($CRZ(\theta)$), Controlled-Phase ($CP(\lambda)$).
  - **Three-Qubit Gates**: Toffoli ($CCX$), Fredkin ($CSWAP$).
  - **Measurement & Reset**: Classical register projection ($MEASURE$) and state initialization ($RESET$).

### 1.2 Multi-Framework Code Converter (6 Frameworks)

Allows users to instantly convert any visually designed quantum circuit into clean, executable code across six major industry frameworks via a dropdown selector:

1. **Qiskit (Python)**: Generates complete Qiskit Python scripts using `QuantumCircuit`, `AerSimulator`, gate parameters, and result execution prints.
2. **Google Cirq**: Converts circuit models into Google Cirq Python code utilizing `cirq.LineQubit` and `cirq.Circuit`.
3. **Xanadu PennyLane**: Generates PennyLane variational/photonic code decorated with `@qml.qnode`.
4. **Quantinuum TKET**: Converts circuits to `pytket.Circuit` code for optimization on Quantinuum compiler pipelines.
5. **Amazon Braket Python SDK**: Generates AWS Braket SDK code using `braket.circuits.Circuit`.
6. **OpenQASM 2.0 & OpenQASM 3.0**: Exports standard OpenQASM files with register declarations (`qreg`, `creg`), include statements, and gate calls.

### 1.3 Circuit Statistics & Real-Time Profiler

Provides live analytical metrics computed directly from the circuit model (`CircuitProfilerPanel.tsx`):

- **Circuit Depth**: The longest computational path through the gate dependency graph.
- **Total Gate Count**: Sum total of all placed single, double, and triple-qubit operations.
- **T-Gate Count**: Number of non-Clifford $T$ and $T^\dagger$ gates (critical for fault-tolerant quantum resource estimation).
- **2-Qubit (CNOT) Gate Count**: Count of multi-qubit entangling operations.
- **Quantum Volume Estimate**: Upper bound computational complexity estimate based on width and depth.
- **Static Validation Warnings**: Real-time detection of out-of-bounds wires, disconnected multi-qubit controls, floating gates, or classical register collisions.

### 1.4 Step-by-Step Execution Stepper with Rotatable 3D Q-Sphere & Visualizers

- **Time-Travel Execution Stepper**: Interactive playback controls (`PlaybackControls.tsx`) that allow users to step forward and backward time-slice by time-slice through the circuit execution history to inspect state evolution after every individual gate.
- **Interactive 3D Rotatable Q-Sphere (`QSphere.tsx`)**:
  - Renders multi-qubit statevectors on an interactive 3D sphere that users can **mouse-rotate, tilt, and inspect from any angle**.
  - Basis states $|j\rangle$ are positioned on latitude rings indexed by binary **Hamming weight** ($|0\dots0\rangle$ at North Pole, $|1\dots1\rangle$ at South Pole).
  - Node radii represent probability amplitudes $|c_j|^2$; node colors map phase angles $\arg(c_j)$ across a continuous 360° color wheel.
- **3D Single-Qubit Bloch Sphere (`BlochSphere.tsx`)**: Interactive vector representation of single-qubit states on the Bloch sphere ($x = \sin\theta\cos\phi, y = \sin\theta\sin\phi, z = \cos\theta$).
- **Reduced Density Matrix Multi-Bloch Panel (`MultiBlochPanel.tsx`)**: Displays $N$ separate Bloch spheres showing reduced density matrices $\rho_k = \text{Tr}_{\overline{k}}(|\psi\rangle\langle\psi|)$ to visualize individual qubit entanglement purity ($|\vec{r}_k| < 1$).
- **Dirac (Bra-Ket) State Formatter (`DiracNotation.tsx`)**: Renders quantum statevectors into symbolic latex bra-ket notation (e.g., $|\psi\rangle = \frac{1}{\sqrt{2}}|00\rangle + \frac{1}{\sqrt{2}}|11\rangle$).
- **Measurement Probability Histogram (`ProbabilityBarChart.tsx`)**: Dynamic bar chart showing computational basis measurement probabilities $P(j) = |c_j|^2$ with bitstring labels.

---

## 2. Browser-Based Quantum IDE (VS Code Experience)

### 2.1 VS Code-Style Editor & File System

- **Monaco / CodeMirror IDE Environment**: A full-featured VS Code-style development environment (`IdePage.tsx`) supporting both **OpenQASM 2/3** and **Qiskit Python** code editing.
- **OpenQASM Custom Language Server (`qasm-language.ts`)**: Custom syntax highlighting, tokenization, auto-completion, hover docs, and line diagnostic error squiggles.
- **Virtual File System & Tabbed Workspace**: Built-in tree-view File Explorer (`FileExplorer.tsx`), multi-tab file editor (`EditorPanel.tsx`), file creation, renaming, deleting, and local disk upload/download.

### 2.2 Execution Backend Selection (Simulator vs. Real IBM QPU)

Integrated selector panel allowing users to choose where their quantum program executes:

1. **Local High-Performance Simulator**: Executes on `qiskit_aer.AerSimulator` (or basic simulator fallback) for fast statevector and shot-based simulation.
2. **Real Physical IBM QPU Hardware**: Direct execution on real superconducting quantum processors via IBM Quantum Runtime Service (Sampler V2):
   - **Supported Hardware Backends**: `ibm_brisbane`, `ibm_osaka`, `ibm_kyoto`, `ibm_sherbrooke`, `ibm_nazca`, `ibm_hanoi`, `ibm_cairo` (Eagle 127q), `ibm_torino` (Heron 133q), `ibm_fez`, `ibm_kingston`, `ibm_marrakesh`, `ibm_strasbourg` (Heron 156q).
   - **Per-QPU ISA Transpilation (`/transpile-ibm`)**: Converts circuits to target QPU native basis gates (`ecr` for Eagle, `cz` for Heron) using exact physical coupling maps cached for 5 minutes.

### 2.3 Parameterized Noise Simulator Panel

Dedicated noise simulation panel enabling realistic hardware error modeling during simulation:

- **8 Configurable Noise Channels**:
  1. Depolarizing Error (1-qubit, 2-qubit CX, 3-qubit CCX)
  2. Bit-Flip Error ($X$)
  3. Phase-Flip Error ($Z$)
  4. Amplitude Damping ($\gamma$)
  5. Phase Damping ($\lambda$)
  6. Readout Error ($2 \times 2$ confusion matrix)
  7. Inter-Qubit Crosstalk
  8. Thermal Relaxation ($T_1, T_2, t_{\text{gate}}$)
- **State Fidelity & Diagnostic Metrics (`POST /analyze`)**:
  - **Bhattacharyya Quantum State Fidelity**: $F(P, Q) = \sum \sqrt{P(j) \cdot Q(j)}$ comparing ideal vs. noisy outputs.
  - **Error Budget Attribution**: Percentage breakdown of which noise channel caused fidelity degradation.
  - **Monte Carlo Noise Sweeps**: Automated noise scaling ($0.0\times$ to $2.0\times$) to plot fidelity decay curves.

### 2.4 Integrated Output Terminal & Live Visualizer Sync

- **Integrated Terminal Console**: Displays standard output logs, shot counts, JSON response payloads, and compilation stack traces after running circuits.
- **Live Statevector Visualizer Sync**: Running code in the IDE automatically parses output statevectors and updates the 3D Q-Sphere, Bloch Sphere, and Probability Histogram in real-time.

---

## 3. Interactive Starter Templates & Educational Modules

Built-in pre-configured quantum algorithm templates (`client/src/templates/`) that users can load with one click to run, step through, and learn:

1. **Bell State ($|\Phi^+\rangle$)**: 2-qubit maximally entangled Bell state demonstrating quantum entanglement creation.
2. **Grover's 2-Qubit Search Algorithm**: Complete Grover search circuit showing quantum phase oracle and diffusion amplification.
3. **Quantum Teleportation Protocol**: 3-qubit protocol demonstrating quantum state transmission via shared entanglement and classical correction gates.
4. **Deutsch-Jozsa Algorithm**: Deterministic single-query evaluation of constant vs. balanced Boolean functions.
5. **GHZ State ($|GHZ_3\rangle$)**: 3-qubit Greenberger–Horne–Zeilinger tripartite entangled state $\frac{1}{\sqrt{2}}(|000\rangle + |111\rangle)$.
6. **Quantum Fourier Transform (QFT)**: Starter circuit demonstrating quantum phase rotation and frequency decomposition.

---

## 4. AI-Assisted Circuit Synthesis & Provenance Tracking

- **Natural Language Prompt-to-Circuit Draft Generator (`POST /api/ai/draft`)**: Converts natural language requests (e.g., _"Build a 3-qubit GHZ circuit"_) into structured `CircuitModel` JSON, code, and explanations.
- **Deterministic Safety Validator (`POST /api/ai/validate`)**: Gate allowlist enforcement ($H, X, Y, Z, S, T, CX, MEASURE$) and syntax sanity checks.
- **AI Provenance Audit Trail**: Immutable tracking of `ai_assisted` flag, provider, model name, timestamp, and SHA-256 code hash, with user opt-in privacy sharing controls (`ai_share_provenance`).

---

## 5. Experiment Management, Security, & System Architecture

- **Experiment Persistence**: Mongo-backed repository with optimistic locking via `rowVersion`, deferred schema migration, and soft-deletions.
- **Cryptographic Link Sharing**: 192-bit base64url random share tokens stored exclusively as SHA-256 hashes with privacy controls (`private`, `unlisted`, `public`) and revocation audit logs.
- **Security & Sandboxing**: Argon2id password hashing, HttpOnly secure cookie sessions, AES-256-GCM encryption for IBM hardware tokens (`IBM_QUANTUM_ENCRYPTION_KEY`), and restricted Python AST execution sandbox.

---

## 6. Environment Variables, API Routes & Deployment

### Core Microservices

```
Quantum-Studio/
├── client/              # React 18 + TypeScript SPA (Port 5173)
├── server/              # Node.js + Express Core API Gateway (Port 3001)
├── simulation-service/  # Python + FastAPI Qiskit Simulation Engine (Port 8000)
└── docker-compose.yml   # Multi-container orchestration
```

### Local Setup & Docker

```bash
# Development Mode
npm install
npm run dev

# Docker Deployment
docker-compose up --build -d
```

---

_This document serves as the formal feature reference and technical specification manual for Quantum Experiment Studio._
