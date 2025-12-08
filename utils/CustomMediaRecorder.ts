export class CustomMediaRecorder {
  private aiQueue: number[] = [];
  private recordedChunks: Float32Array[] = [];
  private totalUserBytes = 0;
  private totalAiBytes = 0;
  
  // Logging State
  private startTime = Date.now();
  private lastLogTime = Date.now();
  private lastAiBytesCount = 0;
  private lastUserBytesCount = 0;

  constructor(private sampleRate = 16000) {}

  // Helper: Convert Int16 byte stream to Float32
  private pcm16ToFloat32(uint8Data: Uint8Array): Float32Array {
    const int16 = new Int16Array(uint8Data.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  // Helper: Simple Linear Resampling (24k -> 16k)
  private resample(data: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (inputRate === outputRate) return data;
    const ratio = inputRate / outputRate;
    const newLength = Math.floor(data.length / ratio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;
      
      const v0 = data[index] || 0;
      const v1 = data[index + 1] || v0;
      result[i] = v0 + (v1 - v0) * fraction;
    }
    return result;
  }

  private logStatus() {
      const now = Date.now();
      // Log only every 10 seconds to keep console clean
      if (now - this.lastLogTime > 10000) {
          const sessionTime = ((now - this.startTime) / 1000).toFixed(0);
          const aiDelta = this.totalAiBytes - this.lastAiBytesCount;
          
          // Determine activity status based on recent AI data
          const activity = aiDelta > 0 ? "🤖 AI Speaking" : "👂 Listening to User";
          const userTotalKB = (this.totalUserBytes / 1024).toFixed(0);
          const aiTotalKB = (this.totalAiBytes / 1024).toFixed(0);

          console.log(
              `[⏱️ ${sessionTime}s] ${activity} | Data: 🎤 ${userTotalKB}KB / 🤖 ${aiTotalKB}KB`
          );

          this.lastLogTime = now;
          this.lastAiBytesCount = this.totalAiBytes;
          this.lastUserBytesCount = this.totalUserBytes;
      }
  }

  public addAiAudio(uint8Data: Uint8Array) {
    this.totalAiBytes += uint8Data.byteLength;
    this.logStatus();

    // 1. Convert to Float32
    const float32 = this.pcm16ToFloat32(uint8Data);
    
    // 2. Resample 24k -> 16k
    const resampled = this.resample(float32, 24000, 16000);

    // 3. Add to Queue
    for (let i = 0; i < resampled.length; i++) {
      this.aiQueue.push(resampled[i]);
    }
  }

  public addUserAudio(float32Data: Float32Array) {
    this.totalUserBytes += float32Data.byteLength;
    this.logStatus();

    const mixed = new Float32Array(float32Data.length);
    
    // Pull from AI queue for the duration of this user chunk
    // This assumes user audio is the "Master Clock" (Real-time)
    const aiChunkLen = Math.min(this.aiQueue.length, float32Data.length);
    const aiChunk = this.aiQueue.splice(0, aiChunkLen);

    for (let i = 0; i < float32Data.length; i++) {
      const userSample = float32Data[i];
      const aiSample = i < aiChunk.length ? aiChunk[i] : 0;
      
      // Simple mix
      let val = userSample + aiSample;
      // Hard clamping
      if (val > 1) val = 1;
      if (val < -1) val = -1;
      
      mixed[i] = val;
    }

    this.recordedChunks.push(mixed);
  }

  public hasRecordedData(): boolean {
    return this.recordedChunks.length > 0;
  }

  private writeWavHeader(samples: Float32Array): ArrayBuffer {
     const buffer = new ArrayBuffer(44 + samples.length * 2);
     const view = new DataView(buffer);
     
     const writeString = (offset: number, string: string) => {
       for (let i = 0; i < string.length; i++) {
         view.setUint8(offset + i, string.charCodeAt(i));
       }
     };

     writeString(0, 'RIFF');
     view.setUint32(4, 36 + samples.length * 2, true);
     writeString(8, 'WAVE');
     writeString(12, 'fmt ');
     view.setUint32(16, 16, true); // Subchunk1Size
     view.setUint16(20, 1, true); // AudioFormat (PCM)
     view.setUint16(22, 1, true); // NumChannels (Mono)
     view.setUint32(24, 16000, true); // SampleRate
     view.setUint32(28, 16000 * 2, true); // ByteRate
     view.setUint16(32, 2, true); // BlockAlign
     view.setUint16(34, 16, true); // BitsPerSample
     writeString(36, 'data');
     view.setUint32(40, samples.length * 2, true);

     let offset = 44;
     for (let i = 0; i < samples.length; i++) {
       const s = Math.max(-1, Math.min(1, samples[i]));
       view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
       offset += 2;
     }

     return buffer;
  }

  public getCombinedAudioBlob(): Blob {
    const totalLength = this.recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    const wavBuffer = this.writeWavHeader(result);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });

    console.log(`[CustomMediaRecorder] Exporting WAV... Final Size: ${blob.size}`);
    return blob;
  }
}