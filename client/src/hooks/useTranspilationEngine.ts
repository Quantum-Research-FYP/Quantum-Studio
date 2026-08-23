/**
 * useTranspilationEngine.ts
 *
 * State machine for the Transparent Transpilation Engine.
 * Fetches pass-by-pass trace from the backend, parses QASM snapshots
 * into CircuitModel, computes diffs, and manages playback state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateOpenQasm } from '../circuit';
import type { CircuitModel } from '../circuit';
import type { TranspileTraceResponse, TranspileStageSummary, TranspilePassTrace } from '../api/simulations';
import { getTranspileTrace } from '../api/simulations';
import { qasmToCircuitModel } from '../circuit/qasmToCircuitModel';
import { computeCircuitDiff } from '../circuit/circuitDiff';
import type { CircuitDiff } from '../circuit/circuitDiff';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FlatPass {
  stageIndex: number;
  stageName: string;
  passIndex: number;           // index within stage
  globalIndex: number;         // index across all passes
  pass: TranspilePassTrace;
  inputCircuit: CircuitModel;
  outputCircuit: CircuitModel;
  diff: CircuitDiff;
}

export interface TranspilationEngineState {
  status: EngineStatus;
  error: string | null;
  trace: TranspileTraceResponse | null;
  flatPasses: FlatPass[];
  selectedGlobalIndex: number;
  isPlaying: boolean;
  originalCircuit: CircuitModel;
  selectedPass: FlatPass | null;
}

export interface TranspilationEngineActions {
  run: () => void;
  selectPass: (globalIndex: number) => void;
  nextPass: () => void;
  prevPass: () => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  jumpToStage: (stageIndex: number) => void;
}

const STAGE_ORDER = ['Analysis', 'Optimization', 'Translation', 'Mapping', 'Routing', 'Scheduling'];

function flattenPasses(
  stages: TranspileStageSummary[],
  originalQasm: string
): FlatPass[] {
  const flat: FlatPass[] = [];

  // The "before" circuit for the very first pass is the original circuit
  let prevQasm = originalQasm;
  let globalIndex = 0;

  for (let si = 0; si < stages.length; si++) {
    const stage = stages[si];
    for (let pi = 0; pi < stage.passes.length; pi++) {
      const pass = stage.passes[pi];

      const inputCircuit = qasmToCircuitModel(prevQasm);
      const outputCircuit = qasmToCircuitModel(pass.qasm || prevQasm);
      const diff = computeCircuitDiff(inputCircuit, outputCircuit);

      flat.push({
        stageIndex: si,
        stageName: stage.stageName,
        passIndex: pi,
        globalIndex,
        pass,
        inputCircuit,
        outputCircuit,
        diff,
      });

      prevQasm = pass.qasm || prevQasm;
      globalIndex++;
    }
  }

  return flat;
}

export function useTranspilationEngine(
  circuit: CircuitModel,
  isOpen: boolean
): TranspilationEngineState & TranspilationEngineActions {
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TranspileTraceResponse | null>(null);
  const [flatPasses, setFlatPasses] = useState<FlatPass[]>([]);
  const [selectedGlobalIndex, setSelectedGlobalIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [originalCircuit, setOriginalCircuit] = useState<CircuitModel>(circuit);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      setStatus('idle');
      setError(null);
      setTrace(null);
      setFlatPasses([]);
      setSelectedGlobalIndex(0);
      setIsPlaying(false);
    }
  }, [isOpen]);

  const run = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setTrace(null);
    setFlatPasses([]);
    setSelectedGlobalIndex(0);
    setIsPlaying(false);
    setOriginalCircuit(circuit);

    const qasm = generateOpenQasm(circuit);
    if (!qasm) {
      setError('Circuit is empty or cannot generate QASM.');
      setStatus('error');
      return;
    }

    try {
      const result = await getTranspileTrace({
        qasm,
        mode: 'qasm',
        backend: 'ibm_brisbane',
        optimizationLevel: 1,
      });

      // Filter out empty stages, keep only ones with passes
      const nonEmptyStages = result.stages.filter(s => s.passes.length > 0);
      const fullResult = { ...result, stages: nonEmptyStages };

      const flat = flattenPasses(nonEmptyStages, result.originalQasm);
      setTrace(fullResult);
      setFlatPasses(flat);
      setSelectedGlobalIndex(0);
      setStatus('ready');
    } catch (err: any) {
      setError(err?.message ?? 'Transpilation trace failed.');
      setStatus('error');
    }
  }, [circuit]);

  // Auto-run when opened
  useEffect(() => {
    if (isOpen && status === 'idle') {
      run();
    }
  }, [isOpen, status, run]);

  // Playback
  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (flatPasses.length === 0) return;
    setIsPlaying(true);
    playIntervalRef.current = setInterval(() => {
      setSelectedGlobalIndex(prev => {
        if (prev >= flatPasses.length - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, 1800);
  }, [flatPasses.length, stopPlayback]);

  const pause = useCallback(() => stopPlayback(), [stopPlayback]);

  const selectPass = useCallback((idx: number) => {
    stopPlayback();
    setSelectedGlobalIndex(Math.max(0, Math.min(idx, flatPasses.length - 1)));
  }, [flatPasses.length, stopPlayback]);

  const nextPass = useCallback(() => {
    setSelectedGlobalIndex(prev => Math.min(prev + 1, flatPasses.length - 1));
  }, [flatPasses.length]);

  const prevPass = useCallback(() => {
    setSelectedGlobalIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const reset = useCallback(() => {
    stopPlayback();
    setSelectedGlobalIndex(0);
  }, [stopPlayback]);

  const jumpToStage = useCallback((stageIndex: number) => {
    const fp = flatPasses.find(p => p.stageIndex === stageIndex);
    if (fp) selectPass(fp.globalIndex);
  }, [flatPasses, selectPass]);

  const selectedPass = flatPasses[selectedGlobalIndex] ?? null;

  return {
    status, error, trace, flatPasses, selectedGlobalIndex,
    isPlaying, originalCircuit, selectedPass,
    run, selectPass, nextPass, prevPass, play, pause, reset, jumpToStage,
  };
}
