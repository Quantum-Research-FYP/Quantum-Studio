import ProbabilityBarChart from './ProbabilityBarChart';
import QSphere from './QSphere';
import PlaybackControls from './PlaybackControls';
import { type CircuitModel } from '../../circuit';
import { useStepSimulation } from '../../hooks/useStepSimulation';

interface StateVisualizerProps {
  currentStep: number;
  maxStep: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentAmplitudes: Record<string, { re: number; im: number }>;
  circuitQubits: number;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onSeek: (step: number) => void;
}

export default function StateVisualizer({
  currentStep,
  maxStep,
  isPlaying,
  isLoading,
  error,
  currentAmplitudes,
  circuitQubits,
  onPlay,
  onPause,
  onStepForward,
  onStepBack,
  onSeek,
}: StateVisualizerProps) {
  return (
    <div className="state-visualizer">
      <div className="state-visualizer__header">
        <h3>Step-by-step Execution</h3>
        {isLoading && <span className="state-visualizer__loading">Calculating...</span>}
      </div>
      
      {error && <div className="state-visualizer__error">{error}</div>}

      <div className="state-visualizer__content">
        <PlaybackControls
          currentStep={currentStep}
          maxStep={maxStep}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onStepForward={onStepForward}
          onStepBack={onStepBack}
          onSeek={onSeek}
        />

        <div className="state-visualizer__charts">
          <ProbabilityBarChart amplitudes={currentAmplitudes} />
          <QSphere amplitudes={currentAmplitudes} qubitCount={circuitQubits} />
        </div>
      </div>
    </div>
  );
}
