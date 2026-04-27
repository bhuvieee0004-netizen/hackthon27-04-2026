import React, { useMemo } from 'react';
import { useMirrorBreaker } from './hooks/useMirrorBreaker';
import { Download, Terminal, Shield, AlertTriangle, Cpu, Activity, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TrustMeter = ({ score }: { score: number }) => {
  // SVG constants
  const radius = 40;
  const circumference = Math.PI * radius; // Half circle
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const color = useMemo(() => {
    if (score > 70) return '#22c55e'; // Green
    if (score > 40) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  }, [score]);

  return (
    <div className="relative flex flex-col items-center justify-center pt-4">
      <svg width="120" height="70" viewBox="0 0 100 60" className="transform -rotate-0">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {/* Background track */}
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="#1e293b"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Progress path */}
        <motion.path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{
            filter: 'url(#glow)',
          }}
        />
        {/* Decorative inner glow */}
        <path
           d="M 15 50 A 35 35 0 0 1 85 50"
           fill="none"
           stroke={color}
           strokeWidth="1"
           opacity="0.3"
           className="animate-pulse"
        />
      </svg>
      <div className="absolute top-[35px] flex flex-col items-center">
        <span className="text-2xl font-bold font-mono neon-text-cyan" style={{ color: score < 40 ? '#ef4444' : score < 70 ? '#eab308' : '#06b6d4' }}>
          {score}%
        </span>
        <span className="text-[8px] uppercase tracking-tighter opacity-50 font-mono">Confidence</span>
      </div>
    </div>
  );
};

const LEDIndicator = ({ label, active, color = "#06b6d4" }: { label: string, active: boolean, color?: string }) => (
  <div className="flex items-center gap-2">
    <div 
      className={`w-2 h-2 rounded-full transition-all duration-300 ${active ? 'animate-pulse' : 'opacity-20'}`}
      style={{ 
        backgroundColor: color,
        boxShadow: active ? `0 0 8px ${color}, 0 0 12px ${color}` : 'none'
      }}
    />
    <span className="text-[10px] font-mono uppercase tracking-widest opacity-70">{label}</span>
  </div>
);

export const MirrorBreakerShell: React.FC = () => {
  const { score, alerts, downloadReport } = useMirrorBreaker();

  return (
    <div className="fixed top-4 right-4 z-[2147483647] flex flex-col gap-3 w-[300px] pointer-events-auto">
      {/* Main Dashboard */}
      <div className="glass-panel rounded-xl overflow-hidden relative p-4 flex flex-col gap-4">
        {/* Scanline overlay */}
        <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h1 className="text-xs font-bold font-mono tracking-widest uppercase neon-text-cyan">MirrorBreaker</h1>
          </div>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-3 gap-2 py-1">
          <LEDIndicator label="Pulse" active={score > 80} />
          <LEDIndicator label="Blink" active={score > 50} />
          <LEDIndicator label="Sync" active={true} />
        </div>

        {/* Trust Meter */}
        <TrustMeter score={score} />

        {/* System Message */}
        <div className="flex items-center gap-2 bg-slate-950/50 p-2 rounded border border-cyan-500/10">
          {score < 40 ? (
            <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
          ) : (
            <Cpu className="w-4 h-4 text-cyan-500" />
          )}
          <span className="text-[10px] font-mono leading-tight">
            {score < 40 ? 'CRITICAL: DEEPFAKE SIGNATURE DETECTED' : 
             score < 70 ? 'WARNING: ANOMALOUS BIOMETRIC DATA' : 
             'SYSTEM READY: BIOMETRIC AUTHENTIC'}
          </span>
        </div>
      </div>

      {/* Forensic Log Terminal */}
      <div className="glass-panel rounded-xl p-3 flex flex-col gap-2 h-[200px]">
        <div className="flex items-center justify-between border-b border-cyan-500/10 pb-1">
          <div className="flex items-center gap-2">
            <Terminal className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] font-mono uppercase tracking-widest opacity-50">Forensic Log</span>
          </div>
          <RefreshCw className="w-3 h-3 text-cyan-400/50 animate-spin-slow" />
        </div>
        
        <div className="flex-1 overflow-y-auto terminal-scroll pr-1 font-mono text-[10px] space-y-1">
          <AnimatePresence initial={false}>
            {alerts.slice(-10).map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2"
              >
                <span className="text-cyan-500/50">[{alert.timestamp}]</span>
                <span className="text-slate-300">- {alert.message}</span>
              </motion.div>
            ))}
            {alerts.length === 0 && (
              <div className="text-slate-500 italic opacity-50">Awaiting data stream...</div>
            )}
          </AnimatePresence>
        </div>

        <button 
          onClick={downloadReport}
          className="mt-1 flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 py-2 rounded text-[10px] font-mono uppercase tracking-wider transition-all group"
        >
          <Download className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" />
          Download Forensic Report
        </button>
      </div>
    </div>
  );
};
