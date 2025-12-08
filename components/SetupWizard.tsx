
import React, { useState, ChangeEvent } from 'react';
import { Character } from '../types';

interface SetupWizardProps {
  onContextSubmitted: (desc: string, files: File[]) => void;
  onComplete: (jurors: Character[]) => void;
  initialCharacters: Character[];
}

const SetupWizard: React.FC<SetupWizardProps> = ({ 
  onContextSubmitted, 
  onComplete, 
  initialCharacters 
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [scenario, setScenario] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [jurors, setJurors] = useState<Character[]>(initialCharacters);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleNext = () => {
    onContextSubmitted(scenario, files);
    setStep(2);
  };

  const handleJurorChange = (index: number, field: keyof Character, value: string) => {
    const updated = [...jurors];
    updated[index] = { ...updated[index], [field]: value };
    setJurors(updated);
  };

  const handleStart = () => {
    onComplete(jurors);
  };

  return (
    <div className="w-full max-w-5xl bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-3xl p-8 shadow-2xl animate-fade-in relative overflow-hidden">
      {/* Progress Indicator */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-700">
        <div 
          className="h-full bg-indigo-500 transition-all duration-500 ease-out"
          style={{ width: step === 1 ? '50%' : '100%' }}
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
          <header className="mb-8 flex justify-between items-center">
            <div>
                <h2 className="text-3xl font-bold text-white mb-2">Step 2: The Panel</h2>
                <p className="text-gray-400">Customize your interviewers. Rename them or change their focus areas.</p>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {jurors.map((juror, idx) => (
              <div key={juror.id} className="bg-gray-900/60 rounded-2xl p-4 border border-gray-700 flex flex-col gap-3">
                <div className="flex items-center gap-3 mb-2">
                    <div className={`w-12 h-12 rounded-full ${juror.color} p-0.5 flex-shrink-0`}>
                        <img src={juror.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    </div>
                    <div className="flex-grow">
                         <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Name</label>
                         <input 
                            value={juror.name}
                            onChange={(e) => handleJurorChange(idx, 'name', e.target.value)}
                            className="w-full bg-transparent border-b border-gray-600 text-white font-bold focus:border-indigo-500 focus:outline-none py-1"
                         />
                    </div>
                </div>
                
                <div>
                     <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Role</label>
                     <input 
                        value={juror.role}
                        onChange={(e) => handleJurorChange(idx, 'role', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                     />
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
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <button
              onClick={() => setStep(1)}
              className="text-gray-400 hover:text-white font-medium px-4 py-2 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleStart}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Start Interview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
