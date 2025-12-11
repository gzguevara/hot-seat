
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, StartSensitivity, EndSensitivity } from '@google/genai';
import { Character, SessionStatus, AudioVolumeState } from '../types';
import { MODEL_NAME } from '../constants';
import { pcmToGeminiBlob, base64ToUint8Array } from '../utils/audioUtils';
import { CustomMediaRecorder } from '../utils/CustomMediaRecorder';
import { saveTranscript } from '../utils/transcriptStorage';
import { brain } from '../services/Brain';
import { updateJurorSystemPrompt } from '../utils/promptUtils';
import { AudioStreamPlayer } from '../utils/AudioStreamPlayer';

interface UseGeminiLiveProps {
  onTransfer: (character: Character, summary?: string) => void;
  onUpdateJuror: (id: string, newInstruction: string) => void;
  onTicketDecrement: (id: string) => void;
  userBio: string;
  characters: Character[];
  onComplete?: (transcript: string) => void;
}

// Global Tool Definition for Consistency
const END_PANEL_TOOL: FunctionDeclaration = {
    name: 'endPanel',
    description: 'Concludes the entire interview session. Call this ONLY when you are the LAST remaining juror and you have finished your questions.',
    parameters: {
        type: Type.OBJECT,
        properties: {} 
    }
};

// Helper to strip transfer logic and inject endPanel logic
const convertToFinalJurorPrompt = (basePrompt: string) => {
    // Matches from "**TRANSITION RULES" until "# 1. CONTEXT"
    const transitionSectionRegex = /\*\*TRANSITION RULES \(CRITICAL\):\*\*[\s\S]*?(?=# 1\. CONTEXT)/;
    const protocolSectionRegex = /# PROTOCOL[\s\S]*?(?=# DYNAMIC CONFIGS)/;

    const finalInstructions = `
# PROTOCOL (FINAL TURN)
- You are the FINAL juror. The user has passed the previous interviews.
- **TASK:** Ask your specific question. Dig deep.
- **LANGUAGE:** **ALWAYS SPEAK ENGLISH.**
- **CONCLUSION:** When you are satisfied with the answer (or if the user fails to answer), you **MUST** call the \`endPanel\` tool.
- DO NOT pass to a colleague.
- DO NOT say "I will transfer you".
- Say "Thank you, that concludes our session." and call \`endPanel\`.

# Tool Usage
Call \`endPanel()\` to finish.
`;

    if (protocolSectionRegex.test(basePrompt)) {
        return basePrompt.replace(protocolSectionRegex, finalInstructions);
    } else {
        return basePrompt + "\n\n" + finalInstructions;
    }
};

export const useGeminiLive = ({ onTransfer, onUpdateJuror, onTicketDecrement, userBio, characters, onComplete }: UseGeminiLiveProps) => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.DISCONNECTED);
  const [volume, setVolume] = useState<AudioVolumeState>({ inputVolume: 0, outputVolume: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Players & Recorders
  const audioPlayerRef = useRef<AudioStreamPlayer | null>(null);
  const recorderRef = useRef<CustomMediaRecorder | null>(null);

  // API Reference
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentSessionRef = useRef<any>(null);

  // Data Ref to prevent stale closures
  const charactersRef = useRef(characters);

  // Transcript Buffer for Brain Context
  const transcriptBufferRef = useRef<string[]>([]);
  const currentCharacterRef = useRef<Character | null>(null);
  
  // Real-time transcript accumulation
  const currentInputRef = useRef<string>("");
  const currentOutputRef = useRef<string>("");

  // Inactivity Tracking
  const statusRef = useRef<SessionStatus>(SessionStatus.DISCONNECTED);
  const presenceCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAskedPresenceRef = useRef<boolean>(false);
  const lastUserActivityRef = useRef<number>(Date.now());
  const lastTimerResetTimeRef = useRef<number>(0);
  const isAiSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  // Sync status to ref for callbacks
  useEffect(() => {
    statusRef.current = status;
    if (status !== SessionStatus.CONNECTED) {
        if (presenceCheckTimeoutRef.current) clearTimeout(presenceCheckTimeoutRef.current);
    }
  }, [status]);

  // Sends a text turn to wake up the model immediately (Zero-Latency Trigger)
  const sendInitialTrigger = useCallback(async (session: any, prompt: string) => {
    try {
        console.log("Sending text trigger to wake model...", prompt);
        await session.sendClientContent({
            turns: [{ 
                role: "user", 
                parts: [{ text: prompt }] 
            }],
            turnComplete: true
        });
    } catch (e) {
        console.error("Error sending initial trigger:", e);
    }
  }, []);

  // Inactivity Logic
  const resetInactivityTimer = useCallback(() => {
    if (presenceCheckTimeoutRef.current) {
        clearTimeout(presenceCheckTimeoutRef.current);
        presenceCheckTimeoutRef.current = null;
    }
    
    hasAskedPresenceRef.current = false;
    lastUserActivityRef.current = Date.now();

    if (statusRef.current === SessionStatus.CONNECTED && currentSessionRef.current) {
        if (isAiSpeakingRef.current) return;

        presenceCheckTimeoutRef.current = setTimeout(() => {
            if (statusRef.current === SessionStatus.CONNECTED && currentSessionRef.current && !hasAskedPresenceRef.current && !isAiSpeakingRef.current) {
                console.log("[Inactivity] Silence detected (6s). Sending nudge.");
                try {
                    currentSessionRef.current.sendClientContent({
                        turns: [{
                            role: "user",
                            parts: [{
                                text: "The user has been silent for a while. Ask if they are still there."
                            }]
                        }],
                        turnComplete: true
                    });
                } catch (e) {
                    console.error("Failed to send inactivity prompt", e);
                }
                hasAskedPresenceRef.current = true;
            }
        }, 6000); 
    }
  }, []);

  const throttleResetTimer = useCallback(() => {
      const now = Date.now();
      if (now - lastTimerResetTimeRef.current > 500) { 
          resetInactivityTimer();
          lastTimerResetTimeRef.current = now;
      }
  }, [resetInactivityTimer]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const newEnabledState = !audioTracks[0].enabled;
        audioTracks.forEach(track => {
          track.enabled = newEnabledState;
        });
        setIsMuted(!newEnabledState);
        if (newEnabledState) {
            resetInactivityTimer(); 
        }
      }
    }
  }, [resetInactivityTimer]);

  const disconnect = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.hasRecordedData()) {
        const blob = recorderRef.current.getCombinedAudioBlob();
        console.log(`[System] Session ended. Recording ready. Size: ${blob.size} bytes`);
        await saveTranscript(blob);
    }
    recorderRef.current = null;

    if (inputContextRef.current) {
      await inputContextRef.current.close();
      inputContextRef.current = null;
    }
    
    if (audioPlayerRef.current) {
        audioPlayerRef.current.close();
        audioPlayerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (currentSessionRef.current) {
        try { currentSessionRef.current.close(); } catch(e) { console.warn(e); }
        currentSessionRef.current = null;
    }
    
    sessionPromiseRef.current = null;
    setStatus(SessionStatus.DISCONNECTED);
    setVolume({ inputVolume: 0, outputVolume: 0 });
    setIsMuted(false);
    isAiSpeakingRef.current = false;
    currentInputRef.current = "";
    currentOutputRef.current = "";

    if (presenceCheckTimeoutRef.current) {
        clearTimeout(presenceCheckTimeoutRef.current);
        presenceCheckTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(async (character: Character, initialContext?: string, toolsOverride?: any[]) => {
    try {
      setStatus(SessionStatus.CONNECTING);
      setError(null);
      setIsMuted(false);
      currentCharacterRef.current = character;

      if (!initialContext) {
          transcriptBufferRef.current = [];
      }
      
      recorderRef.current = new CustomMediaRecorder();
      audioPlayerRef.current = new AudioStreamPlayer(24000, (isPlaying) => {
          isAiSpeakingRef.current = isPlaying;
          if (isPlaying) {
              if (presenceCheckTimeoutRef.current) {
                  clearTimeout(presenceCheckTimeoutRef.current);
                  presenceCheckTimeoutRef.current = null;
              }
          } else {
              resetInactivityTimer();
          }
      });

      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            // @ts-ignore
            latency: 0
          } 
      });
      streamRef.current = stream;

      const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputContext;

      const source = inputContext.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      
      const scriptProcessor = inputContext.createScriptProcessor(1024, 1, 1);
      processorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        if (recorderRef.current) {
            recorderRef.current.addUserAudio(inputData);
        }

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setVolume(prev => ({ ...prev, inputVolume: Math.min(1, rms * 5) })); 

        if (rms > 0.02) {
            throttleResetTimer();
        }

        if (sessionPromiseRef.current) {
            const blob = pcmToGeminiBlob(inputData, 16000);
            sessionPromiseRef.current.then(session => {
                session.sendRealtimeInput({ media: blob });
            }).catch(err => { /* ignore */ });
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(inputContext.destination);

      // --- 2. Tool Setup ---
      const currentCharacters = charactersRef.current;
      const validColleagues = currentCharacters.filter(c => c.id !== character.id && c.tickets > 0);
      
      const transferTool: FunctionDeclaration = {
        name: 'transfer',
        description: `
1. "requested_by_current_juror" (Polite Handoff)
   - *Scenario:* E.g. the user answered your question.
   - *Behavior:* Say something like, "Alright, thank you for your answer. I would like to hand over to {{COLLEAGUE_NAME}} now." THEN call the tool.
   
2. "requested_by_user" (User Direction)
   - *Scenario:* The user explicitly asks to speak to someone else (e.g., "I want to explain the security to Kore").
   - *Behavior:* Acknowledge it briefly ("Sure, Kore is right here.") THEN call the tool immediately.
`,
        parameters: {
          type: Type.OBJECT,
          properties: {
            colleague: {
              type: Type.STRING,
              description: "The name of the colleague to transfer to.",
              enum: validColleagues.map(c => c.name)
            },
            reason: {
              type: Type.STRING,
              description: "The nature of the transfer.",
              enum: ["requested_by_current_juror", "requested_by_user"]
            },
            conversation_context: {
              type: Type.STRING,
              description: "A brief summary of the immediate discussion."
            }
          },
          required: ['colleague', 'reason', 'conversation_context']
        }
      };

      let activeTools = toolsOverride;
      let systemInstruction = character.systemInstruction;

      if (!activeTools) {
          if (validColleagues.length === 0) {
              console.log("[System] No colleagues available (Final Turn / Single Juror). Enforcing EndPanel.");
              activeTools = [{ functionDeclarations: [END_PANEL_TOOL] }];
              const originalInstruction = systemInstruction;
              systemInstruction = convertToFinalJurorPrompt(systemInstruction);
              if (systemInstruction !== originalInstruction) {
                  onUpdateJuror(character.id, systemInstruction);
              }
          } else {
              activeTools = [{ functionDeclarations: [transferTool] }];
          }
      }

      const ai = new GoogleGenAI({ 
          apiKey: process.env.API_KEY, 
          httpOptions: { apiVersion: 'v1alpha' }
      });
      
      if (userBio && userBio.trim()) {
        systemInstruction += `\n\n[CANDIDATE INFO]: "${userBio}".`;
      }

      if (initialContext) {
        // Context already handled by Brain
      } else {
        systemInstruction += `\n\n[SYSTEM NOTICE]: When the user says Hello, introduce yourself and start the interview.`;
      }

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          enableAffectiveDialog: true, 
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } }
          },
          realtimeInputConfig: {
             automaticActivityDetection: {
                 startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
                 endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                 silenceDurationMs: 250
             }
          },
          systemInstruction: systemInstruction,
          tools: activeTools
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Session Opened');
            setStatus(SessionStatus.CONNECTED);
            resetInactivityTimer();
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            
            if (serverContent?.outputTranscription?.text) {
                currentOutputRef.current += serverContent.outputTranscription.text;
            }
            if (serverContent?.inputTranscription?.text) {
                const text = serverContent.inputTranscription.text;
                currentInputRef.current += text;
                if (text.trim().length > 0) throttleResetTimer();
            }

            if (serverContent?.turnComplete) {
                if (currentInputRef.current.trim()) {
                    transcriptBufferRef.current.push(`Candidate: ${currentInputRef.current.trim()}`);
                    currentInputRef.current = "";
                }
                if (currentOutputRef.current.trim()) {
                    transcriptBufferRef.current.push(`${character.name}: ${currentOutputRef.current.trim()}`);
                    currentOutputRef.current = "";
                }
            }

            if (message.toolCall) {
              const transferCall = message.toolCall.functionCalls.find(fc => fc.name === 'transfer');
              const endPanelCall = message.toolCall.functionCalls.find(fc => fc.name === 'endPanel');
              
              if (endPanelCall) {
                  console.log("[EndPanel] Session concluded by AI.");
                  if (currentInputRef.current.trim()) transcriptBufferRef.current.push(`Candidate: ${currentInputRef.current.trim()}`);
                  if (currentOutputRef.current.trim()) transcriptBufferRef.current.push(`${character.name}: ${currentOutputRef.current.trim()}`);
                  const finalTranscript = transcriptBufferRef.current.join('\n');
                  await disconnect();
                  if (onComplete) onComplete(finalTranscript);
                  return;
              }

              if (transferCall) {
                const args = transferCall.args as any;
                const targetName = args.colleague;
                const reason = args.reason || "requested_by_current_juror";
                const context = args.conversation_context;

                // Robust Fuzzy Matching: Bidirectional check
                const normalizedTarget = targetName.toLowerCase().trim();
                const targetChar = charactersRef.current.find(c => {
                    const cName = c.name.toLowerCase().trim();
                    return cName === normalizedTarget || 
                           cName.includes(normalizedTarget) || 
                           normalizedTarget.includes(cName);
                });
                
                const currentJuror = currentCharacterRef.current;

                if (targetChar && currentJuror) {
                   console.log(`[Transfer] Switching to ${targetChar.name} (Requested: "${targetName}")...`);
                   
                   onTicketDecrement(currentJuror.id);
                   // Construct optimistic updated state for immediate logic usage
                   const updatedCharacters = charactersRef.current.map(c => 
                       c.id === currentJuror.id ? {...c, tickets: Math.max(0, c.tickets - 1)} : c
                   );
                   
                   if (currentInputRef.current.trim()) {
                        transcriptBufferRef.current.push(`Candidate: ${currentInputRef.current.trim()}`);
                        currentInputRef.current = "";
                   }
                   if (currentOutputRef.current.trim()) {
                        transcriptBufferRef.current.push(`${character.name}: ${currentOutputRef.current.trim()}`);
                        currentOutputRef.current = "";
                   }
                   const transcriptHistory = transcriptBufferRef.current.join('\n');

                   await disconnect();
                   
                   const totalRemainingTickets = updatedCharacters.reduce((sum, c) => sum + c.tickets, 0);
                   const finishedJurors = updatedCharacters.filter(c => c.tickets <= 0).map(c => c.name);
                   const blockedListText = finishedJurors.length > 0 
                       ? `[ROSTER UPDATE]: The following jurors have finished their questioning: ${finishedJurors.join(', ')}. DO NOT transfer to them.`
                       : "";

                   let fastInstruction = `
[SYSTEM EVENT: LIVE TRANSFER]
FROM: ${currentJuror.name}
TO: ${targetChar.name}
REASON: ${reason}
CONTEXT: "${context}"
${blockedListText}
`;

                   let nextTools = undefined;
                   let targetSystemInstruction = targetChar.systemInstruction;
                   
                   if (totalRemainingTickets <= 1) {
                       console.log("⚠️ [System] Final Turn Detected. Switching to EndPanel Tool.");
                       fastInstruction += `\n\n[SYSTEM NOTICE]: You are the FINAL juror with the LAST ticket. Ask your question, evaluate the answer, and then IMMEDIATELY call the \`endPanel\` tool to conclude the session. DO NOT TRANSFER.`;
                       nextTools = [{ functionDeclarations: [END_PANEL_TOOL] }];
                       const newInstruction = convertToFinalJurorPrompt(targetSystemInstruction);
                       if (newInstruction !== targetSystemInstruction) {
                           targetSystemInstruction = newInstruction;
                       }
                   }

                   let updatedInstruction = fastInstruction + "\n\n" + targetSystemInstruction;
                   const updatedTargetChar = { ...targetChar, systemInstruction: updatedInstruction };

                   onTransfer(updatedTargetChar, context);
                   
                   // Ensure async disconnect has fully cleared previous session refs
                   if (sessionPromiseRef.current === null) { 
                        setTimeout(() => {
                             connect(updatedTargetChar, context, nextTools);
                        }, 300); // Increased safety buffer
                   }

                   brain.Phase3Transfer(currentJuror.name, targetChar.name, transcriptHistory, context, reason)
                        .then((result) => {
                            if (result) {
                                const newPrompt = updateJurorSystemPrompt(currentJuror.systemInstruction, result.next_question, result.memory_update);
                                onUpdateJuror(currentJuror.id, newPrompt);
                            }
                        })
                        .catch(e => console.error("Background Brain Error:", e));
                   return;
                } else {
                    console.error(`[Transfer Failed] Could not find colleague matching: "${targetName}". Available:`, charactersRef.current.map(c => c.name));
                }
              }
            }

            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                if (recorderRef.current) recorderRef.current.addAiAudio(base64ToUint8Array(base64Audio));
                if (audioPlayerRef.current) audioPlayerRef.current.play(base64Audio, (vol) => setVolume(prev => ({ ...prev, outputVolume: vol })));
            }

            if (serverContent?.interrupted) {
                if (audioPlayerRef.current) audioPlayerRef.current.stop();
            }
          },
          onclose: () => {
            console.log('Gemini Live Session Closed');
            setStatus(SessionStatus.DISCONNECTED);
          },
          onerror: (err) => {
            console.error('Gemini Live Session Error', err);
            setError(err.message || "Connection error");
            setStatus(SessionStatus.ERROR);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      sessionPromise.then(async sess => {
          currentSessionRef.current = sess;
          try {
              await new Promise(resolve => setTimeout(resolve, 200));
              let triggerMessage = "Ask your question.";
              if (!initialContext) {
                  triggerMessage = "introduce yourself and give a short introduction about what happened and what the goal of the conversation is";
              }
              await sendInitialTrigger(sess, triggerMessage);
          } catch (e) {
              console.error("Error processing initial trigger:", e);
          }
      });

    } catch (e: any) {
      console.error("Failed to connect", e);
      setError(e.message);
      setStatus(SessionStatus.ERROR);
      disconnect();
    }
  }, [disconnect, onTransfer, onUpdateJuror, onTicketDecrement, userBio, sendInitialTrigger, onComplete, resetInactivityTimer, throttleResetTimer]); 

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { status, volume, error, connect, disconnect, isMuted, toggleMute };
};
