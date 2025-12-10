
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

  const renderSource = (source: string) => {
    try {
        const url = new URL(source);
        return (
            <a href={source} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">
                Source: {url.hostname} ↗
            </a>
        );
    } catch (e) {
        // Fallback for non-URL sources (e.g. "N/A", "Textbook", or simple text)
        return (
            <span className="text-xs text-gray-500 mt-1 inline-block">
                Source: {source}
            </span>
        );
    }
  };

  const handlePrint = () => {
      window.print();
  };

  const handleDownload = () => {
    const lines = [
        `# Session Verdict`,
        `Date: ${new Date().toLocaleDateString()}`,
        `Final Score: ${verdict.final_score}/100`,
        ``,
        `## Executive Summary`,
        verdict.session_summary,
        ``,
        `## Fact Checks & Grounding`,
        ...verdict.fact_checks.map(fc => 
            `- Claim: "${fc.claim}"\n  Verdict: ${fc.verdict}\n  Context: ${fc.context}\n  Source: ${fc.source || 'N/A'}`
        ),
        ``,
        `## Key Strengths`,
        ...verdict.pros.map(p => `- ${p}`),
        ``,
        `## Areas for Improvement`,
        ...verdict.cons.map(c => `- ${c}`),
        ``,
        `## Actionable Improvement Plan`,
        ...verdict.improvement_plan.map((step, i) => `${i+1}. ${step}`)
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verdict-report-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-5xl animate-fade-in pb-12 print:pb-0 print:text-black print:max-w-none print:w-full">
      <header className="text-center mb-12 print:mb-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4 print:text-black">
          Session <span className="text-indigo-500 print:text-black">Verdict</span>
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto print:text-gray-600">
          The council has deliberated. Here is the analysis of your performance.
        </p>
      </header>

      {/* Main Score Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:block print:mb-4">
        <div className="md:col-span-1 flex flex-col items-center justify-center p-8 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-3xl shadow-xl print:border-gray-300 print:bg-white print:shadow-none print:p-4 print:mb-4">
          <div className={`relative w-40 h-40 flex items-center justify-center rounded-full border-4 ${getScoreColor(verdict.final_score).split(' ')[1]} mb-4 print:border-black`}>
             <span className={`text-6xl font-black ${getScoreColor(verdict.final_score).split(' ')[0]} print:text-black`}>
               {verdict.final_score}
             </span>
             {/* Circular Progress (Visual only for now) */}
             <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none print:hidden" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-700 opacity-20" />
             </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-1 print:text-black">Final Score</h2>
          <span className="text-sm text-gray-400 uppercase tracking-widest font-semibold print:text-gray-600">
            {verdict.final_score >= 80 ? 'Passed' : verdict.final_score >= 60 ? 'Conditional Pass' : 'Failed'}
          </span>
        </div>

        <div className="md:col-span-2 p-8 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-3xl shadow-xl flex flex-col justify-center print:border-gray-300 print:bg-white print:shadow-none print:p-0">
          <h3 className="text-lg font-bold text-gray-300 uppercase tracking-wider mb-3 print:text-black">Executive Summary</h3>
          <p className="text-gray-300 leading-relaxed text-lg print:text-gray-800">
            {verdict.session_summary}
          </p>
        </div>
      </div>

      {/* Fact Checks */}
      <div className="mb-8 print:mb-4">
         <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 print:text-black">
           <svg className="w-5 h-5 text-blue-400 print:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
           Fact Checks & Grounding
         </h3>
         <div className="grid gap-4 print:block">
            {verdict.fact_checks.map((fc, i) => (
               <div key={i} className={`p-4 rounded-xl border flex gap-4 print:border-gray-300 print:bg-white print:mb-2 print:break-inside-avoid ${
                  fc.verdict === 'Verified' ? 'bg-emerald-900/10 border-emerald-500/30' : 
                  fc.verdict === 'Misleading' ? 'bg-amber-900/10 border-amber-500/30' :
                  fc.verdict === 'False' ? 'bg-red-900/10 border-red-500/30' : 'bg-gray-800 border-gray-700'
               }`}>
                  <div className={`mt-1 font-bold px-2 py-0.5 rounded text-xs h-fit print:border print:border-gray-400 print:bg-gray-100 print:text-black ${
                      fc.verdict === 'Verified' ? 'bg-emerald-500/20 text-emerald-400' :
                      fc.verdict === 'Misleading' ? 'bg-amber-500/20 text-amber-400' :
                      fc.verdict === 'False' ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {fc.verdict}
                  </div>
                  <div>
                     <p className="text-gray-200 font-medium mb-1 print:text-black">"{fc.claim}"</p>
                     <p className="text-sm text-gray-400 print:text-gray-700">{fc.context}</p>
                     <div className="print:hidden">{fc.source && renderSource(fc.source)}</div>
                     {fc.source && <div className="hidden print:block text-xs text-gray-500 mt-1">Source: {fc.source}</div>}
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Pros & Cons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 print:block print:mb-4">
        <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-2xl print:border-gray-300 print:bg-white print:mb-4 print:break-inside-avoid">
           <h4 className="text-emerald-400 font-bold mb-4 flex items-center gap-2 print:text-black">
             Key Strengths
           </h4>
           <ul className="space-y-2">
              {verdict.pros.map((p, i) => (
                 <li key={i} className="text-gray-300 text-sm flex gap-2 print:text-gray-800">
                    <span className="text-emerald-500/50 print:text-black">•</span> {p}
                 </li>
              ))}
           </ul>
        </div>
        <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-2xl print:border-gray-300 print:bg-white print:break-inside-avoid">
           <h4 className="text-red-400 font-bold mb-4 flex items-center gap-2 print:text-black">
             Areas for Improvement
           </h4>
           <ul className="space-y-2">
              {verdict.cons.map((c, i) => (
                 <li key={i} className="text-gray-300 text-sm flex gap-2 print:text-gray-800">
                    <span className="text-red-500/50 print:text-black">•</span> {c}
                 </li>
              ))}
           </ul>
        </div>
      </div>

      {/* Improvement Plan */}
      <div className="p-8 bg-indigo-900/10 border border-indigo-500/30 rounded-3xl print:border-gray-300 print:bg-white print:break-inside-avoid">
         <h3 className="text-xl font-bold text-white mb-6 print:text-black">Actionable Improvement Plan</h3>
         <div className="space-y-4">
            {verdict.improvement_plan.map((step, i) => (
               <div key={i} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0 print:bg-gray-200 print:text-black">
                    {i + 1}
                  </div>
                  <p className="text-gray-300 pt-1 print:text-gray-800">{step}</p>
               </div>
            ))}
         </div>
      </div>

      <div className="mt-12 flex flex-col sm:flex-row justify-center gap-4 print:hidden">
         <button 
           onClick={handleDownload}
           className="px-6 py-3 bg-gray-800 border border-gray-600 hover:bg-gray-700 text-gray-300 font-bold rounded-xl transition-all flex items-center gap-2"
         >
           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
           Download Report
         </button>
         <button 
           onClick={handlePrint}
           className="px-6 py-3 bg-gray-800 border border-gray-600 hover:bg-gray-700 text-gray-300 font-bold rounded-xl transition-all flex items-center gap-2"
         >
           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
           Print / PDF
         </button>
         <button 
           onClick={onRestart}
           className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25"
         >
           Start New Session
         </button>
      </div>
    </div>
  );
};

export default VerdictView;
