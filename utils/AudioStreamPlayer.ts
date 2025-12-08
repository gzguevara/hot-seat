
import { base64ToUint8Array } from './audioUtils';

export class AudioStreamPlayer {
  private context: AudioContext;
  private nextStartTime: number = 0;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private sampleRate: number;
  private isStopped: boolean = false;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  }

  public async play(base64Data: string, onVolume?: (vol: number) => void) {
    if (this.isStopped) this.isStopped = false; // Reset stop flag if new play comes in

    // Ensure context is running (browsers suspend it after ~30s of inactivity or initially)
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch (e) {
        console.error("[AudioStreamPlayer] Failed to resume context", e);
      }
    }

    const uint8Array = base64ToUint8Array(base64Data);
    
    // Convert PCM16 Little Endian to Float32
    const int16 = new Int16Array(uint8Array.buffer);
    const float32 = new Float32Array(int16.length);
    let sumSq = 0;
    
    for (let i = 0; i < int16.length; i++) {
        const s = int16[i] / 32768.0;
        float32[i] = s;
        sumSq += s * s;
    }

    // Calculate Volume (RMS)
    if (onVolume) {
        const rms = Math.sqrt(sumSq / int16.length);
        onVolume(Math.min(1, rms * 5)); // Boost slightly for visualizer
    }

    // Create Audio Buffer
    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    // Schedule
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    const currentTime = this.context.currentTime;
    
    // Gap handling: If nextStartTime is behind, snap to now + small buffer
    if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.02; // 20ms buffer
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.add(source);
    source.onended = () => {
        this.scheduledSources.delete(source);
    };
  }

  public stop() {
    this.isStopped = true;
    this.scheduledSources.forEach(source => {
        try { source.stop(); } catch (e) { /* ignore */ }
    });
    this.scheduledSources.clear();
    // Reset cursor to 0? No, resetting to 0 causes issues if we resume.
    // We should reset to "now" on next play, which the gap handling logic does automatically.
    // But setting it to 0 effectively forces a gap check on next play.
    this.nextStartTime = 0; 
  }

  public close() {
      this.stop();
      this.context.close();
  }
}
