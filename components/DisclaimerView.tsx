
import React from 'react';

interface DisclaimerViewProps {
  onContinue: () => void;
}

const DisclaimerView: React.FC<DisclaimerViewProps> = ({ onContinue }) => {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 animate-fade-in max-w-2xl mx-auto">
      
      <div className="bg-[#202124] border border-gray-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-red-900/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-red-900/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col items-center text-center relative z-10">
          
          <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mb-6 border border-red-900/50">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </div>

          <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">Audio System Check</h1>
          <p className="text-gray-400 font-mono text-sm mb-10">
            For the best simulation experience, please review the following requirements.
          </p>

          <div className="grid gap-4 w-full text-left mb-10">
            
            {/* Recommendation 1: Quiet Room */}
            <div className="flex items-start gap-4 p-4 bg-black/40 rounded-xl border border-gray-700/50">
              <div className="p-2 bg-gray-800 rounded-lg text-emerald-500 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm uppercase tracking-wide">Quiet Environment</h3>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  The AI is sensitive to background noise. Find a quiet room to prevent the model from interrupting itself or hearing ghosts.
                </p>
              </div>
            </div>

            {/* Recommendation 2: Hardware */}
            <div className="flex items-start gap-4 p-4 bg-black/40 rounded-xl border border-gray-700/50">
              <div className="p-2 bg-gray-800 rounded-lg text-blue-400 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm uppercase tracking-wide">Computer Audio Preferred</h3>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  Use your computer's native microphone and speakers. They usually provide superior echo cancellation compared to the browser's handling of external devices.
                </p>
              </div>
            </div>

            {/* Warning: Headphones */}
            <div className="flex items-start gap-4 p-4 bg-red-950/20 rounded-xl border border-red-900/30">
              <div className="p-2 bg-gray-800 rounded-lg text-orange-500 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-orange-400 font-bold text-sm uppercase tracking-wide">Bluetooth / Headphone Warning</h3>
                <p className="text-orange-200/70 text-xs mt-1 leading-relaxed">
                  Bluetooth headsets and headphones may cause latency, stability issues, or audio artifacts with the Live API. If you experience issues, unplug them and refresh.
                </p>
              </div>
            </div>

          </div>

          <button
            onClick={onContinue}
            className="w-full py-4 bg-white hover:bg-gray-200 text-black font-black rounded-xl transition-all shadow-lg uppercase tracking-widest text-sm flex items-center justify-center gap-2 group"
          >
            I Understand
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>

        </div>
      </div>
    </div>
  );
};

export default DisclaimerView;
