
import React, { useState, useCallback } from 'react';
import { CHARACTERS } from './constants';
import { Character, SessionStatus, Verdict } from './types';
import CharacterCard from './components/CharacterCard';
import SetupWizard from './components/SetupWizard';
import VerdictView from './components/VerdictView';
import IntroView from './components/IntroView';
import { useGeminiLive } from './hooks/useGeminiLive';
import { brain } from './services/Brain';

type AppState = 'intro' | 'setup' | 'interview' | 'analyzing' | 'verdict';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('intro');
  const [contextDesc, setContextDesc] = useState('');
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  
  // Note: Characters now have 'tickets' property
  const [characters, setCharacters] = useState<Character[]>(CHARACTERS.map(c => ({...c, tickets: 1})));
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  // Hook Callback: Handle transfers triggered by the AI
  const handleTransfer = useCallback(async (targetCharacter: Character, summary?: string) => {
    // Find the character in our state to ensure we use updated names/roles
    const latestChar = characters.find(c => c.id === targetCharacter.id) || targetCharacter;
    console.log("Transferring session to:", latestChar.name);
    setActiveCharacter(latestChar);
  }, [characters]);

  // Hook Callback: Background update of a specific juror's prompt (Memory Injection)
  const handleUpdateJurorInstruction = useCallback((jurorId: string, newInstruction: string) => {
    setCharacters(prevChars => prevChars.map(c => {
        if (c.id === jurorId) {
            console.log(`[App] 🧠 Updating memory/prompt for ${c.name}`);
            return { ...c, systemInstruction: newInstruction };
        }
        return c;
    }));
  }, []);

  // Hook Callback: Decrement ticket for a juror
  const handleTicketDecrement = useCallback((jurorId: string) => {
      setCharacters(prevChars => prevChars.map(c => {
          if (c.id === jurorId) {
              const newTickets = Math.max(0, c.tickets - 1);
              console.log(`[App] 🎫 ${c.name} used a ticket. Remaining: ${newTickets}`);
              return { ...c, tickets: newTickets };
          }
          return c;
      }));
  }, []);

  // We need a ref to call connect from outside the hook if needed (though mostly handled internally now)
  const connectRef = React.useRef<(c: Character, context?: string) => Promise<void>>(async () => {});

  const handleDisconnect = async () => {
    if (disconnectRef.current) await disconnectRef.current();
    setActiveCharacter(null);
    if (appState !== 'analyzing') {
        setAppState('setup');
    }
  };

  const handleComplete = useCallback(async (fullTranscript: string) => {
      console.log("[App] Session Complete. Starting Phase 4 Deliberation...");
      setAppState('analyzing');
      // Ensure audio is stopped
      if (disconnectRef.current) await disconnectRef.current();
      setActiveCharacter(null);

      // Trigger Brain Phase 4
      const result = await brain.initializePhase4(fullTranscript);
      if (result) {
          setVerdict(result);
          setAppState('verdict');
      } else {
          // Fallback if brain fails
          console.error("Analysis failed.");
          setAppState('setup'); 
      }
  }, []);

  const { status, volume, error, connect, disconnect, isMuted, toggleMute } = useGeminiLive({
    userBio: contextDesc,
    onTransfer: async (targetChar, summary) => {
       // Only update UI state. The hook handles the reconnection logic internally.
       await handleTransfer(targetChar, summary);
    },
    onUpdateJuror: handleUpdateJurorInstruction,
    onTicketDecrement: handleTicketDecrement,
    onComplete: handleComplete,
    characters: characters
  });

  // Keep refs updated for manual calls
  React.useEffect(() => {
    connectRef.current = connect;
  }, [connect]);
  
  // Create a ref for disconnect so handleDisconnect can access it without circular dependency issues in useCallback
  const disconnectRef = React.useRef(disconnect);
  React.useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);


  const handleWizardContext = (desc: string, files: File[]) => {
    setContextDesc(desc);
    setContextFiles(files);
  };

  const handleWizardComplete = async (updatedJurors: Character[]) => {
    setCharacters(updatedJurors);
    setAppState('interview');
    
    // Auto-start the interview immediately with the first juror
    const firstJuror = updatedJurors[0];
    if (firstJuror) {
        setActiveCharacter(firstJuror);
        // Small delay to ensure UI renders the council view before connecting
        setTimeout(() => connect(firstJuror), 200);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#18191a] text-white flex flex-col overflow-hidden relative selection:bg-red-700 selection:text-white print:overflow-visible print:h-auto print:bg-white print:block">
      
      {appState === 'intro' && (
        <div className="flex-1 flex items-center justify-center overflow-auto">
            <IntroView onStart={() => setAppState('setup')} />
        </div>
      )}

      {appState === 'setup' && (
        <div className="flex-1 flex items-center justify-center overflow-auto p-8">
           <SetupWizard 
             initialCharacters={CHARACTERS}
             onContextSubmitted={handleWizardContext}
             onComplete={handleWizardComplete}
           />
        </div>
      )}

      {appState === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
             <div className="w-24 h-24 mb-6 relative">
                 <div className="absolute inset-0 rounded-full border-t-4 border-red-600 animate-spin"></div>
                 <div className="absolute inset-2 rounded-full border-r-4 border-red-900 animate-spin-reverse opacity-70"></div>
             </div>
             <h2 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase">Compiling Results</h2>
             <p className="text-red-400 font-mono text-sm">Reviewing transcript... Fact checking... Generating report...</p>
        </div>
      )}

      {appState === 'verdict' && verdict && (
         <div className="absolute inset-0 z-50 overflow-y-auto bg-black/95 backdrop-blur-xl animate-fade-in print:relative print:inset-auto print:bg-white print:overflow-visible print:z-auto print:h-auto">
             <div className="min-h-full flex justify-center p-6 sm:p-12 print:p-0 print:block">
                <VerdictView 
                   verdict={verdict} 
                   onRestart={() => setAppState('setup')} 
                />
             </div>
         </div>
      )}

      {appState === 'interview' && (
        <div className="flex flex-col h-full">
          {/* Minimal Header */}
          <header className="h-14 flex items-center px-6 border-b border-[#3c4043] bg-[#202124] justify-between z-20">
             <div className="flex items-center gap-3">
                 <div className="bg-red-600 w-2 h-2 rounded-full animate-pulse"></div>
                 <h1 className="text-sm font-medium tracking-wide text-gray-200 uppercase">Live Simulation <span className="text-gray-500 mx-2">|</span> {activeCharacter?.name || "Connecting..."}</h1>
             </div>
             <div className="text-xs font-mono text-gray-500">
                {status === 'CONNECTED' ? '● REC' : 'CONNECTING...'}
             </div>
          </header>

          {/* Gallery View */}
          <main className="flex-1 p-4 md:p-8 flex items-center justify-center bg-[#18191a]">
            <div className={`grid w-full max-w-7xl gap-4 ${
                characters.length <= 1 ? 'grid-cols-1 max-w-4xl' : 
                characters.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : 
                'grid-cols-1 md:grid-cols-3'
            }`}>
                {characters.map((char) => {
                    const isActive = activeCharacter?.id === char.id;
                    return (
                        <div key={char.id} className="w-full h-full min-h-[250px] md:min-h-[350px]">
                            <CharacterCard 
                                character={char} 
                                isActive={isActive}
                                status={isActive ? status : undefined}
                                volume={isActive ? volume : undefined}
                            />
                        </div>
                    );
                })}
            </div>
          </main>

          {/* Call Controls Bar */}
          <footer className="h-20 bg-[#202124] flex items-center justify-center gap-6 border-t border-[#3c4043] relative z-20">
             {/* Mute Button */}
             <button 
                onClick={toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors text-white group ${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-[#3c4043] hover:bg-[#474a4d]'}`}
             >
                {isMuted ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                )}
             </button>

             {/* End Call Button */}
             <button 
                onClick={handleDisconnect}
                className="w-16 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-all hover:shadow-red-900/40 px-6 gap-2"
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
             </button>
             
             {error && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-red-500 text-xs font-bold bg-red-900/20 px-3 py-1 rounded border border-red-900/50">
                    ERROR: {error}
                </div>
            )}
          </footer>
        </div>
      )}
    </div>
  );
};

export default App;
