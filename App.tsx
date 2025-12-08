
import React, { useState, useCallback } from 'react';
import { CHARACTERS } from './constants';
import { Character, SessionStatus } from './types';
import CharacterCard from './components/CharacterCard';
import SetupWizard from './components/SetupWizard';
import { useGeminiLive } from './hooks/useGeminiLive';
import { brain } from './services/Brain';

type AppState = 'setup' | 'interview';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('setup');
  const [contextDesc, setContextDesc] = useState('');
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  
  const [characters, setCharacters] = useState<Character[]>(CHARACTERS);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);

  // Hook Callback: Handle transfers triggered by the AI
  const handleTransfer = useCallback(async (targetCharacter: Character, summary?: string) => {
    // Find the character in our state to ensure we use updated names/roles
    const latestChar = characters.find(c => c.id === targetCharacter.id) || targetCharacter;
    console.log("Transferring session to:", latestChar.name);
    setActiveCharacter(latestChar);
    
    // Note: The actual connection logic is handled via the ref in useGeminiLive, 
    // but updating state here triggers the UI update.
  }, [characters]);

  // We need a ref to call connect from outside the hook if needed (though mostly handled internally now)
  const connectRef = React.useRef<(c: Character, context?: string) => Promise<void>>(async () => {});

  const { status, volume, error, connect, disconnect } = useGeminiLive({
    userBio: contextDesc,
    onTransfer: async (targetChar, summary) => {
       await handleTransfer(targetChar, summary);
       if (connectRef.current) {
         await connectRef.current(targetChar, summary);
       }
    }
  });

  // Keep ref updated
  React.useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const handleDisconnect = async () => {
    await disconnect();
    setActiveCharacter(null);
    setAppState('setup'); // Go back to setup or stay in 'interview' with a "Restart" option? 
                          // UX choice: Go back to setup allows re-config.
  };

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
        setTimeout(() => connect(firstJuror), 100);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      {appState === 'setup' && (
        <div className="relative z-10 w-full flex justify-center animate-fade-in">
           <SetupWizard 
             initialCharacters={CHARACTERS}
             onContextSubmitted={handleWizardContext}
             onComplete={handleWizardComplete}
           />
        </div>
      )}

      {appState === 'interview' && (
        <>
          <div className="absolute top-6 right-6 z-20">
             <button 
                onClick={() => brain.downloadDebugLog()}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-900/50 border border-gray-700 rounded-lg hover:text-white hover:bg-gray-800 transition-colors backdrop-blur-sm"
                title="Download Brain Debug Logs"
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Brain Logs
            </button>
          </div>

          <header className="relative z-10 text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full bg-gray-800/50 border border-gray-700 text-indigo-400 text-xs font-bold tracking-wider uppercase">
              Live Session
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-2">
              The <span className="text-indigo-500">Council</span>
            </h1>
            <p className="text-sm text-gray-400">
                {status === 'CONNECTED' ? 'Microphone Active. Speak clearly.' : 'Establishing secure connection...'}
            </p>
          </header>

          <main className="relative z-10 w-full max-w-6xl mb-12 animate-fade-in">
            {/* The Council Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {characters.map((char) => {
                    const isActive = activeCharacter?.id === char.id;
                    return (
                        <div key={char.id} className={`transition-all duration-500 ${isActive ? 'opacity-100 scale-105' : 'opacity-60 scale-95 grayscale-[0.5]'}`}>
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

          <footer className="relative z-10 animate-fade-in">
            {error && (
                <div className="mb-4 px-4 py-2 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                    {error}
                </div>
            )}
            
            <button 
              onClick={handleDisconnect}
              className="group relative inline-flex items-center justify-center px-8 py-3 text-base font-bold text-gray-300 transition-all duration-200 bg-gray-800 border border-gray-600 rounded-full hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 mr-3 animate-pulse"></span>
              End Session
            </button>
          </footer>
        </>
      )}
      
      <div className="fixed bottom-4 right-4 z-20 text-gray-700 text-xs pointer-events-none">
        Gemini Live API Demo
      </div>
    </div>
  );
};

export default App;
