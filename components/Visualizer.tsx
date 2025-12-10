
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  inputVolume: number;
  outputVolume: number;
  activeColor: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ inputVolume, outputVolume, activeColor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  
  // We use a ref to store the smoothed volume so it persists across renders without triggering re-renders
  const smoothedVolumeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle High-DPI displays for crisp lines
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set actual size in memory (scaled to account for extra pixel density)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Normalize coordinate system to use css pixels
    ctx.scale(dpr, dpr);

    const draw = () => {
      const width = rect.width;
      const height = rect.height;
      const centerY = height / 2;

      // 1. Determine Target Volume
      // We take the max of input/output to visualize whoever is speaking
      const rawTarget = Math.max(inputVolume, outputVolume);
      
      // 2. Smooth the volume (Linear Interpolation)
      // This makes the bars move fluidly instead of twitching
      const lerpFactor = 0.2; 
      smoothedVolumeRef.current += (rawTarget - smoothedVolumeRef.current) * lerpFactor;
      
      // Ensure we have a tiny bit of movement even when silent (the "breathing" effect)
      const currentVol = Math.max(smoothedVolumeRef.current, 0.02);

      ctx.clearRect(0, 0, width, height);

      // 3. Configuration
      const barCount = 4; // Total bars
      const barWidth = 4; // Width of each pill
      const gap = 3;      // Space between pills
      const totalVisualizerWidth = (barCount * barWidth) + ((barCount - 1) * gap);
      const startX = (width - totalVisualizerWidth) / 2; // Center horizontally

      // 4. Draw Bars
      ctx.fillStyle = activeColor;
      
      // Add a subtle glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = activeColor;

      for (let i = 0; i < barCount; i++) {
        // Create a symmetrical wave pattern based on index
        // Center bars react more to volume than outer bars
        const centerOffset = Math.abs(i - (barCount - 1) / 2);
        const sensitivity = 1 - (centerOffset * 0.3); // Center is 1.0, edges are ~0.7
        
        // Calculate dynamic height
        // Base height + (Volume * MaxGrowth * Sensitivity)
        let barHeight = 8 + (currentVol * 25 * sensitivity);
        
        // Add specific sine wave offset for "organic" feel
        // Each bar has a different phase speed
        const time = Date.now() / 150;
        const wave = Math.sin(time + (i * 1.5)) * 3; 
        
        // Apply wave only partially so volume dominates when loud
        barHeight += wave * (1 - Math.min(currentVol * 2, 0.8));

        // Clamp to container height
        barHeight = Math.min(barHeight, height);

        const x = startX + i * (barWidth + gap);
        const y = centerY - barHeight / 2;

        ctx.beginPath();
        // Use rect with rounded corners logic
        ctx.roundRect(x, y, barWidth, barHeight, 50); // 50 radius makes it a pill
        ctx.fill();
      }
      
      // Reset shadow for next frame to avoid compounding artifacts if cleared incorrectly
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [inputVolume, outputVolume, activeColor]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

export default Visualizer;
