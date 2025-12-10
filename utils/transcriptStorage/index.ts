
// This simulates a file system storage location
const STORAGE_PATH = '/app/transcripts';
const FILENAME = 'transcript.wav';

/**
 * Stores the transcript blob.
 * In a browser environment, we cannot write directly to the user's disk without interaction.
 * We simulate this by storing it in a globally accessible location (memory) and logging the "write" action.
 * This effectively "overwrites" the previous recording.
 */
export async function saveTranscript(blob: Blob): Promise<void> {
  const timestamp = new Date().toISOString();
  
  console.group('[Transcript Storage]');
  console.log(`Writing file to: ${STORAGE_PATH}/${FILENAME}`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Size: ${blob.size} bytes`);
  console.log(`Type: ${blob.type}`);
  
  // Explicit check for empty recordings
  if (blob.size <= 44) {
    console.warn("⚠️ Warning: File appears to contain only the WAV header (no audio data).");
  } else {
    console.log("✅ File saved successfully (simulated).");
  }

  // "Store" the file by overwriting the window-level reference
  // This allows other parts of the app (or the 'Brain') to access window.LATEST_TRANSCRIPT
  (window as any).LATEST_TRANSCRIPT = blob;
  
  console.groupEnd();
}
