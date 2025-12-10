
import React from 'react';
import { Verdict } from '../types';

interface VerdictViewProps {
  verdict: Verdict;
  onRestart: () => void;
}

const VerdictView: React.FC<VerdictViewProps> = ({ verdict, onRestart }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/50 bg-emerald-900/20';
    if (score >= 60) return 'text-amber-400 border-amber-500/50 bg-amber-900/20';
    return 'text-red-400 border-red-500/50 bg-red-900/20';
  };

  return (
    <div className="w-full max-w-5xl animate-fade-in pb-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
          Session <span className="text-indigo-500">Verdict</span>
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          The council has deliberated. Here is the analysis of your performance, verified against real-world data.
        </p>
      </header>

      {/* Main Score Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-1 flex flex-col items-center justify-center p-8 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-3xl shadow-xl">
          <div className={`relative w-40 h-40 flex items-center justify-center rounded-full border-4 ${getScoreColor(verdict.final_score).split(' ')[1]} mb-4`}>
             <span className={`text-6xl font-black ${getScoreColor(verdict.final_score).split(' ')[0]}`}>
               {verdict.final_score}
             </span>
             {/* Circular Progress (Visual only for now) */}
             <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-700 opacity-20" />
             </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Final Score</h2>
          <span className="text-sm text-gray-400 uppercase tracking-widest font-semibold">
            {verdict.final_score >= 80 ? 'Passed' : verdict.final_score >= 60 ? 'Conditional Pass' : 'Failed'}
          </span>
        </div>

        <div className="md:col-span-2 p-8 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-3xl shadow-xl flex flex-col justify-center">
          <h3 className="text-lg font-bold text-gray-300 uppercase tracking-wider mb-3">Executive Summary</h3>
          <p className="text-gray-300 leading-relaxed text-lg">
            {verdict.session_summary}
          </p>
        </div>
      </div>

      {/* Fact Checks */}
      <div className="mb-8">
         <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
           <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
           Fact Checks & Grounding
         </h3>
         <div className="grid gap-4">
            {verdict.fact_checks.map((fc, i) => (
               <div key={i} className={`p-4 rounded-xl border flex gap-4 ${
                  fc.verdict === 'Verified' ? 'bg-emerald-900/10 border-emerald-500/30' : 
                  fc.verdict === 'Misleading' ? 'bg-amber-900/10 border-amber-500/30' :
                  fc.verdict === 'False' ? 'bg-red-900/10 border-red-500/30' : 'bg-gray-800 border-gray-700'
               }`}>
                  <div className={`mt-1 font-bold px-2 py-0.5 rounded text-xs h-fit ${
                      fc.verdict === 'Verified' ? 'bg-emerald-500/20 text-emerald-400' :
                      fc.verdict === 'Misleading' ? 'bg-amber-500/20 text-amber-400' :
                      fc.verdict === 'False' ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {fc.verdict}
                  </div>
                  <div>
                     <p className="text-gray-200 font-medium mb-1">"{fc.claim}"</p>
                     <p className="text-sm text-gray-400">{fc.context}</p>
                     {fc.source && (
                        <a href={fc.source} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">
                           Source: {new URL(fc.source).hostname} ↗
                        </a>
                     )}
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Pros & Cons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-2xl">
           <h4 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
             Key Strengths
           </h4>
           <ul className="space-y-2">
              {verdict.pros.map((p, i) => (
                 <li key={i} className="text-gray-300 text-sm flex gap-2">
                    <span className="text-emerald-500/50">•</span> {p}
                 </li>
              ))}
           </ul>
        </div>
        <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-2xl">
           <h4 className="text-red-400 font-bold mb-4 flex items-center gap-2">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
             Areas for Improvement
           </h4>
           <ul className="space-y-2">
              {verdict.cons.map((c, i) => (
                 <li key={i} className="text-gray-300 text-sm flex gap-2">
                    <span className="text-red-500/50">•</span> {c}
                 </li>
              ))}
           </ul>
        </div>
      </div>

      {/* Improvement Plan */}
      <div className="p-8 bg-indigo-900/10 border border-indigo-500/30 rounded-3xl">
         <h3 className="text-xl font-bold text-white mb-6">Actionable Improvement Plan</h3>
         <div className="space-y-4">
            {verdict.improvement_plan.map((step, i) => (
               <div key={i} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-gray-300 pt-1">{step}</p>
               </div>
            ))}
         </div>
      </div>

      <div className="mt-12 flex justify-center">
         <button 
           onClick={onRestart}
           className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all"
         >
           Start New Session
         </button>
      </div>
    </div>
  );
};

export default VerdictView;
