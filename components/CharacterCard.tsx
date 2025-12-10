
import React from 'react';
import { Character, SessionStatus, AudioVolumeState } from '../types';
import Visualizer from './Visualizer';

interface CharacterCardProps {
  character: Character;
  isActive?: boolean;
  status?: SessionStatus;
  volume?: AudioVolumeState;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ 
  character, 
  isActive = false, 
  status = SessionStatus.DISCONNECTED,
  volume = { inputVolume: 0, outputVolume: 0 }
}) => {
  // Helper to map Tailwind classes to Hex for the Canvas Visualizer
  const getHexColor = (colorClass: string) => {
    if (colorClass.includes('emerald')) return '#10b981';
    if (colorClass.includes('indigo')) return '#4f46e5';
    if (colorClass.includes('purple')) return '#7e22ce';
    return '#ffffff';
  };

  const isConnected = status === SessionStatus.CONNECTED;
  const isConnecting = status === SessionStatus.CONNECTING;
  const isFinished = character.tickets <= 0;

  return (
    <div className={`group relative rounded-2xl p-6 border transition-all duration-300 h-full flex flex-col overflow-hidden ${
      isActive 
        ? 'bg-gray-800 border-indigo-500 shadow-2xl shadow-indigo-500/20 scale-105 z-10' 
        : isFinished
        ? 'bg-gray-900 border-gray-800 opacity-50 grayscale'
        : 'bg-gray-800/60 border-gray-700 hover:bg-gray-800'
    }`}>
      {/* Background Gradient for Active State */}
      {isActive && (
        <div className={`absolute inset-0 bg-gradient-to-b ${character.color} to-gray-900 opacity-10 pointer-events-none`} />
      )}
      
      <div className="relative z-10 flex flex-col items-center text-center flex-grow">
        {/* Avatar Container */}
        <div className="relative mb-4">
            {/* Pulsing Ring Animation */}
            {isActive && isConnected && (
                <div className={`absolute inset-0 rounded-full animate-ping opacity-40 ${character.color}`}></div>
            )}
            
            <div className={`w-24 h-24 rounded-full p-1 ${character.color} shadow-lg transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
            <img 
                src={character.avatarUrl} 
                alt={character.name} 
                className="w-full h-full rounded-full object-cover border-2 border-white/20"
            />
            </div>

            {/* Connecting Spinner */}
            {isActive && isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            )}
        </div>
        
        <h3 className="text-2xl font-bold text-white mb-1">{character.name}</h3>
        <p className={`text-sm font-semibold mb-2 px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 inline-block`}>
          {character.role}
        </p>

        {/* Tickets / Turns Indicator */}
        <div className="flex gap-1 mb-3 justify-center">
            {character.tickets > 0 ? (
                 Array.from({length: character.tickets}).map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-gray-600'}`}></div>
                 ))
            ) : (
                <span className="text-[10px] uppercase font-bold text-red-500/70 border border-red-500/30 px-1.5 rounded">Finished</span>
            )}
        </div>
        
        <p className="text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
          {character.description}
        </p>

        {/* Visualizer Area */}
        <div className="mt-auto h-16 w-full flex items-center justify-center mb-4">
            {isActive && isConnected ? (
                <Visualizer 
                    inputVolume={volume.inputVolume} 
                    outputVolume={volume.outputVolume} 
                    activeColor={getHexColor(character.color)} 
                />
            ) : isActive && isConnecting ? (
                <span className="text-xs text-indigo-400 animate-pulse uppercase tracking-widest font-bold">Connecting...</span>
            ) : isFinished ? (
                <div className="h-0.5 w-12 bg-gray-800 rounded-full" />
            ) : (
                <div className="h-1 w-12 bg-gray-700 rounded-full" />
            )}
        </div>

        {/* System Prompt Debug Field */}
        <div className="w-full text-left pt-3 border-t border-gray-700/50">
           <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 block">
               System Prompt (Debug)
           </label>
           <textarea 
               readOnly
               value={character.systemInstruction}
               className="w-full h-24 bg-gray-900/50 border border-gray-700 rounded-md text-[10px] text-gray-400 p-2 font-mono resize-y focus:outline-none focus:border-indigo-500/50 hover:bg-gray-900 transition-colors custom-scrollbar"
               spellCheck={false}
           />
        </div>
      </div>
    </div>
  );
};

export default CharacterCard;
