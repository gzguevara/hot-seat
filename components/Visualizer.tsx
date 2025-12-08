import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  inputVolume: number;
  outputVolume: number;
  activeColor: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ inputVolume, outputVolume, activeColor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for retina
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const width = rect.width;
      const height = rect.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Determine the dominant volume source for this frame
      // We mix them slightly but primarily visualize the one speaking
      const isOutputDominant = outputVolume > inputVolume;
      const primaryVolume = Math.max(inputVolume, outputVolume, 0.05); // Min base size
      
      // Color adjustment
      ctx.fillStyle = activeColor;
      
      // We'll draw 5 bars
      const bars = 5;
      const gap = 12;
      const barWidth = 8;
      const totalWidth = (bars * barWidth) + ((bars - 1) * gap);
      const startX = (width - totalWidth) / 2;

      for (let i = 0; i < bars; i++) {
        // Calculate height based on volume and a sine wave for idle movement
        const wave = Math.sin(Date.now() / 200 + i) * 0.2; 
        const multiplier = (i === 2) ? 1.5 : (i === 1 || i === 3) ? 1.2 : 0.8;
        
        let barHeight = 20 + (primaryVolume * 100 * multiplier);
        barHeight = barHeight * (1 + wave); // Add idle breath
        
        // Clamp height
        barHeight = Math.min(barHeight, height - 10);

        // Opacity based on activity
        ctx.globalAlpha = 0.5 + (primaryVolume * 0.5);

        // Rounded rect logic
        const x = startX + i * (barWidth + gap);
        const y = centerY - barHeight / 2;
        
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 4);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [inputVolume, outputVolume, activeColor]);

  return <canvas ref={canvasRef} className="w-48 h-32" />;
};

export default Visualizer;