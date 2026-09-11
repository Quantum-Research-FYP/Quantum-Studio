import React, { createContext, useContext, useState, useEffect } from 'react';
import { Joyride, CallBackProps, STATUS, TooltipRenderProps } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';
import { tourSteps } from './tourSteps';

interface UserGuideContextType {
  startTour: () => void;
}

const UserGuideContext = createContext<UserGuideContextType | undefined>(undefined);

export const useUserGuide = () => {
  const context = useContext(UserGuideContext);
  if (!context) {
    throw new Error('useUserGuide must be used within a UserGuideProvider');
  }
  return context;
};

const CustomTooltip = ({
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: TooltipRenderProps) => {
  return (
    <div
      {...tooltipProps}
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg, 12px)',
        boxShadow: 'var(--shadow-lg)',
        padding: '24px',
        maxWidth: '380px',
        color: 'var(--color-text)',
      }}
    >
      {step.title && (
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)' }}>
          {step.title}
        </h3>
      )}
      <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
        {step.content}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontWeight: 500 }}>
          {index + 1} of {size}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isLastStep && (
            <button className="btn btn--ghost btn--sm" {...skipProps}>
              Skip
            </button>
          )}
          {index > 0 && (
            <button className="btn btn--ghost btn--sm" {...backProps}>
              Back
            </button>
          )}
          <button className="btn btn--primary btn--sm" {...primaryProps}>
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const UserGuideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [run, setRun] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const startTour = () => {
    // If the sidebar is collapsed, we might want to expand it, but for now we just start the tour
    setRun(true);
  };

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem('hasSeenTour', 'true');
    }
  };

  return (
    <UserGuideContext.Provider value={{ startTour }}>
      <Joyride
        callback={handleJoyrideCallback}
        continuous
        hideCloseButton
        run={run}
        scrollToFirstStep
        showProgress
        showSkipButton
        steps={tourSteps}
        tooltipComponent={CustomTooltip}
        styles={{
          options: {
            zIndex: 10000,
          },
        }}
      />
      {children}
    </UserGuideContext.Provider>
  );
};
