import React, { useState, useCallback } from 'react';
import { CHARACTERS } from './constants';
import { Character, SessionStatus } from './types';
import CharacterCard from './components/CharacterCard';
import ActiveSession from './components/ActiveSession';
import { useGeminiLive } from './hooks/useGeminiLive';

type AppState = 'intro' | 'panel' | 'interview';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('intro');
  const [userBio, setUserBio] = useState('');
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);

  // Forward declaration to allow use in hook
  const handleTransfer = useCallback(async (targetCharacter: Character, summary?: string) => {
    console.log("Transferring session to:", targetCharacter.name);
    setActiveCharacter(targetCharacter);
  }, []);

  const connectRef = React.useRef<(c: Character, context?: string) => Promise<void>>(async () => {});

  const { status, volume, error, connect, disconnect } = useGeminiLive({
    userBio,
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

  const handleStartInterview = async () => {
    const zephyr = CHARACTERS.find(c => c.name === 'Zephyr');
    if (zephyr) {
      setActiveCharacter(zephyr);
      setAppState('interview');
      await connect(zephyr);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setActiveCharacter(null);
    setAppState('panel');
  };

  const handleBioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppState('panel');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      {appState === 'intro' && (
        <div className="relative z-10 w-full max-w-lg animate-fade-in">
          <header className="text-center mb-8">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full bg-gray-800/50 border border-gray-700 text-indigo-400 text-xs font-bold tracking-wider uppercase">
              Gemini Live Interview
            </div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight mb-4">
              Candidate Profile
            </h1>
            <p className="text-gray-400">
              Before you enter the panel, tell the interviewers a bit about yourself.
            </p>
          </header>

          <form onSubmit={handleBioSubmit} className="bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <label htmlFor="bio" className="block text-sm font-medium text-gray-300 mb-2">Short Bio / Introduction</label>
              <textarea
                id="bio"
                required
                className="w-full h-32 bg-gray-900 border border-gray-600 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                placeholder="I am a Senior Backend Engineer with 5 years of experience in distributed systems..."
                value={userBio}
                onChange={(e) => setUserBio(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full py-4 text-lg font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all transform hover:scale-[1.02] shadow-lg"
            >
              Enter Waiting Room
            </button>
          </form>
        </div>
      )}

      {appState === 'panel' && (
        <>
          <header className="relative z-10 text-center mb-10 sm:mb-12 animate-fade-in">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full bg-gray-800/50 border border-gray-700 text-indigo-400 text-xs font-bold tracking-wider uppercase">
              Powered by Gemini Live API
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
              The <span className="text-indigo-500">Tech Lead</span> Panel
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              You are about to be grilled by three AI experts. They know your background. Good luck.
            </p>
          </header>

          <main className="relative z-10 w-full max-w-6xl mb-12 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {CHARACTERS.map((char) => (
                  <CharacterCard 
                    key={char.id} 
                    character={char} 
                  />
                ))}
            </div>
          </main>

          <div className="relative z-10 flex flex-col items-center gap-4 animate-fade-in">
            <button 
              onClick={handleStartInterview}
              className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 focus:ring-offset-gray-900 shadow-xl hover:shadow-2xl hover:-translate-y-1"
            >
              <span className="absolute inset-0 w-full h-full rounded-full opacity-0 group-hover:opacity-20 bg-white transition-opacity"></span>
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
              Start Interview Panel
            </button>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <p>Zephyr will initiate the session.</p>
              <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
              <button onClick={() => setAppState('intro')} className="text-indigo-400 hover:text-indigo-300 transition-colors">Edit Bio</button>
            </div>
          </div>
        </>
      )}

      {appState === 'interview' && activeCharacter && (
        <ActiveSession 
          character={activeCharacter}
          status={status}
          volume={volume}
          onDisconnect={handleDisconnect}
          error={error}
        />
      )}
      
      <footer className="relative z-10 mt-16 text-gray-600 text-sm">
        <p>© {new Date().getFullYear()} Gemini Live Interview Simulator. Requires Microphone Access.</p>
      </footer>
    </div>
  );
};

export default App;