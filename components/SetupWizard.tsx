
import React, { useState, ChangeEvent } from 'react';
import { Character } from '../types';
import { brain } from '../services/Brain';

interface SetupWizardProps {
  onContextSubmitted: (desc: string, files: File[]) => void;
  onComplete: (jurors: Character[]) => void;
  initialCharacters: Character[];
}

const VOICES: Array<Character['voiceName']> = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
const COLORS = ['bg-emerald-600', 'bg-indigo-600', 'bg-purple-700', 'bg-rose-600', 'bg-amber-600', 'bg-cyan-600'];

const SetupWizard: React.FC<SetupWizardProps> = ({ 
  onContextSubmitted, 
  onComplete, 
  initialCharacters 
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1); // Step 3 is loading
  const [scenario, setScenario] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // Start with just the first juror
  const [jurors, setJurors] = useState<Character[]>([initialCharacters[0]]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleNext = () => {
    // Fire and forget - Do not await. Process in background.
    brain.initializePhase1(scenario, files).catch(e => console.error("Background Brain Error:", e));
    
    // Proceed immediately
    onContextSubmitted(scenario, files);
    setStep(2);
  };

  const handleJurorChange = (index: number, field: keyof Character, value: string) => {
    const updated = [...jurors];
    updated[index] = { ...updated[index], [field]: value };
    setJurors(updated);
  };

  const handleAddJuror = () => {
    if (jurors.length >= 5) return;

    // 1. Try to find a preset from initialCharacters that isn't currently used
    const unusedPreset = initialCharacters.find(
        preset => !jurors.some(current => current.id === preset.id)
    );

    if (unusedPreset) {
        setJurors([...jurors, unusedPreset]);
    } else {
        // 2. Fallback: Create a new generic juror
        const newId = `char_${Date.now()}`;
        const randomColor = COLORS[jurors.length % COLORS.length];
        const randomVoice = VOICES[jurors.length % VOICES.length];
        
        const newJuror: Character = {
            id: newId,
            name: `Juror ${jurors.length + 1}`,
            role: 'Expert Observer',
            description: 'Focused on asking clarifying questions.',
            voiceName: randomVoice,
            avatarUrl: `https://picsum.photos/seed/${newId}/300/300`,
            color: randomColor,
            systemInstruction: 'You are a helpful interviewer.'
        };
        setJurors([...jurors, newJuror]);
    }
  };

  const handleRemoveJuror = (index: number) => {
      if (jurors.length <= 1) return;
      const updated = [...jurors];
      updated.splice(index, 1);
      setJurors(updated);
  };

  const handleConfigureHotSeat = async () => {
    setStep(3); // Show waiting screen
    try {
        const updatedJurors = await brain.initializePhase2(jurors);
        onComplete(updatedJurors);
    } catch (e) {
        console.error("Failed to configure jurors", e);
        // Fallback to original jurors if brain fails, or show error
        onComplete(jurors);
    }
  };

  return (
    <div className="w-full max-w-6xl bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-3xl p-8 shadow-2xl animate-fade-in relative overflow-hidden transition-all duration-500">
      {/* Progress Indicator */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-700">
        <div 
          className="h-full bg-indigo-500 transition-all duration-500 ease-out"
          style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
        />
      </div>

      {step === 1 && (
        <div className="animate-fade-in">
          <header className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Step 1: The Context</h2>
            <p className="text-gray-400">Describe the scenario, job role, or technical problem. Upload relevant docs.</p>
          </header>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Scenario / Job Description</label>
              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="w-full h-40 bg-gray-900/80 border border-gray-600 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                placeholder="E.g. You are interviewing for a Senior Backend Role at a Fintech startup. The stack is Go, Kafka, and Kubernetes..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Relevant Files (Resume, Architecture Diagrams)</label>
              <div className="relative group">
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-600 rounded-xl bg-gray-900/50 group-hover:border-indigo-500 group-hover:bg-gray-900/80 transition-all">
                  <div className="text-center">
                    {files.length > 0 ? (
                      <span className="text-indigo-400 font-medium">{files.length} file(s) selected</span>
                    ) : (
                      <span className="text-gray-500 group-hover:text-gray-400">Drag & drop or click to upload</span>
                    )}
                  </div>
                </div>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 text-sm text-gray-400">
                    {files.map((f, i) => <li key={i}>• {f.name}</li>)}
                </ul>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleNext}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 flex items-center gap-2"
              >
                Next: Configure Panel
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in">
          <header className="mb-8 flex flex-wrap gap-4 justify-between items-start">
            <div>
                <h2 className="text-3xl font-bold text-white mb-2">Step 2: The Panel</h2>
                <p className="text-gray-400">Customize your interviewers. Rename them, change voices, or adjust their focus.</p>
            </div>
            <button 
                onClick={() => brain.downloadDebugLog()}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-600 rounded-lg hover:text-white hover:bg-gray-700 transition-colors"
                title="Download Brain Debug Logs"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Debug Brain
            </button>
          </header>

          {/* Dynamic Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {jurors.map((juror, idx) => (
              <div key={juror.id} className="relative group bg-gray-900/60 rounded-2xl p-4 border border-gray-700 flex flex-col gap-3 transition-all hover:border-gray-500">
                
                {/* Remove Button (Only if > 1 juror) */}
                {jurors.length > 1 && (
                    <button 
                        onClick={() => handleRemoveJuror(idx)}
                        className="absolute top-2 right-2 text-gray-600 hover:text-red-400 transition-colors p-1"
                        title="Remove Juror"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

                <div className="flex items-center gap-3 mb-2">
                    <div className={`w-12 h-12 rounded-full ${juror.color} p-0.5 flex-shrink-0`}>
                        <img src={juror.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    </div>
                    <div className="flex-grow pr-6">
                         <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Name</label>
                         <input 
                            value={juror.name}
                            onChange={(e) => handleJurorChange(idx, 'name', e.target.value)}
                            className="w-full bg-transparent border-b border-gray-600 text-white font-bold focus:border-indigo-500 focus:outline-none py-1"
                         />
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Role</label>
                        <input 
                            value={juror.role}
                            onChange={(e) => handleJurorChange(idx, 'role', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                    <div className="w-1/3">
                        <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Voice</label>
                        <select
                            value={juror.voiceName}
                            onChange={(e) => handleJurorChange(idx, 'voiceName', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                        >
                            {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                     <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Description</label>
                     <textarea 
                        value={juror.description}
                        onChange={(e) => handleJurorChange(idx, 'description', e.target.value)}
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-400 focus:border-indigo-500 focus:outline-none resize-none"
                     />
                </div>
              </div>
            ))}

            {/* Add Juror Button */}
            {jurors.length < 5 && (
                <button 
                    onClick={handleAddJuror}
                    className="flex flex-col items-center justify-center min-h-[280px] rounded-2xl border-2 border-dashed border-gray-700 hover:border-indigo-500 hover:bg-gray-800/30 transition-all group"
                >
                    <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <span className="font-bold text-gray-400 group-hover:text-white">Add Juror</span>
                </button>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <button
              onClick={() => setStep(1)}
              className="text-gray-400 hover:text-white font-medium px-4 py-2 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfigureHotSeat}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2 group"
            >
              <svg className="w-5 h-5 group-hover:animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Configure Hot Seat
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-fade-in py-12 flex flex-col items-center justify-center text-center">
             <div className="w-24 h-24 mb-6 relative">
                 <div className="absolute inset-0 rounded-full border-t-4 border-indigo-500 animate-spin"></div>
                 <div className="absolute inset-2 rounded-full border-r-4 border-purple-500 animate-spin-reverse opacity-70"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                     <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                     </svg>
                 </div>
             </div>
             <h2 className="text-3xl font-bold text-white mb-2">The Brain is Thinking...</h2>
             <p className="text-gray-400 max-w-lg mx-auto leading-relaxed">
                 Analyzing your documents, verifying claims, and briefing the panel. 
                 <br/><span className="text-indigo-400 text-sm mt-2 block">Constructing personalized system prompts for {jurors.length} experts.</span>
             </p>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
