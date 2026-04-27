import { useState, useEffect, useCallback, useRef } from 'react';

export interface Alert {
  id: string;
  timestamp: string;
  message: string;
}

export const useMirrorBreaker = () => {
  const [score, setScore] = useState<number>(100);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alertsRef = useRef<Alert[]>([]);

  // Update alerts ref whenever alerts state changes
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const addAlert = useCallback((message: string) => {
    const newAlert: Alert = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      message,
    };
    setAlerts((prev) => [...prev, newAlert]);
  }, []);

  useEffect(() => {
    // Expose global update function
    (window as any).updateUI = (newScore: number, newAlertMessages: string[]) => {
      setScore(Math.min(100, Math.max(0, newScore)));
      if (newAlertMessages && newAlertMessages.length > 0) {
        newAlertMessages.forEach(msg => addAlert(msg));
      }
    };

    // Cleanup
    return () => {
      delete (window as any).updateUI;
    };
  }, [addAlert]);

  const downloadReport = useCallback(() => {
    const report = {
      title: "MirrorBreaker Forensic Report",
      generatedAt: new Date().toISOString(),
      finalTrustScore: score,
      eventLog: alertsRef.current,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Forensic_Report_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [score]);

  return {
    score,
    alerts,
    downloadReport,
  };
};
