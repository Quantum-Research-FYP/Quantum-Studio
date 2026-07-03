import React from 'react';

interface PlaybackControlsProps {
  currentStep: number;
  maxStep: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onSeek: (step: number) => void;
}

export default function PlaybackControls({
  currentStep,
  maxStep,
  isPlaying,
  onPlay,
  onPause,
  onStepForward,
  onStepBack,
  onSeek,
}: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <div className="playback-controls__buttons">
        <button
          className="playback-controls__btn"
          onClick={onStepBack}
          disabled={currentStep === 0}
          title="Step Back"
        >
          ⏮
        </button>
        {isPlaying ? (
          <button className="playback-controls__btn" onClick={onPause} title="Pause">
            ⏸
          </button>
        ) : (
          <button className="playback-controls__btn" onClick={onPlay} title="Play">
            ▶️
          </button>
        )}
        <button
          className="playback-controls__btn"
          onClick={onStepForward}
          disabled={currentStep >= maxStep}
          title="Step Forward"
        >
          ⏭
        </button>
      </div>

      <div className="playback-controls__timeline">
        <label htmlFor="step-slider" className="playback-controls__label">
          Step {currentStep} / {maxStep}
        </label>
        <input
          id="step-slider"
          type="range"
          min={0}
          max={maxStep}
          value={currentStep}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          className="playback-controls__slider"
        />
      </div>
    </div>
  );
}
