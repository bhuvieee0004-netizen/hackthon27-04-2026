---
trigger: always_on
---

The Logic (Scoring & Physics)**
- Focus: EAR (Eye Aspect Ratio) for blink detection, rPPG algorithm (Green channel flux), and audio-visual drift calculations.
- Deliverable: A `calculateTrustScore()` function that consumes the ML JSON and outputs 0-100.
- Ownership: All math, threshold tuning, and "Trust" algorithms.