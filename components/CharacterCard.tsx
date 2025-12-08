import React from 'react';
import { Character } from '../types';

interface CharacterCardProps {
  character: Character;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character }) => {
  return (
    <div className="group relative bg-gray-800 rounded-2xl p-6 border border-gray-700 h-full flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/90 rounded-2xl pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center text-center flex-grow">
        <div className={`w-24 h-24 rounded-full p-1 mb-4 ${character.color} shadow-lg transition-transform duration-300 group-hover:scale-105`}>
          <img 
            src={character.avatarUrl} 
            alt={character.name} 
            className="w-full h-full rounded-full object-cover border-2 border-white/20"
          />
        </div>
        
        <h3 className="text-2xl font-bold text-white mb-1">{character.name}</h3>
        <p className={`text-sm font-semibold mb-3 px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 inline-block`}>
          {character.role}
        </p>
        
        <p className="text-gray-400 text-sm leading-relaxed mb-4">
          {character.description}
        </p>
      </div>
    </div>
  );
};

export default CharacterCard;