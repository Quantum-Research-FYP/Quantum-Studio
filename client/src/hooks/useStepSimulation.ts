import { useState, useCallback, useRef, useEffect } from 'react';
import { runStepper } from '../api/simulations';
import { generateStepperQiskitCode, type CircuitModel } from '../circuit';

export interface StepState {
  time: number;
  amplitudes: Record<string, { re: number; im: number }>;
}

export function useStepSimulation(circuit: CircuitModel) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [statevectors, setStatevectors] = useState<
    Record<string, Record<string, { re: number; im: number }>>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxStep =
    Math.max(0, ...circuit.operations.map((op) => op.time)) +
    (circuit.operations.length > 0 ? 1 : 0);

  // Playback timer ref
  const timerRef = useRef<number | null>(null);

  // Fetch stepper data when circuit changes
  useEffect(() => {
    let active = true;

    async function fetchStepper() {
      if (circuit.qubits === 0) {
        setStatevectors({});
        setCurrentStep(0);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const code = generateStepperQiskitCode(circuit);
        const response = await runStepper(code);
        if (active) {
          setStatevectors(response.statevectors);
          // Don't reset current step if it's still within bounds
          setCurrentStep((prev) => Math.min(prev, maxStep));
        }
      } catch (err) {
        if (active) {
          console.error('Failed to fetch stepper data:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch step simulation');
          // In case of error, just use empty states
          setStatevectors({});
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    // Debounce slightly to avoid spamming the backend during rapid edits
    const debounceTimer = setTimeout(fetchStepper, 500);

    return () => {
      active = false;
      clearTimeout(debounceTimer);
    };
  }, [circuit, maxStep]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (currentStep >= maxStep) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  }, [currentStep, maxStep]);

  const pause = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const stepForward = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, maxStep));
  }, [maxStep]);

  const stepBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // Handle auto-playback
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= maxStep) {
            stopPlayback();
            return prev;
          }
          return prev + 1;
        });
      }, 1000); // 1 second per step
    } else {
      stopPlayback();
    }

    return () => stopPlayback();
  }, [isPlaying, maxStep, stopPlayback]);

  const currentAmplitudes = statevectors[`step_${currentStep}`] || {};

  return {
    currentStep,
    maxStep,
    isPlaying,
    isLoading,
    error,
    currentAmplitudes,
    play,
    pause,
    stepForward,
    stepBack,
    setCurrentStep,
  };
}
