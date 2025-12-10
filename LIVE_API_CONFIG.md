
# Live API Configuration

This document outlines the current configuration for the Google Gemini Live API integration in the Hot Seat application.

## 1. Core Model Configuration

The application uses the `GoogleGenAI` client to establish a persistent, bidirectional streaming connection.

*   **Model Name**: `gemini-2.5-flash-native-audio-preview-09-2025`
    *   *Consequence*: Uses the latest experimental flash model optimized for native audio, providing low-latency speech interactions.
*   **API Version**: `v1alpha`
    *   *Consequence*: Unlocks advanced experimental features like affective dialog.
*   **Affective Dialog**: `enableAffectiveDialog: true`
    *   *Consequence*: The model is configured to detect the user's emotional tone and match it (e.g., responding with urgency to hesitation, or warmth to friendliness). This is critical for the "Hot Seat" persona immersion.
*   **Response Modalities**: `[Modality.AUDIO]`
    *   *Consequence*: The model outputs raw audio data directly. We do **not** receive text chunks for the response content itself, but we do receive transcriptions (see below).
*   **Transcription**:
    *   `inputAudioTranscription: {}` (Enabled)
    *   `outputAudioTranscription: {}` (Enabled)
    *   *Consequence*: The server sends text transcripts for both user input and model output. These are used to build a history log (`transcriptBufferRef`) for context preservation during transfers, but are not displayed as a real-time chat UI.
*   **Voice Activity Detection (VAD)**:
    *   `startOfSpeechSensitivity`: `START_SENSITIVITY_LOW`
    *   `endOfSpeechSensitivity`: `END_SENSITIVITY_HIGH`
    *   `silenceDurationMs`: `500`
    *   *Consequence*: Tuned for noisy environments or thoughtful speakers. High "End" sensitivity prevents the model from hanging on to background noise, while low "Start" sensitivity prevents accidental interruptions from breath or chair creaks.

### Code Reference (`hooks/useGeminiLive.ts` & `constants.ts`)

```typescript
// constants.ts
export const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

// hooks/useGeminiLive.ts
// Use v1alpha to enable affective dialog features
const ai = new GoogleGenAI({ 
    apiKey: process.env.API_KEY,
    httpOptions: { apiVersion: 'v1alpha' }
});

const sessionPromise = ai.live.connect({
  model: MODEL_NAME,
  config: {
    responseModalities: [Modality.AUDIO],
    enableAffectiveDialog: true, // Enables emotional responsiveness
    inputAudioTranscription: {}, 
    outputAudioTranscription: {}, 
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } }
    },
    realtimeInputConfig: {
      automaticActivityDetection: {
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        silenceDurationMs: 500, 
      }
    },
    systemInstruction: systemInstruction,
    tools: activeTools
  },
  // ...
});
```

## 2. Audio Pipeline & Interaction Trigger

The audio system is designed for real-time interaction with specific sample rate requirements, utilizing a text-based trigger for zero-latency startup.

*   **Input (User -> Model)**:
    *   **Sample Rate**: `16,000 Hz`
    *   **Format**: PCM 16-bit signed integer (converted to Blob)
    *   **Trigger**: On connection, a silent **Text Turn** is sent to the model via `sendClientContent`.
    *   *Consequence*: This instantly "wakes" the model and forces it to speak first (e.g., "Hello, I am Zephyr...") without the latency or complexity of streaming a fake audio file.
*   **Output (Model -> User)**:
    *   **Sample Rate**: `24,000 Hz` (Playback)
    *   **Handling**: Audio chunks (`base64`) are received, decoded, and queued in an `AudioStreamPlayer`.
    *   *Consequence*: High-quality voice output. The player handles buffering to prevent jitter.
*   **Recording & Transcription**:
    *   **Audio**: Both user input and model output are mixed into a `CustomMediaRecorder` to generate a downloadable session recording (`.wav`).
    *   **Text Transcript**: The built-in Gemini transcription events (`outputAudioTranscription` and `inputAudioTranscription`) are captured in real-time. Upon session end, this text log is saved alongside the audio.
    *   **Note on Audio Transcription**: We do **not** need to perform separate client-side Speech-to-Text (STT) on the audio blob because the Live API streams accurate text transcripts in real-time. This reduces cost and complexity.
    *   *Consequence*: Users get both a listenable audio file AND a searchable text file of the interview.

### Code Reference (`hooks/useGeminiLive.ts`)

```typescript
// Input Context
const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

// Text Trigger Logic (Zero-Latency Wakeup)
const sendInitialTrigger = useCallback(async (session: any) => {
    // We send a text turn representing the user to force the model to respond immediately.
    // This replaces the need for a physical "hello.wav" file.
    await session.sendClientContent({
        turns: [{ 
            role: "user", 
            parts: [{ text: "Hello, I am here. Please introduce yourself and start the interview." }] 
        }],
        turnComplete: true
    });
}, []);

// Output Handling
const audioPlayerRef = useRef<AudioStreamPlayer | null>(null);
audioPlayerRef.current = new AudioStreamPlayer(24000);

// Saving Transcript on Disconnect
const disconnect = useCallback(async () => {
    // 1. Export Audio Recording
    if (recorderRef.current && recorderRef.current.hasRecordedData()) {
        const audioBlob = recorderRef.current.getCombinedAudioBlob();
        
        // 2. Export Text Transcript
        const textContent = transcriptBufferRef.current.join('\n');
        
        // Save both
        await saveTranscript(audioBlob, textContent);
    }
    // ... cleanup ...
}, []);
```

## 3. Tool Definitions (Function Calling)

The model is provided with specific tools to manage conversation flow. These are defined dynamically based on the session state.

### `transfer`
Allows the current character to hand off the conversation to another colleague.

*   **Parameters**:
    *   `colleague`: Name of the target character (enum restricted to valid, remaining characters).
    *   `reason`: Enum (`requested_by_current_juror`, `requested_by_user`).
    *   `conversation_context`: Summary/instructions for the next character.
*   **Consequence**: When called, the client:
    1.  Decrements the current character's ticket count.
    2.  Disconnects the current session.
    3.  Updates the prompt for the *next* character with context.
    4.  Re-connects to the Live API with the new character persona.

### `endPanel`
Concludes the interview session.

*   **Availability**: This tool is **only** provided when the "Last Man Standing" logic activates (i.e., only 1 ticket remains globally or specifically for the final juror).
*   **Consequence**: Terminates the connection and finalizes the recording.

### Code Reference (`hooks/useGeminiLive.ts`)

```typescript
const transferTool: FunctionDeclaration = {
  name: 'transfer',
  description: `Pass the conversation to a colleague. Use this for ANY handover.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      colleague: { /* ... enum of valid colleagues ... */ },
      reason: { /* ... enum ... */ },
      conversation_context: { /* ... string ... */ }
    },
    required: ['colleague', 'reason', 'conversation_context']
  }
};

const endPanelTool: FunctionDeclaration = {
    name: 'endPanel',
    description: 'Concludes the entire interview session...',
    parameters: { type: Type.OBJECT, properties: {}, }
};
```

## 4. System Instruction Strategy

The `systemInstruction` is dynamically composed to maintain context across character switches.

1.  **Base Persona**: Derived from `Character.systemInstruction` (e.g., "You are Zephyr...").
2.  **User Bio**: `[CANDIDATE INFO]: "{userBio}"` is appended if available.
3.  **Handoff Context**: When a transfer occurs, the new character receives a "Fast Action Prompt":
    ```text
    [SYSTEM EVENT: LIVE TRANSFER]
    FROM: {PreviousChar}
    TO: {TargetChar}
    REASON: {Reason}
    CONTEXT: "{Context provided by previous model}"
    INSTRUCTION: {Attitude Instruction}
    ```
4.  **Final Turn Override**: If it is the last turn, the system appends instructions to **not** transfer but to use `endPanel`.

### Code Reference (`hooks/useGeminiLive.ts`)

```typescript
// Constructing the fast instruction during transfer
let fastInstruction = `
[SYSTEM EVENT: LIVE TRANSFER]
FROM: ${currentJuror.name}
TO: ${targetChar.name}
REASON: ${reason}
CONTEXT: "${context}"
INSTRUCTION:
${attitudeInstruction}
`;

// Prepending to the target character's base instruction
let updatedInstruction = fastInstruction + "\n\n" + targetChar.systemInstruction;
```

## 5. Brain / Supervisor (Background)

There is a background "Brain" service that runs parallel to the transfer.

*   **Function**: `brain.Phase3Transfer(...)`
*   **Action**: Analyzes the transcript history to suggest the "Next Question" or "Memory Update".
*   **Consequence**: Updates the *next* character's system prompt in the background (via `onUpdateJuror`), effectively "injecting" thoughts or strategy into the character for future turns.
