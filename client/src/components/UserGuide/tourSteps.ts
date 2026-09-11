import { Step } from 'react-joyride';

export const tourSteps: Step[] = [
  {
    target: 'body',
    placement: 'center',
    content: 'Welcome to Quantum Studio! Let us give you a quick tour of the platform and its features.',
    disableBeacon: true,
  },
  {
    target: '.sidebar-nav-link[href="/create"]',
    content: "Start here! Create a new quantum circuit or browse templates from the home dashboard.",
    placement: 'right',
  },
  {
    target: '.sidebar-nav-link[href="/builder"]',
    content: 'Use the Visual Builder to drag and drop quantum gates and intuitively construct your circuit without writing code.',
    placement: 'right',
  },
  {
    target: '.sidebar-nav-link[href="/ide"]',
    content: 'Are you a power user? Switch to the Code IDE to write raw Qiskit, OpenQASM, or PennyLane scripts.',
    placement: 'right',
  },
  {
    target: '.sidebar-nav-link[href="/results"]',
    content: 'After running a circuit, check your Run History here to view statevectors, probabilities, and execution metrics.',
    placement: 'right',
  },
  {
    target: '.sidebar-nav-link[href="/templates"]',
    content: "Browse the Library for pre-built algorithms like Grover's or Shor's to jumpstart your research.",
    placement: 'right',
  }
];
