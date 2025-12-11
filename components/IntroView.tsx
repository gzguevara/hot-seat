
import React from 'react';

interface IntroViewProps {
  onStart: () => void;
}

const IntroView: React.FC<IntroViewProps> = ({ onStart }) => {
  return (
    <div className="min-h-full flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 max-w-[90rem] mx-auto animate-fade-in">
      
      {/* Hero Section */}
      <div className="text-center mb-16 relative">
         {/* Background Glow */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 blur-[120px] rounded-full pointer-events-none"></div>

         <h1 className="relative text-6xl md:text-9xl font-black tracking-tighter text-white mb-6 drop-shadow-2xl select-none">
            HOT <span className="text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900">SEAT</span>
         </h1>
         
         <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto font-light leading-relaxed">
            The AI-powered panel discussion for your ideas. <br/>
            <span className="text-red-500 font-medium">Upload your pitch. Face the panel. Survive the questions.</span>
         </p>
      </div>

      {/* How it Works Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl mb-16 relative z-10">
          {[
              { 
                  step: "01", 
                  title: "Upload Context", 
                  desc: "Drop your Pitch Deck, Resume, or Technical Design. The AI reads it instantly.",
                  icon: (
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  )
              },
              { 
                  step: "02", 
                  title: "The Analysis", 
                  desc: "Our 'Brain' cross-references your claims with Google Search to find weak spots.",
                  icon: (
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )
              },
              { 
                  step: "03", 
                  title: "Live Simulation", 
                  desc: "Debate an AI juror panel with distinct personalities in a real-time voice call.",
                  icon: (
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )
              },
              { 
                  step: "04", 
                  title: "The Verdict", 
                  desc: "Receive a brutal performance review with fact-checks and a pass/fail grade.",
                  icon: (
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  )
              }
          ].map((item, i) => (
              <div key={i} className="bg-gray-900/50 backdrop-blur border border-gray-800 p-8 rounded-3xl hover:bg-gray-800/50 hover:border-red-500/30 transition-all group cursor-default">
                  <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-gray-800 rounded-2xl text-red-500 group-hover:scale-110 transition-transform shadow-lg shadow-black/50">
                          {item.icon}
                      </div>
                      <span className="text-5xl font-black text-gray-800 group-hover:text-gray-700 transition-colors select-none">
                          {item.step}
                      </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                  <p className="text-gray-400 leading-relaxed text-sm font-medium">
                      {item.desc}
                  </p>
              </div>
          ))}
      </div>

      {/* Start Button Area */}
      <div className="flex flex-col items-center gap-6 relative z-10">
          <button
            onClick={onStart}
            className="group relative px-12 py-6 bg-red-600 hover:bg-red-500 text-white text-xl font-black rounded-full shadow-[0_0_40px_rgba(220,38,38,0.4)] hover:shadow-[0_0_60px_rgba(220,38,38,0.6)] transition-all transform hover:-translate-y-1 active:translate-y-0"
          >
            <span className="flex items-center gap-4">
                ENTER THE HOT SEAT
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
            </span>
          </button>
          
          <div className="flex items-center gap-2 text-xs font-mono text-gray-600 uppercase tracking-widest bg-black/40 px-4 py-2 rounded-full border border-white/5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              Microphone Access Required
          </div>
      </div>

    </div>
  );
};

export default IntroView;
