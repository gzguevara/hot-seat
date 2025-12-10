
import React, { useState, useEffect, ChangeEvent } from 'react';
import { Character } from '../types';
import { brain } from '../services/Brain';

interface SetupWizardProps {
  onContextSubmitted: (desc: string, files: File[]) => void;
  onComplete: (jurors: Character[]) => void;
  initialCharacters: Character[];
}

// Updated Colors to be darker/redder
const COLORS = ['bg-red-800', 'bg-red-700', 'bg-orange-800', 'bg-stone-800', 'bg-neutral-800', 'bg-rose-900'];

const EXAMPLES = [
  "Pitching a Series A to a skeptical VC regarding an AI-driven toaster...",
  "Defending a PhD thesis on 'The Sociology of Memes' to a panel of boomers...",
  "Convincing the CTO to rewrite the entire legacy codebase in Rust...",
  "Explaining to the Board why the production database was deleted...",
  "Asking for a 50% raise after missing all quarterly targets...",
  "Justifying a 2-year delay on the 'MVP' launch..."
];

const SetupWizard: React.FC<SetupWizardProps> = ({ 
  onContextSubmitted, 
  onComplete, 
  initialCharacters 
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1); // Step 3 is loading
  const [isGenerating, setIsGenerating] = useState(false); // New state for Phase 1.5 loading
  const [scenario, setScenario] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  
  // Start with 2 jurors by default
  const [jurors, setJurors] = useState<Character[]>(
      initialCharacters.slice(0, 2).map(c => ({...c, tickets: 1}))
  );
  
  // Store a potential 3rd juror (either generated or from presets) that is hidden by default
  const [spareJuror, setSpareJuror] = useState<Character | null>(
      initialCharacters[2] ? {...initialCharacters[2], tickets: 1} : null
  );

  // Interview Depth (Total Tickets)
  const [depth, setDepth] = useState<'short' | 'medium' | 'long'>('medium');

  // Typewriter State
  const [placeholder, setPlaceholder] = useState('');
  const [exampleIndex, setExampleIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Typewriter Effect
  useEffect(() => {
    // If user has typed, stop animating and just clear
    if (scenario.length > 0) return;

    const currentFullText = EXAMPLES[exampleIndex];
    let timer: ReturnType<typeof setTimeout>;

    if (isDeleting) {
        timer = setTimeout(() => {
            if (charIndex > 0) {
                setPlaceholder(currentFullText.substring(0, charIndex - 1));
                setCharIndex(charIndex - 1);
            } else {
                setIsDeleting(false);
                setExampleIndex((prev) => (prev + 1) % EXAMPLES.length);
            }
        }, 30); // Delete speed
    } else {
        timer = setTimeout(() => {
            if (charIndex < currentFullText.length) {
                setPlaceholder(currentFullText.substring(0, charIndex + 1));
                setCharIndex(charIndex + 1);
            } else {
                // Pause at end before deleting
                timer = setTimeout(() => setIsDeleting(true), 2000);
            }
        }, 50); // Type speed
    }

    return () => clearTimeout(timer);
  }, [charIndex, isDeleting, exampleIndex, scenario]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleNext = async () => {
    setIsGenerating(true);
    
    // 1. Ingest files & context (Phase 1)
    await brain.initializePhase1(scenario, files).catch(e => console.error("Phase 1 Error:", e));
    
    // 2. Generate custom jurors based on that context (Phase 1.5)
    const generatedJurors = await brain.generateJurorPersonas();
    
    if (generatedJurors && generatedJurors.length > 0) {
        // Only show the first 2 generated jurors
        setJurors(generatedJurors.slice(0, 2));
        
        // Cache the 3rd one as a spare if the user wants to add it later
        if (generatedJurors.length > 2) {
            setSpareJuror(generatedJurors[2]);
        } else {
            setSpareJuror(null);
        }
    } else {
        // Fallback: Use presets if generation fails
        setJurors(initialCharacters.slice(0, 2).map(c => ({...c, tickets: 1})));
        setSpareJuror(initialCharacters[2] ? {...initialCharacters[2], tickets: 1} : null);
    }
    
    // Proceed
    onContextSubmitted(scenario, files);
    setStep(2);
    setIsGenerating(false);
  };

  const handleJurorChange = (index: number, field: keyof Character, value: string) => {
    const updated = [...jurors];
    updated[index] = { ...updated[index], [field]: value };
    setJurors(updated);
  };

  const handleAddJuror = () => {
    // Limit max jurors to 3
    if (jurors.length >= 3) return;

    // 1. First priority: Use the spare generated juror if available
    if (spareJuror) {
        setJurors([...jurors, spareJuror]);
        setSpareJuror(null);
        return;
    }

    // 2. Second priority: Try to find a preset from initialCharacters that isn't currently used
    const unusedPreset = initialCharacters.find(
        preset => !jurors.some(current => current.id === preset.id)
    );

    if (unusedPreset) {
        setJurors([...jurors, { ...unusedPreset, tickets: 1 }]);
    } else {
        // 3. Fallback: Create a new generic juror
        const newId = `char_${Date.now()}`;
        const randomColor = COLORS[jurors.length % COLORS.length];
        
        const newJuror: Character = {
            id: newId,
            name: `Interrogator ${jurors.length + 1}`,
            role: 'The Skeptic',
            description: 'Focused on asking clarifying questions.',
            voiceName: 'Puck',
            // Updated to use pravatar for consistent face avatars
            avatarUrl: `https://i.pravatar.cc/300?u=${newId}`,
            color: randomColor,
            systemInstruction: 'You are a helpful interviewer.',
            tickets: 1
        };
        setJurors([...jurors, newJuror]);
    }
  };

  const handleRemoveJuror = (index: number) => {
      if (jurors.length <= 1) return;
      
      const updated = [...jurors];
      // Capture the one being removed
      const removed = updated[index];
      
      updated.splice(index, 1);
      setJurors(updated);

      // If we don't have a spare, or if this was a generated/custom one, 
      // we might want to recycle it as the spare (optional behavior, keeping it simple for now)
      if (!spareJuror) {
          setSpareJuror(removed);
      }
  };

  const handleConfigureHotSeat = async () => {
    setStep(3); // Show waiting screen
    
    // 1. Distribute Tickets based on Depth
    // Short: 1 per juror (Total = N)
    // Medium: Total ~ 2 per juror
    // Long: Total ~ 3 per juror
    let totalTickets = jurors.length;
    if (depth === 'medium') totalTickets = jurors.length * 2;
    if (depth === 'long') totalTickets = jurors.length * 3;

    // Distribute tickets evenly, remainder to first few
    const baseTickets = Math.floor(totalTickets / jurors.length);
    const remainder = totalTickets % jurors.length;

    const ticketedJurors = jurors.map((j, idx) => ({
        ...j,
        tickets: baseTickets + (idx < remainder ? 1 : 0)
    }));

    try {
        const configuredJurors = await brain.initializePhase2(ticketedJurors);
        onComplete(configuredJurors);
    } catch (e) {
        console.error("Failed to configure jurors", e);
        onComplete(ticketedJurors);
    }
  };

  // Loading Screen for Personas (Phase 1.5)
  if (isGenerating) {
    return (
        <div className="w-full max-w-6xl bg-black border border-gray-800 rounded-3xl p-12 shadow-2xl animate-fade-in flex flex-col items-center justify-center text-center">
             <div className="w-20 h-20 mb-6 relative">
                 <div className="absolute inset-0 rounded-full border-4 border-red-900/30"></div>
                 <div className="absolute inset-0 rounded-full border-t-4 border-red-600 animate-spin"></div>
             </div>
             <h2 className="text-2xl font-bold text-white mb-2">Reviewing your notes...</h2>
             <p className="text-gray-400 max-w-md">
                 Reading your documents and assembling a panel of experts to discuss your ideas.
             </p>
        </div>
    );
  }

  return (
    <div className="w-full max-w-6xl bg-black border border-gray-800 rounded-3xl p-8 shadow-2xl animate-fade-in relative overflow-hidden transition-all duration-500">
      {/* Progress Indicator */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-900">
        <div 
          className="h-full bg-red-600 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(220,38,38,0.8)]"
          style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
        />
      </div>

      {step === 1 && (
        <div className="animate-fade-in">
          <header className="mb-8">
            <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">Step 1: The Context</h2>
            <p className="text-gray-400">Describe the scenario. The more details you give, the better we can prepare.</p>
          </header>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Scenario</label>
              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="w-full h-40 bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-white placeholder-gray-600 focus:ring-2 focus:ring-red-900 focus:border-red-600 resize-none transition-all font-mono text-sm"
                placeholder={scenario.length > 0 ? "Describe your scenario..." : placeholder}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-red-500 uppercase tracking-wider mb-1">
                Supporting Docs (PDF, TXT, IMAGES)
              </label>
              <p className="text-gray-500 text-xs mb-3 font-mono leading-relaxed">
                  Upload your Pitch Deck (PDF), Resume, or Technical Diagrams.
                  <span className="block mt-1 text-red-400">Note: The model works best with PDFs. Please export PPTX/DOCX to PDF first.</span>
              </p>
              
              <div className="relative group">
                <input
                  type="file"
                  multiple
                  accept="application/pdf,text/*,image/*,.md,.csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/20 group-hover:border-red-600 group-hover:bg-red-900/10 transition-all">
                  <div className="text-center">
                    {files.length > 0 ? (
                      <span className="text-red-400 font-bold">{files.length} file(s) loaded</span>
                    ) : (
                      <span className="text-gray-600 group-hover:text-red-400 font-mono text-sm uppercase tracking-wider">
                          Drop Files Here (PDF, IMG, TXT)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 text-xs text-gray-500 font-mono">
                    {files.map((f, i) => <li key={i}>[ATTACHMENT] {f.name}</li>)}
                </ul>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleNext}
                disabled={!scenario && files.length === 0}
                className="px-8 py-3 bg-red-700 hover:bg-red-600 disabled:bg-gray-900 disabled:text-gray-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-red-600/30 flex items-center gap-2 uppercase tracking-widest text-sm"
              >
                Meet Your Interviewers
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in">
          <header className="mb-6 flex flex-wrap gap-4 justify-between items-end">
            <div>
                <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">Step 2: The Jurors</h2>
                <p className="text-gray-400"> You will need to convince this panel of experts!</p>
            </div>
            <div className="flex gap-3">
                {/* Add Juror Button (Small, in Header) */}
                {jurors.length < 3 && (
                    <button 
                        onClick={handleAddJuror}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-red-900/50 border border-red-800 rounded-lg hover:bg-red-800 transition-colors uppercase tracking-wider"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Interviewer
                    </button>
                )}
            </div>
          </header>

          <div className="mb-8">
             <div className="flex items-baseline justify-between mb-3">
                 <label className="text-xs font-bold text-red-500 uppercase tracking-widest">
                    Question per Juror
                 </label>
                 <span className="text-xs text-gray-500 font-mono">
                    Determines how many follow-up questions each juror will ask.
                 </span>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                    { id: 'short', label: 'Quick Chat', desc: 'One question. Good for a vibe check.' },
                    { id: 'medium', label: 'Standard', desc: 'Two questions. A balanced discussion.' },
                    { id: 'long', label: 'Grilling', desc: 'Three questions. They will dig deep.' }
                ].map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => setDepth(opt.id as any)}
                        className={`relative p-4 rounded-xl border text-left transition-all duration-200 group ${
                            depth === opt.id 
                            ? 'bg-red-950/30 border-red-500 shadow-lg shadow-red-900/20' 
                            : 'bg-gray-900/20 border-gray-800 hover:border-gray-600 hover:bg-gray-900/40'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-sm font-black uppercase tracking-wider ${depth === opt.id ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                {opt.label}
                            </span>
                            {depth === opt.id && (
                                <span className="flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                            )}
                        </div>
                        <p className={`text-xs font-mono leading-relaxed ${depth === opt.id ? 'text-red-200/70' : 'text-gray-600'}`}>
                            {opt.desc}
                        </p>
                    </button>
                ))}
             </div>
          </div>

          {/* Responsive Grid List - CENTERED */}
          {/* justify-center ensures they are centered when 2, and adding 3rd pushes outwards */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {jurors.map((juror, idx) => (
              <div key={juror.id} className="relative group bg-black rounded-2xl p-4 border border-gray-800 flex flex-col gap-3 transition-all hover:border-red-900 w-full md:w-[350px]">
                
                {/* Remove Button (Only if > 1 juror) */}
                {jurors.length > 1 && (
                    <button 
                        onClick={() => handleRemoveJuror(idx)}
                        className="absolute top-2 right-2 text-gray-700 hover:text-red-500 transition-colors p-1"
                        title="Remove Juror"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

                <div className="flex items-center gap-3 mb-2">
                    <div className={`w-12 h-12 rounded-full ${juror.color} flex items-center justify-center flex-shrink-0 border border-gray-700`}>
                        <svg className="w-6 h-6 text-white/40" viewBox="0 0 24 24" fill="currentColor">
                           <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="flex-grow pr-6">
                         <label className="text-[10px] text-red-500 uppercase font-bold tracking-widest">Name</label>
                         <input 
                            value={juror.name}
                            onChange={(e) => handleJurorChange(idx, 'name', e.target.value)}
                            className="w-full bg-transparent border-b border-gray-800 text-white font-black text-lg focus:border-red-600 focus:outline-none py-1"
                         />
                    </div>
                </div>
                
                <div className="w-full">
                    <label className="text-[10px] text-red-500 uppercase font-bold tracking-widest">Role</label>
                    <input 
                        value={juror.role}
                        onChange={(e) => handleJurorChange(idx, 'role', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-red-600 focus:outline-none font-bold"
                    />
                </div>

                <div>
                     <label className="text-[10px] text-red-500 uppercase font-bold tracking-widest">Strategy</label>
                     <textarea 
                        value={juror.description}
                        onChange={(e) => handleJurorChange(idx, 'description', e.target.value)}
                        rows={3}
                        className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-500 focus:border-red-600 focus:outline-none resize-none font-mono"
                     />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-800">
            <button
              onClick={() => setStep(1)}
              className="text-gray-500 hover:text-white font-bold px-4 py-2 transition-colors uppercase text-sm"
            >
              Back
            </button>
            <button
              onClick={handleConfigureHotSeat}
              className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-red-600/25 flex items-center gap-2 group"
            >
              <svg className="w-5 h-5 group-hover:animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Start Simulation
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-fade-in py-12 flex flex-col items-center justify-center text-center">
             <div className="w-24 h-24 mb-6 relative">
                 <div className="absolute inset-0 rounded-full border-t-4 border-red-600 animate-spin"></div>
                 <div className="absolute inset-2 rounded-full border-r-4 border-red-900 animate-spin-reverse opacity-70"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                     <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                     </svg>
                 </div>
             </div>
             <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Preparing Simulation...</h2>
             <p className="text-gray-500 max-w-lg mx-auto leading-relaxed font-mono text-sm">
                 Briefing the interviewers. <br/>
                 Loading context. <br/>
                 <span className="text-red-500 block mt-2">Get ready.</span>
             </p>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
