
import React from 'react';

interface IntroViewProps {
  onStart: () => void;
}

const IntroView: React.FC<IntroViewProps> = ({ onStart }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-5xl mx-auto animate-fade-in py-12 px-6">
      
      {/* Hero Title Section */}
      <div className="mb-12 relative group cursor-default">
        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-red-600/20 blur-[100px] rounded-full opacity-50 group-hover:opacity-70 transition-opacity duration-1000"></div>
        
        <h1 className="relative text-7xl md:text-[10rem] font-black text-white tracking-tighter leading-none select-none">
          <span className="text-red-600 inline-block transform group-hover:scale-105 group-hover:text-red-500 transition-all duration-300 drop-shadow-[0_0_30px_rgba(220,38,38,0.5)]">HOT</span>
          <span className="inline-block transform group-hover:scale-95 transition-all duration-300 text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">SEAT</span>
        </h1>
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-80"></div>
      </div>
      
      {/* Intro Text */}
      <div className="space-y-6 max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl md:text-4xl text-white font-bold leading-tight tracking-tight">
          Is your pitch actually <span className="text-red-500 italic">ready?</span>
        </h2>
        <p className="text-lg md:text-xl text-gray-400 leading-relaxed font-light">
          Our AI panel will kindly poke holes in your logic, so the real meeting feels like a vacation.
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-16">
        {[
            { icon: "🎙️", title: "Real-time Practice", desc: "Test your ability to think on your feet." },
            { icon: "🧠", title: "Deep Analysis", desc: "We read your docs to find the plot holes." },
            { icon: "💬", title: "Unfiltered Feedback", desc: "We say what your friends won't." }
        ].map((f, i) => (
            <div key={i} className="bg-black/50 backdrop-blur-sm border border-gray-800 p-6 rounded-2xl hover:border-red-900 transition-colors group">
                <div className="text-3xl mb-3 grayscale group-hover:grayscale-0 transition-all">{f.icon}</div>
                <h3 className="text-white font-black mb-1 uppercase tracking-wider">{f.title}</h3>
                <p className="text-sm text-gray-500 font-mono">{f.desc}</p>
            </div>
        ))}
      </div>

      {/* CTA Button */}
      <button
        onClick={onStart}
        className="group relative px-10 py-5 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white text-xl font-black rounded-2xl shadow-lg shadow-red-900/50 hover:shadow-red-600/40 transition-all transform hover:-translate-y-1 overflow-hidden uppercase tracking-widest"
      >
        <span className="relative z-10 flex items-center gap-3">
            Start Simulation
            <svg className="w-6 h-6 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
        </span>
        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
      </button>

      <p className="mt-6 text-xs text-gray-700 font-mono uppercase tracking-widest">
         • Audio Required •
      </p>
    </div>
  );
};

export default IntroView;
