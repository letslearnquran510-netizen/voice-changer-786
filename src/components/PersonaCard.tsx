import React from 'react';
import { Persona } from '../types';

interface PersonaCardProps {
  persona: Persona;
  isSelected: boolean;
  onClick: (persona: Persona) => void;
  disabled?: boolean;
}

const PersonaCard: React.FC<PersonaCardProps> = ({ persona, isSelected, onClick, disabled }) => {
  return (
    <button
      onClick={() => onClick(persona)}
      disabled={disabled}
      className={`
        relative overflow-hidden group flex flex-col items-start p-4 rounded-xl border transition-all duration-300 w-full text-left
        ${isSelected
          ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
          : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/60'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl bg-zinc-950 p-2 rounded-lg border border-zinc-800">
          {persona.icon}
        </span>
        <div>
          <h3 className={`font-semibold ${isSelected ? 'text-blue-400' : 'text-zinc-200'}`}>
            {persona.name}
          </h3>
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-mono">
            {persona.voiceName}
          </span>
        </div>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed">
        {persona.description}
      </p>

      {isSelected && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]" />
      )}
    </button>
  );
};

export default PersonaCard;
 
