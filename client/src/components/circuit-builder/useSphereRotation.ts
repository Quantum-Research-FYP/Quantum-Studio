import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

interface Rotation {
  x: number;
  y: number;
}

const MIN_TILT = -Math.PI / 2;
const MAX_TILT = Math.PI / 2;
const DRAG_RADIANS_PER_PIXEL = 0.009;

/** Frame-synchronised rotation controls shared by the 3D state visualisers. */
export function useSphereRotation(initialRotation: Rotation) {
  const [rotation, setRotation] = useState(initialRotation);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const pendingDeltaRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  const applyPendingRotation = useCallback(() => {
    animationFrameRef.current = null;
    const delta = pendingDeltaRef.current;
    pendingDeltaRef.current = { x: 0, y: 0 };

    if (delta.x === 0 && delta.y === 0) return;
    setRotation((previous) => ({
      x: Math.max(
        MIN_TILT,
        Math.min(MAX_TILT, previous.x - delta.y * DRAG_RADIANS_PER_PIXEL),
      ),
      y: previous.y + delta.x * DRAG_RADIANS_PER_PIXEL,
    }));
  }, []);

  const scheduleRotation = useCallback(() => {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(applyPendingRotation);
    }
  }, [applyPendingRotation]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    draggingRef.current = true;
    activePointerRef.current = event.pointerId;
    lastPositionRef.current = { x: event.clientX, y: event.clientY };
    pendingDeltaRef.current = { x: 0, y: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current || activePointerRef.current !== event.pointerId) return;
      event.preventDefault();

      pendingDeltaRef.current.x += event.clientX - lastPositionRef.current.x;
      pendingDeltaRef.current.y += event.clientY - lastPositionRef.current.y;
      lastPositionRef.current = { x: event.clientX, y: event.clientY };
      scheduleRotation();
    },
    [scheduleRotation],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (activePointerRef.current !== event.pointerId) return;
      applyPendingRotation();
      draggingRef.current = false;
      activePointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsDragging(false);
    },
    [applyPendingRotation],
  );

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    },
    [],
  );

  return {
    rotation,
    isDragging,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
    },
  };
}
