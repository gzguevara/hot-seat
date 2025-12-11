
import { base64ToUint8Array } from './audioUtils';

export class AudioStreamPlayer {
  private context: AudioContext;
  private nextStartTime: number = 0;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private sampleRate: number;
  private isStopped: boolean = false;
  private onPlaybackStateChange?: (isPlaying: boolean) => void;

  constructor(sampleRate: number = 24000, onPlaybackStateChange?: (isPlaying: boolean) => void) {
    this.sampleRate = sampleRate;
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    this.onPlaybackStateChange = onPlaybackStateChange;
  }

  private updatePlaybackState() {
      const isPlaying = this.scheduledSources.size > 0;
      if (this.onPlaybackStateChange) {
          this.onPlaybackStateChange(isPlaying);
      }
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
    this.updatePlaybackState(); // State becomes TRUE (or stays true)

    source.onended = () => {
        this.scheduledSources.delete(source);
        this.updatePlaybackState(); // Check if this was the last source (State might become FALSE)
    };
  }

  public stop() {
    this.isStopped = true;
    this.scheduledSources.forEach(source => {
        try { source.stop(); } catch (e) { /* ignore */ }
    });
    this.scheduledSources.clear();
    // Reset cursor
    this.nextStartTime = 0; 
    this.updatePlaybackState(); // State becomes FALSE
  }

  public close() {
      this.stop();
      this.context.close();
  }
}
