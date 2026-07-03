# Quantum Experiment Studio

Build, run, and analyse quantum circuits in your browser. Features a fully-featured visual circuit builder, an advanced Q-Sphere state visualizer, and a VS Code-like Quantum IDE for Python and OpenQASM.

## Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10
- **Python** ≥ 3.9 (for the simulation service)
- **PostgreSQL** ≥ 15 (for authentication and session storage)

## Getting Started

Follow these steps to run all three services concurrently in development mode.

### 1. Client & Server (Node Services)

```bash
# 1. Clone the repository and navigate to the project root
git clone <repo-url> && cd quantum-experiment-studio

# 2. Install dependencies (uses npm workspaces)
npm install

# 3. Copy the environment template and edit as needed
cp .env.example .env

# 4. Start both client and server in development mode
# This will run the Vite frontend on :5173 and Express backend on :3001
npm run dev
```

### 2. Simulation Service (Python Backend)

In a **new terminal window**, start the Python simulation service:

```bash
# 1. Navigate to the simulation service directory
cd simulation-service

# 2. Set up your Python virtual environment (if you haven't already)
python3 -m venv .venv

# 3. Activate the virtual environment
# On macOS/Linux:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# 4. Install requirements
pip install -r requirements.txt

# 5. Start the FastAPI server on port 8000
uvicorn main:app --port 8000 --reload
```

## Services Overview

| Service              | Technology             | URL                   |
| -------------------- | ---------------------- | --------------------- |
| **Client**           | React (Vite)           | http://localhost:5173 |
| **Server**           | Node.js / Express      | http://localhost:3001 |
| **Simulation API**   | Python / FastAPI       | http://localhost:8000 |

*Note: The Vite dev server automatically proxies `/api` requests to the Node backend. The Node backend communicates internally with the Simulation API on port `8000`.*

## Features

- **Visual Circuit Builder**: Drag and drop gates to build quantum circuits visually.
- **Multi-Framework Export**: Export your visual circuits seamlessly to Qiskit, Cirq, PennyLane, Amazon Braket, TKET, or OpenQASM.
- **Quantum IDE**: A fully featured VS Code-style IDE in your browser (powered by Monaco Editor). Write and execute Python (Qiskit) or OpenQASM directly. Features syntax highlighting, error squiggles, and integrated execution terminals.
- **State Visualization**: Step through circuits time-slice by time-slice and visualize the amplitude state vectors on a dynamic Q-Sphere.

## Project Structure

```
├── client/              # React + TypeScript SPA (Vite)
├── server/              # Node.js + TypeScript API (Express)
├── simulation-service/  # Python + FastAPI (Qiskit execution engine)
├── .env.example         # Environment variable template
├── eslint.config.mjs    # Shared ESLint configuration
├── tsconfig.base.json   # Shared TypeScript base config
└── package.json         # Root workspace configuration
```

## Environment Variables

See [`.env.example`](.env.example) for all available variables and their defaults.
