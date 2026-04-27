import { useEffect, useRef, useState } from 'react';
import { engine, EngineFrame } from '../engine/AntigravityEngine';

interface UseAntigravityProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onFrame: (frame: EngineFrame) => void;
  enabled: boolean;
}

export const useAntigravity = ({ videoRef, onFrame, enabled }: UseAntigravityProps) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const initEngine = async () => {
      try {
        await engine.initialize();
        if (active) {
          setIsInitialized(true);
          console.log('Antigravity Engine Initialized');
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to initialize engine');
          console.error('Antigravity Engine Error:', err);
        }
      }
    };

    initEngine();

    return () => {
      active = false;
      engine.stop();
    };
  }, []);

  useEffect(() => {
    if (isInitialized && enabled && videoRef.current) {
      engine.start(videoRef.current, onFrame);
    } else {
      engine.stop();
    }

    return () => engine.stop();
  }, [isInitialized, enabled, videoRef, onFrame]);

  return { isInitialized, error };
};
