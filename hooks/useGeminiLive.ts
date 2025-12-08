
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { Character, SessionStatus, AudioVolumeState } from '../types';
import { MODEL_NAME } from '../constants';
import { pcmToGeminiBlob, base64ToUint8Array } from '../utils/audioUtils';
import { CustomMediaRecorder } from '../utils/CustomMediaRecorder';
import { saveTranscript } from '../utils/transcriptStorage';
import { brain } from '../services/Brain';
import { AudioStreamPlayer } from '../utils/AudioStreamPlayer';

interface UseGeminiLiveProps {
  onTransfer: (character: Character, summary?: string) => void;
  userBio: string;
  characters: Character[];
}

export const useGeminiLive = ({ onTransfer, userBio, characters }: UseGeminiLiveProps) => {
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

  const connect = useCallback(async (character: Character, initialContext?: string) => {
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
      const currentCharacters = charactersRef.current;
      const colleagues = currentCharacters.filter(c => c.id !== character.id);
      
      const transferTool: FunctionDeclaration = {
        name: 'transferToColleague',
        description: `Transfer the conversation to one of your colleagues: ${colleagues.map(c => c.name).join(', ')}. Use this when the user's question is better suited for their expertise.`,
        parameters: {
          type: Type.OBJECT,
          properties: {
            targetName: {
              type: Type.STRING,
              description: "The name of the colleague to transfer to.",
              enum: colleagues.map(c => c.name)
            },
            summary: {
              type: Type.STRING,
              description: "A summary of the conversation so far, explaining why you are transferring and what the user is asking about."
            }
          },
          required: ['targetName', 'summary']
        }
      };

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
          tools: [{ functionDeclarations: [transferTool] }]
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

            // --- Tool Calling (Handoff) ---
            if (message.toolCall) {
              const call = message.toolCall.functionCalls.find(fc => fc.name === 'transferToColleague');
              if (call) {
                const args = call.args as any;
                const targetChar = charactersRef.current.find(c => c.name === args.targetName);
                
                if (targetChar) {
                   console.log("[Transfer] Initiating Brain Phase 3 Analysis...");
                   
                   if (currentInputRef.current.trim()) {
                        transcriptBufferRef.current.push(`Candidate: ${currentInputRef.current.trim()}`);
                        currentInputRef.current = "";
                   }
                   if (currentOutputRef.current.trim()) {
                        transcriptBufferRef.current.push(`${character.name}: ${currentOutputRef.current.trim()}`);
                        currentOutputRef.current = "";
                   }

                   const transcriptHistory = transcriptBufferRef.current.join('\n');
                   const currentName = currentCharacterRef.current?.name || "Interviewer";

                   await disconnect();
                   
                   const newHistorySection = await brain.initializePhase3(
                       currentName, 
                       targetChar.name, 
                       transcriptHistory, 
                       args.summary
                   );

                   const updatedInstruction = targetChar.systemInstruction.replace(
                       /<HISTORY>[\s\S]*?<\/HISTORY>/, 
                       newHistorySection
                   );
                   
                   const updatedTargetChar = {
                       ...targetChar,
                       systemInstruction: updatedInstruction
                   };

                   onTransfer(updatedTargetChar, args.summary);
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
                // No need to reset nextStartTimeRef manually here as player handles it
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
  }, [disconnect, onTransfer, userBio, sendCachedHello]); 

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { status, volume, error, connect, disconnect };
};
