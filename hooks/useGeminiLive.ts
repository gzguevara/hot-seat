
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

// Helper to strip transfer logic and inject endPanel logic
const convertToFinalJurorPrompt = (basePrompt: string) => {
    // Matches from "**TRANSITION RULES" until "# 1. CONTEXT"
    // This replaces the instruction to use 'transfer' with instructions to use 'endPanel'
    const transitionSectionRegex = /\*\*TRANSITION RULES \(CRITICAL\):\*\*[\s\S]*?(?=# 1\. CONTEXT)/;
    
    const finalInstructions = `
**SESSION CONCLUSION RULES (CRITICAL):**
You are the FINAL juror. The user has passed the previous interviews.
Your Goal: Ask your specific assigned question. Dig deep.
**STYLE:** Be extremely concise. Do not waffle.
**LANGUAGE:** ALWAYS speak English.
Ending: When you are satisfied with the answer (or if the user fails to answer), you MUST call the \`endPanel\` tool.
- DO NOT pass to a colleague.
- DO NOT say "I will transfer you".
- Say "Thank you, that concludes our session." and call \`endPanel\`.

**Tool Usage:**
Call \`endPanel({ reason: "interview_complete" })\` to finish.
`;

    if (transitionSectionRegex.test(basePrompt)) {
        return basePrompt.replace(transitionSectionRegex, finalInstructions);
    } else {
        return basePrompt + "\n\n" + finalInstructions;
    }
};

export const useGeminiLive = ({ onTransfer, onUpdateJuror, onTicketDecrement, userBio, characters, onComplete }: UseGeminiLiveProps) => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.DISCONNECTED);
  const [volume, setVolume] = useState<AudioVolumeState>({ inputVolume: 0, outputVolume: 0 });
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  // Sends a text turn to wake up the model immediately (Zero-Latency Trigger)
  const sendInitialTrigger = useCallback(async (session: any) => {
    try {
        console.log("Sending text trigger to wake model...");
        await session.sendClientContent({
            turns: [{ 
                role: "user", 
                parts: [{ text: "Hello, I am here. Please introduce yourself and start the interview. Remember to be concise and speak English." }] 
            }],
            turnComplete: true
        });
    } catch (e) {
        console.error("Error sending initial trigger:", e);
    }
  }, []);

  const disconnect = useCallback(async () => {
    // 1. Export Recording before destroying context
    if (recorderRef.current && recorderRef.current.hasRecordedData()) {
        const blob = recorderRef.current.getCombinedAudioBlob();
        console.log(`[System] Session ended. Recording ready. Size: ${blob.size} bytes`);
        await saveTranscript(blob);
    }
    // Reset recorder
    recorderRef.current = null;

    if (inputContextRef.current) {
      await inputContextRef.current.close();
      inputContextRef.current = null;
    }
    
    // Stop Player
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
    
    // Reset transcript accumulation
    currentInputRef.current = "";
    currentOutputRef.current = "";
  }, []);

  const connect = useCallback(async (character: Character, initialContext?: string, toolsOverride?: any[]) => {
    try {
      setStatus(SessionStatus.CONNECTING);
      setError(null);
      currentCharacterRef.current = character;

      // If no initial context is provided (fresh start), clear transcript buffer
      if (!initialContext) {
          transcriptBufferRef.current = [];
      }
      
      // Initialize Recorder
      recorderRef.current = new CustomMediaRecorder();
      // Initialize Player
      audioPlayerRef.current = new AudioStreamPlayer(24000);

      // --- 1. Audio Setup ---
      // CRITICAL: We explicitly disable browser audio processing to ensure raw input.
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            // @ts-ignore - latency is not in standard type but supported in some browsers
            latency: 0
          } 
      });
      streamRef.current = stream;

      const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputContext;

      const source = inputContext.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      
      // Reduced buffer size to 1024 for lower latency (approx 64ms)
      const scriptProcessor = inputContext.createScriptProcessor(1024, 1, 1);
      processorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Feed User Audio to Recorder
        if (recorderRef.current) {
            recorderRef.current.addUserAudio(inputData);
        }

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setVolume(prev => ({ ...prev, inputVolume: Math.min(1, rms * 5) })); 

        // Send audio to Gemini continuously
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
        description: `Pass the conversation to a colleague. Use this for ANY handover (polite or interruption).`,
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
              description: "A brief summary of the immediate discussion and specific instructions for the next juror on WHY they are taking over."
            }
          },
          required: ['colleague', 'reason', 'conversation_context']
        }
      };

      const endPanelTool: FunctionDeclaration = {
          name: 'endPanel',
          description: 'Concludes the entire interview session. Call this ONLY when you are the LAST remaining juror and you have finished your questions.',
          parameters: {
              type: Type.OBJECT,
              properties: {
                  reason: {
                      type: Type.STRING,
                      description: "Reason for ending the session.",
                      enum: ["interview_complete", "candidate_failure", "time_limit"]
                  }
              },
              required: ['reason']
          }
      };

      // Determine which tools to use. 
      let activeTools = toolsOverride;
      let systemInstruction = character.systemInstruction;

      if (!activeTools) {
          if (validColleagues.length === 0) {
              console.log("[System] No colleagues available (Final Turn / Single Juror). Enforcing EndPanel.");
              activeTools = [{ functionDeclarations: [endPanelTool] }];
              // Force replace the instruction
              systemInstruction = convertToFinalJurorPrompt(systemInstruction);
          } else {
              activeTools = [{ functionDeclarations: [transferTool] }];
          }
      }

      // --- 3. Gemini Connection ---
      const ai = new GoogleGenAI({ 
          apiKey: process.env.API_KEY, 
          httpOptions: { apiVersion: 'v1alpha' }
      });
      
      // Inject Initial Context if provided
      if (userBio && userBio.trim()) {
        systemInstruction += `\n\n[CANDIDATE INFO]: "${userBio}".`;
      }

      if (initialContext) {
        // Brain logic already updated instruction via onUpdateJuror / transfer logic
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
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            
            // --- Transcript Tracking ---
            if (serverContent?.outputTranscription?.text) {
                currentOutputRef.current += serverContent.outputTranscription.text;
            }
            if (serverContent?.inputTranscription?.text) {
                currentInputRef.current += serverContent.inputTranscription.text;
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

            // --- Tool Calling (Handoff or End) ---
            if (message.toolCall) {
              const transferCall = message.toolCall.functionCalls.find(fc => fc.name === 'transfer');
              const endPanelCall = message.toolCall.functionCalls.find(fc => fc.name === 'endPanel');
              
              if (endPanelCall) {
                  console.log("[EndPanel] Session concluded by AI.");
                  // Capture pending text
                  if (currentInputRef.current.trim()) transcriptBufferRef.current.push(`Candidate: ${currentInputRef.current.trim()}`);
                  if (currentOutputRef.current.trim()) transcriptBufferRef.current.push(`${character.name}: ${currentOutputRef.current.trim()}`);
                  
                  const finalTranscript = transcriptBufferRef.current.join('\n');
                  await disconnect();
                  
                  if (onComplete) {
                      onComplete(finalTranscript);
                  }
                  return;
              }

              if (transferCall) {
                const args = transferCall.args as any;
                const targetName = args.colleague;
                const reason = args.reason || "requested_by_current_juror";
                const context = args.conversation_context;

                const targetChar = charactersRef.current.find(c => c.name === targetName);
                const currentJuror = currentCharacterRef.current;

                if (targetChar && currentJuror) {
                   console.log(`[Transfer] Switching to ${targetName} (${reason})...`);
                   
                   // 1. TICKET LOGIC
                   onTicketDecrement(currentJuror.id);
                   const updatedCharacters = charactersRef.current.map(c => 
                       c.id === currentJuror.id ? {...c, tickets: c.tickets - 1} : c
                   );
                   
                   // 2. Capture Transcript
                   if (currentInputRef.current.trim()) {
                        transcriptBufferRef.current.push(`Candidate: ${currentInputRef.current.trim()}`);
                        currentInputRef.current = "";
                   }
                   if (currentOutputRef.current.trim()) {
                        transcriptBufferRef.current.push(`${character.name}: ${currentOutputRef.current.trim()}`);
                        currentOutputRef.current = "";
                   }
                   const transcriptHistory = transcriptBufferRef.current.join('\n');

                   // 3. IMMEDIATE DISCONNECT
                   await disconnect();
                   
                   // 4. ROSTER & FINAL TURN CHECK
                   const totalRemainingTickets = updatedCharacters.reduce((sum, c) => sum + c.tickets, 0);
                   
                   const finishedJurors = updatedCharacters.filter(c => c.tickets <= 0).map(c => c.name);
                   const blockedListText = finishedJurors.length > 0 
                       ? `[ROSTER UPDATE]: The following jurors have finished their questioning and are UNAVAILABLE: ${finishedJurors.join(', ')}. DO NOT transfer to them.`
                       : "";

                   // 5. Construct FAST ACTION PROMPT
                   let attitudeInstruction = "";
                   if (reason === 'requested_by_user') {
                       attitudeInstruction = `[MODE: USER REQUEST] The user specifically asked to speak to you. Acknowledge this politely.`;
                   } else {
                       attitudeInstruction = `[MODE: HANDOFF] ${currentJuror.name} passed the conversation to you. Acknowledge them.`;
                   }

                   let fastInstruction = `
[SYSTEM EVENT: LIVE TRANSFER]
FROM: ${currentJuror.name}
TO: ${targetChar.name}
REASON: ${reason}
CONTEXT: "${context}"
${blockedListText}

INSTRUCTION:
${attitudeInstruction}
REMINDER: Be concise. Short questions. No fluff.
LANGUAGE: English only.
`;

                   // 6. LAST MAN STANDING LOGIC
                   let nextTools = undefined; // Default to transferTool
                   let targetSystemInstruction = targetChar.systemInstruction;
                   
                   if (totalRemainingTickets <= 1) {
                       console.log("⚠️ [System] Final Turn Detected. Switching to EndPanel Tool.");
                       fastInstruction += `\n\n[SYSTEM NOTICE]: You are the FINAL juror with the LAST ticket. Ask your question, evaluate the answer, and then IMMEDIATELY call the \`endPanel\` tool to conclude the session. DO NOT TRANSFER.`;
                       nextTools = [{ functionDeclarations: [endPanelTool] }];
                       
                       // CRITICAL: Replace the Transfer Rules in the template with Ending Rules
                       // to prevents model confusion.
                       targetSystemInstruction = convertToFinalJurorPrompt(targetSystemInstruction);
                   }

                   let updatedInstruction = fastInstruction + "\n\n" + targetSystemInstruction;
                   
                   const updatedTargetChar = {
                       ...targetChar,
                       systemInstruction: updatedInstruction
                   };

                   // 7. Trigger UI & Connection
                   onTransfer(updatedTargetChar, context);
                   
                   if (sessionPromiseRef.current === null) { 
                        setTimeout(() => {
                             connect(updatedTargetChar, context, nextTools);
                        }, 200);
                   }

                   // 8. Brain Supervision
                   brain.Phase3Transfer(
                       currentJuror.name, 
                       targetChar.name, 
                       transcriptHistory, 
                       context,
                       reason
                   ).then((result) => {
                       if (result) {
                           const newPrompt = updateJurorSystemPrompt(
                               currentJuror.systemInstruction, 
                               result.next_question, 
                               result.memory_update
                           );
                           onUpdateJuror(currentJuror.id, newPrompt);
                       }
                   }).catch(e => console.error("Background Brain Error:", e));

                   return;
                }
              }
            }

            // --- Audio Playback & Recording ---
            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                if (recorderRef.current) {
                    const audioData = base64ToUint8Array(base64Audio);
                    recorderRef.current.addAiAudio(audioData);
                }
                
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.play(base64Audio, (vol) => {
                        setVolume(prev => ({ ...prev, outputVolume: vol }));
                    });
                }
            }

            if (serverContent?.interrupted) {
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.stop();
                }
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
              // Initial greeting trigger via Text (Zero Latency)
              await new Promise(resolve => setTimeout(resolve, 200));
              await sendInitialTrigger(sess);
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
  }, [disconnect, onTransfer, onUpdateJuror, onTicketDecrement, userBio, sendInitialTrigger, onComplete]); 

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { status, volume, error, connect, disconnect };
};
