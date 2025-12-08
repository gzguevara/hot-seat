import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { Character, SessionStatus, AudioVolumeState } from '../types';
import { MODEL_NAME, CHARACTERS } from '../constants';
import { pcmToGeminiBlob, base64ToUint8Array, decodeAudioData } from '../utils/audioUtils';
import { CustomMediaRecorder } from '../utils/CustomMediaRecorder';
import { saveTranscript } from '../utils/transcriptStorage';

interface UseGeminiLiveProps {
  onTransfer: (character: Character, summary?: string) => void;
  userBio: string;
}

export const useGeminiLive = ({ onTransfer, userBio }: UseGeminiLiveProps) => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.DISCONNECTED);
  const [volume, setVolume] = useState<AudioVolumeState>({ inputVolume: 0, outputVolume: 0 });
  const [error, setError] = useState<string | null>(null);

  // References for audio handling
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Custom Recorder
  const recorderRef = useRef<CustomMediaRecorder | null>(null);

  // Cache for the hello.wav buffer
  const helloBufferRef = useRef<ArrayBuffer | null>(null);

  // API Reference
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentSessionRef = useRef<any>(null);

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
        
        // Fix for empty log: Explicitly log size to prove data existence
        console.log(`[System] Session ended. Recording ready. Size: ${blob.size} bytes`);
        
        // Store in the simulated app folder instead of downloading
        await saveTranscript(blob);
    }
    // Reset recorder
    recorderRef.current = null;

    if (inputContextRef.current) {
      await inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      await outputContextRef.current.close();
      outputContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    scheduledSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    scheduledSourcesRef.current.clear();

    if (currentSessionRef.current) {
        try { currentSessionRef.current.close(); } catch(e) { console.warn(e); }
        currentSessionRef.current = null;
    }
    
    sessionPromiseRef.current = null;
    setStatus(SessionStatus.DISCONNECTED);
    setVolume({ inputVolume: 0, outputVolume: 0 });
    nextStartTimeRef.current = 0;
  }, []);

  const connect = useCallback(async (character: Character, initialContext?: string) => {
    try {
      setStatus(SessionStatus.CONNECTING);
      setError(null);
      
      // Initialize Recorder
      recorderRef.current = new CustomMediaRecorder();

      // --- 1. Audio Setup ---
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputContext;
      
      const outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputContextRef.current = outputContext;

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
      const colleagues = CHARACTERS.filter(c => c.id !== character.id);
      
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
      
      if (userBio && userBio.trim()) {
        systemInstruction += `\n\n[CANDIDATE INFO]: The candidate has provided the following bio: "${userBio}". Use this to tailor your questions and assess their specific background level.`;
      }

      if (initialContext) {
        systemInstruction += `\n\n[SYSTEM NOTICE]: You are in a panel interview. Your colleague just turned to you to continue the line of questioning. \nContext from previous expert: "${initialContext}". \n[IMPORTANT]: You have now taken the floor. Respond directly to the context provided by your colleague. Do not re-introduce yourself. Jump right in.`;
      } else {
        systemInstruction += `\n\n[SYSTEM NOTICE]: The user has entered the interview room. \n[IMPORTANT]: Welcome the candidate and start the interview when you hear the "Hello" trigger.`;
      }

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
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
            
            if (message.toolCall) {
              const call = message.toolCall.functionCalls.find(fc => fc.name === 'transferToColleague');
              if (call) {
                const args = call.args as any;
                const targetChar = CHARACTERS.find(c => c.name === args.targetName);
                if (targetChar) {
                   await disconnect();
                   onTransfer(targetChar, args.summary);
                   return;
                }
              }
            }

            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputContextRef.current) {
               const ctx = outputContextRef.current;
               const audioData = base64ToUint8Array(base64Audio);

               // Feed AI Audio to Recorder
               if (recorderRef.current) {
                   recorderRef.current.addAiAudio(audioData);
               }
               
               let sum = 0;
               const sampleCheckLen = Math.min(audioData.length, 100);
               for(let i=0; i<sampleCheckLen; i++) sum += (audioData[i]/255) * (audioData[i]/255);
               setVolume(prev => ({ ...prev, outputVolume: Math.min(1, Math.sqrt(sum/sampleCheckLen) * 2) }));

               const audioBuffer = await decodeAudioData(audioData, ctx, 24000, 1);
               const source = ctx.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(ctx.destination);
               
               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
               
               scheduledSourcesRef.current.add(source);
               source.onended = () => {
                   scheduledSourcesRef.current.delete(source);
                   setVolume(prev => ({ ...prev, outputVolume: prev.outputVolume * 0.8 })); 
               };
            }

            if (serverContent?.interrupted) {
                scheduledSourcesRef.current.forEach(s => s.stop());
                scheduledSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
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