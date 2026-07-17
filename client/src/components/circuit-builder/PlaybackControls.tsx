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

const IconPlay = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M6 4l14 8-14 8V4z" />
  </svg>
);

const IconPause = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const IconStepBack = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M18 20L8 12l10-8v16zM4 19V5h3v14H4z" />
  </svg>
);

const IconStepForward = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M6 4l10 8-10 8V4zm11-1v14h3V3h-3z" />
  </svg>
);

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
          aria-label="Step Back"
        >
          <IconStepBack />
        </button>
        {isPlaying ? (
          <button className="playback-controls__btn" onClick={onPause} title="Pause" aria-label="Pause">
            <IconPause />
          </button>
        ) : (
          <button className="playback-controls__btn" onClick={onPlay} title="Play" aria-label="Play">
            <IconPlay />
          </button>
        )}
        <button
          className="playback-controls__btn"
          onClick={onStepForward}
          disabled={currentStep >= maxStep}
          title="Step Forward"
          aria-label="Step Forward"
        >
          <IconStepForward />
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
