
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
  const isConnected = status === SessionStatus.CONNECTED;
  const isConnecting = status === SessionStatus.CONNECTING;
  const isFinished = character.tickets <= 0;

  // Map tailwind colors to hex for visualizer
  const getHexColor = (colorClass: string) => {
    if (colorClass.includes('emerald')) return '#10b981';
    if (colorClass.includes('indigo')) return '#4f46e5';
    if (colorClass.includes('purple')) return '#7e22ce';
    if (colorClass.includes('red')) return '#dc2626';
    if (colorClass.includes('orange')) return '#ea580c';
    if (colorClass.includes('stone')) return '#57534e';
    return '#dc2626'; 
  };

  return (
    <div className={`relative w-full aspect-video bg-[#202124] rounded-xl overflow-hidden border transition-all duration-300 flex flex-col items-center justify-center ${
      isActive 
        ? 'border-red-600 shadow-[0_0_30px_rgba(220,38,38,0.2)]' 
        : 'border-[#3c4043]'
    }`}>
      
      {/* Background Ambience (Active Speaker Glow) */}
      {isActive && (
        <div className={`absolute inset-0 opacity-10 bg-gradient-to-t ${character.color} to-transparent pointer-events-none`} />
      )}

      {/* Center Avatar (Video Off Style) */}
      <div className="relative z-10">
          {/* Speaking Ring Animation */}
          {isActive && isConnected && volume.outputVolume > 0.01 && (
             <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-50"></div>
          )}
          
          <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-2 ${isActive ? 'border-red-500' : 'border-gray-600'} shadow-2xl relative`}>
             <img 
               src={character.avatarUrl} 
               alt={character.name} 
               className={`w-full h-full object-cover transition-all duration-500 ${isFinished ? 'grayscale opacity-50' : ''}`}
             />
             
             {/* Connecting Overlay */}
             {isActive && isConnecting && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
             )}
          </div>

          {/* Silenced Indicator */}
          {isFinished && (
              <div className="absolute -bottom-2 -right-2 bg-gray-800 text-gray-400 p-1.5 rounded-full border border-gray-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
              </div>
          )}
      </div>

      {/* Name Tag (Google Meet Style) */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded flex items-center gap-3 border border-white/5 max-w-[80%]">
          <span className="text-white font-medium text-sm truncate shadow-sm">
            {character.name}
          </span>
          <span className="text-[10px] text-gray-300 uppercase tracking-wider border-l border-gray-500 pl-2 truncate">
            {character.role}
          </span>
          
          {/* Visualizer integrated into Name Tag */}
          {isActive && isConnected && (
             <div className="w-10 h-5 flex items-center justify-center">
                 <Visualizer 
                    inputVolume={volume.inputVolume} 
                    outputVolume={volume.outputVolume} 
                    activeColor={getHexColor(character.color)} 
                 />
             </div>
          )}
      </div>

      {/* Ticket Counter (Top Right) */}
      <div className="absolute top-4 right-4 flex gap-1">
          {Array.from({length: character.tickets}).map((_, i) => (
             <div key={i} className={`w-2 h-2 rounded-full shadow-lg ${isActive ? 'bg-red-500' : 'bg-gray-600'}`}></div>
          ))}
      </div>
    </div>
  );
};

export default CharacterCard;
