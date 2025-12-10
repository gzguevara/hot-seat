
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
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
}

export const useGeminiLive = ({ onTransfer, onUpdateJuror, onTicketDecrement, userBio, characters }: UseGeminiLiveProps) => {
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

  // Cache for the hello.wav buffer
  const helloBufferRef = useRef<ArrayBuffer | null>(null);

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

  // Pre-load hello.wav on mount
  useEffect(() => {
    const fetchHello = async () => {
      try {
        const response = await fetch('hello.wav');
        if (response.ok) {
          helloBufferRef.current = await response.arrayBuffer();
        }
      } catch (e) {
        console.warn("Error pre-fetching hello.wav", e);
      }
    };
    fetchHello();
  }, []);

  const sendCachedHello = useCallback(async (session: any) => {
    try {
        if (!inputContextRef.current) return;

        let audioDataToDecode: ArrayBuffer;

        if (helloBufferRef.current) {
          audioDataToDecode = helloBufferRef.current.slice(0);
        } else {
          console.log("Fetching hello.wav (cache miss)...");
          const response = await fetch('hello.wav');
          if (!response.ok) throw new Error("Failed to fetch hello.wav");
          const rawBuffer = await response.arrayBuffer();
          helloBufferRef.current = rawBuffer.slice(0);
          audioDataToDecode = rawBuffer;
        }
        
        const audioBuffer = await inputContextRef.current.decodeAudioData(audioDataToDecode);
        const pcmData = audioBuffer.getChannelData(0);
        const blob = pcmToGeminiBlob(pcmData, 16000);
        
        console.log("Sending hello.wav trigger...");
        session.sendRealtimeInput({ media: blob });
    } catch (e) {
        console.error("Error sending hello.wav:", e);
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
      
      // Initialize Recorder
      recorderRef.current = new CustomMediaRecorder();
      // Initialize Player
      audioPlayerRef.current = new AudioStreamPlayer(24000);

      // --- 1. Audio Setup ---
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputContext;

      const source = inputContext.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      
      const scriptProcessor = inputContext.createScriptProcessor(4096, 1, 1);
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
      // Filter out colleagues who have 0 tickets left
      const currentCharacters = charactersRef.current;
      const validColleagues = currentCharacters.filter(c => c.id !== character.id && c.tickets > 0);
      
      // Consolidated Transfer Tool
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
              enum: ["requested_by_current_juror", "requested_by_user", "interrupted_by_juror"]
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
              properties: {},
          }
      };

      // Determine which tools to use. If override provided (Last Turn), use that.
      const activeTools = toolsOverride ? toolsOverride : [{ functionDeclarations: [transferTool] }];

      // --- 3. Gemini Connection ---
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let systemInstruction = character.systemInstruction;
      
      // Inject Initial Context if provided (from previous handoff or start)
      if (userBio && userBio.trim()) {
        systemInstruction += `\n\n[CANDIDATE INFO]: "${userBio}".`;
      }

      if (initialContext) {
        // Brain logic already updated instruction
      } else {
        systemInstruction += `\n\n[SYSTEM NOTICE]: Welcome the candidate and start the interview when you hear the "Hello" trigger.`;
      }

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {}, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } }
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
                  await disconnect();
                  // Ideally trigger a "Summary/Verdict" view here
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
                   
                   // 1. TICKET LOGIC: Decrement Current Juror's Ticket
                   onTicketDecrement(currentJuror.id);
                   // Update local ref simulation for immediate logic
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
                   
                   // 4. ROSTER INJECTION & FINAL TURN CHECK
                   // Calculate remaining total tickets across ALL jurors
                   // Note: We use updatedCharacters where the current decrement is applied
                   const totalRemainingTickets = updatedCharacters.reduce((sum, c) => sum + c.tickets, 0);
                   
                   // Identify finished jurors for the Blocked List
                   const finishedJurors = updatedCharacters.filter(c => c.tickets <= 0).map(c => c.name);
                   const blockedListText = finishedJurors.length > 0 
                       ? `[ROSTER UPDATE]: The following jurors have finished their questioning and are UNAVAILABLE: ${finishedJurors.join(', ')}. DO NOT transfer to them.`
                       : "";

                   // 5. Construct FAST ACTION PROMPT
                   let attitudeInstruction = "";
                   if (reason === 'interrupted_by_juror') {
                       attitudeInstruction = `[MODE: INTERRUPT] You are interrupting ${currentJuror.name} IMMEDIATELY. They were cut off. Speak forcefully.`;
                   } else if (reason === 'requested_by_user') {
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
`;

                   // 6. LAST MAN STANDING LOGIC
                   // If the TARGET juror has the LAST remaining ticket (total == 1 and target has it),
                   // or if generally totalRemainingTickets <= 1 (since target must have at least 1 to be selected)
                   let nextTools = undefined; // Default to transferTool
                   
                   // Important: The targetChar we found from `charactersRef` might be stale regarding tickets if we didn't update ref manually,
                   // but `totalRemainingTickets` uses the locally computed state.
                   // If totalRemainingTickets is 1, it implies ONLY the targetChar has a turn left.
                   if (totalRemainingTickets <= 1) {
                       console.log("⚠️ [System] Final Turn Detected. Switching to EndPanel Tool.");
                       fastInstruction += `\n\n[SYSTEM NOTICE]: You are the FINAL juror with the LAST ticket. Ask your question, evaluate the answer, and then IMMEDIATELY call the \`endPanel\` tool to conclude the session. DO NOT TRANSFER.`;
                       nextTools = [{ functionDeclarations: [endPanelTool] }];
                   }

                   // Prepend to ensure high priority
                   let updatedInstruction = fastInstruction + "\n\n" + targetChar.systemInstruction;
                   
                   const updatedTargetChar = {
                       ...targetChar,
                       systemInstruction: updatedInstruction
                   };

                   // 7. Trigger UI update & New Connection
                   onTransfer(updatedTargetChar, context);
                   
                   // Pass the nextTools (either transfer or endPanel) to the connect function
                   if (sessionPromiseRef.current === null) { 
                        // Wait briefly to ensure state settles if needed, though disconnect() cleared ref
                        // We actually need to return here and let the parent call connect via ref
                        // But wait, we are inside the hook. We can call connect directly!
                        // The `onTransfer` callback updates the App state, but we can reconnect immediately.
                        // However, we need to pass the *new tools* to connect.
                        // connect() reads charactersRef, so we need to be careful.
                        // We will add a `toolsOverride` param to connect().
                        setTimeout(() => {
                             connect(updatedTargetChar, context, nextTools);
                        }, 200);
                   }

                   // 8. Fire and forget: Brain Supervision
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
                // 1. Record (Add to global mix)
                if (recorderRef.current) {
                    const audioData = base64ToUint8Array(base64Audio);
                    recorderRef.current.addAiAudio(audioData);
                }
                
                // 2. Play (Stream)
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
              // Initial greeting trigger
              await new Promise(resolve => setTimeout(resolve, 200));
              await sendCachedHello(sess);
          } catch (e) {
              console.error("Error processing hello.wav:", e);
          }
      });

    } catch (e: any) {
      console.error("Failed to connect", e);
      setError(e.message);
      setStatus(SessionStatus.ERROR);
      disconnect();
    }
  }, [disconnect, onTransfer, onUpdateJuror, onTicketDecrement, userBio, sendCachedHello]); 

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { status, volume, error, connect, disconnect };
};
