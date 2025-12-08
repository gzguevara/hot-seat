import React, { useEffect, useState } from 'react';
import { Character, AudioVolumeState, SessionStatus } from '../types';
import Visualizer from './Visualizer';

interface ActiveSessionProps {
  character: Character;
  status: SessionStatus;
  volume: AudioVolumeState;
  onDisconnect: () => void;
  error: string | null;
}

const ActiveSession: React.FC<ActiveSessionProps> = ({ character, status, volume, onDisconnect, error }) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let interval: number;
    if (status === SessionStatus.CONNECTED) {
      interval = window.setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract tailwind color class for text/bg to hex approximation for visualizer
  // Simple mapping for this demo
  const getHexColor = (colorClass: string) => {
    if (colorClass.includes('emerald')) return '#10b981';
    if (colorClass.includes('indigo')) return '#4f46e5';
    if (colorClass.includes('purple')) return '#7e22ce';
    return '#ffffff';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/95 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-md bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative border border-gray-700">
        
        {/* Header Background */}
        <div className={`h-32 w-full ${character.color} absolute top-0 left-0 opacity-20`} />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center p-8 pt-12">
          
          {/* Avatar Ring */}
          <div className="relative">
            <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${character.color} ${status === SessionStatus.CONNECTED ? 'block' : 'hidden'}`}></div>
            <div className={`w-32 h-32 rounded-full p-1.5 ${character.color} shadow-2xl mb-6`}>
              <img 
                src={character.avatarUrl} 
                alt={character.name} 
                className="w-full h-full rounded-full object-cover border-4 border-gray-800"
              />
            </div>
            {status === SessionStatus.CONNECTED && (
               <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-gray-800 rounded-full"></div>
            )}
          </div>

          <h2 className="text-3xl font-bold text-white mb-1">{character.name}</h2>
          <p className="text-gray-400 font-medium mb-6">{character.role}</p>

          {/* Status Indicator */}
          <div className="mb-8 h-8 flex items-center justify-center">
            {status === SessionStatus.CONNECTING && (
              <span className="flex items-center gap-2 text-indigo-400 text-sm font-semibold animate-pulse">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </span>
            )}
            
            {status === SessionStatus.CONNECTED && (
              <div className="flex flex-col items-center">
                <div className="text-gray-500 text-sm font-mono mb-2">{formatTime(duration)}</div>
                <Visualizer 
                  inputVolume={volume.inputVolume} 
                  outputVolume={volume.outputVolume} 
                  activeColor={getHexColor(character.color)} 
                />
              </div>
            )}

            {status === SessionStatus.ERROR && (
              <div className="text-red-400 text-sm font-semibold text-center px-4">
                 {error || "Connection failed"}
              </div>
            )}
          </div>

          {/* Controls */}
          <button 
            onClick={onDisconnect}
            className="group w-full py-4 rounded-xl bg-gray-700/50 hover:bg-red-500/10 hover:text-red-400 text-gray-300 font-semibold transition-all duration-200 border border-gray-600 hover:border-red-500/50 flex items-center justify-center gap-2"
          >
            <span className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M13.409 2.218a2.051 2.051 0 00-2.818 0l-.518.518A2.051 2.051 0 009.555 5.554l.435.435a.75.75 0 001.06 0 .75.75 0 000-1.06l-.435-.435a.551.551 0 010-.78l.518-.518a.55.55 0 01.78 0l.977.977a.75.75 0 101.06-1.06l-.976-.977a.551.551 0 010-.78l.518-.518a.55.55 0 01.78 0l10.607 10.607a.551.551 0 010 .78l-.518.518a.55.55 0 01-.78 0l-.977-.976a.75.75 0 00-1.06 1.06l.977.977c.215.215.215.564 0 .78l-.519.518a.551.551 0 01-.78 0l-.518-.518a2.051 2.051 0 00-2.818 0l-.435-.435a.75.75 0 00-1.06 0 .75.75 0 000 1.06l.435.435a.551.551 0 010 .78l-.518.518a.551.551 0 01-.78 0l-10.607-10.607a.551.551 0 010-.78l.518-.518a.55.55 0 01.78 0l.435.435a.75.75 0 001.06 0 .75.75 0 000-1.06l-.435-.435a2.051 2.051 0 000-2.818l.518-.518z" />
              </svg>
            </span>
            End Conversation
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActiveSession;