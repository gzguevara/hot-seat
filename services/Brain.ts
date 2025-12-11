
import { GoogleGenAI, Chat, Type, Schema } from "@google/genai";
import { BRAIN_SYS_PROMPT } from "../prompts/app_brain";
import { getPhase1Prompt } from "../prompts/phases/phase1";
import { getPhase2Prompt } from "../prompts/phases/phase2";
import { getPhase3Prompt } from "../prompts/phases/phase3";
import { getPhase4Prompt } from "../prompts/phases/phase4";
import { JUROR_SYS_TEMPLATE } from "../prompts/jurorTemplate";
import { Character, Verdict } from "../types";

interface LogEntry {
  timestamp: string;
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface Phase3Result {
    grade: number;
    critique: string;
    memory_update: string;
    next_question: string;
}

export class Brain {
  private chatSession: Chat | null = null;
  private apiKey: string;
  public isInitialized: boolean = false;
  private transcript: LogEntry[] = [];

  constructor() {
    this.apiKey = process.env.API_KEY || '';
    if (!this.apiKey) {
      console.error('[Brain] ❌ API_KEY is missing. Brain features will not work.');
    }
  }

  /**
   * Initializes the persistent chat session if it doesn't exist.
   * Optionally force resets it.
   */
  private getOrCreateSession(reset: boolean = false): Chat {
    if (reset || !this.chatSession) {
      console.log('[Brain] Initializing NEW Gemini Chat Session...');
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.chatSession = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: BRAIN_SYS_PROMPT
        }
      });
      // Explicitly log the System Prompt as the first entry
      this.transcript = []; // Clear transcript on reset
      this.addLog('system', BRAIN_SYS_PROMPT);
    }
    return this.chatSession!;
  }

  /**
   * Helper to determine MIME type based on extension if browser defaults to octet-stream
   */
  private getMimeType(file: File): string {
      // If browser detected a specific valid type, use it.
      // However, browsers often fallback to application/octet-stream for .md, .csv, etc.
      if (file.type && file.type !== 'application/octet-stream') {
          return file.type;
      }

      const ext = file.name.split('.').pop()?.toLowerCase();
      
      switch (ext) {
          case 'pdf': return 'application/pdf';
          case 'txt': return 'text/plain';
          case 'md': return 'text/plain'; // Gemini handles markdown as text
          case 'csv': return 'text/csv';
          case 'json': return 'application/json';
          case 'js': return 'text/javascript';
          case 'ts': return 'text/typescript';
          case 'py': return 'text/x-python';
          case 'jpg': 
          case 'jpeg': return 'image/jpeg';
          case 'png': return 'image/png';
          case 'webp': return 'image/webp';
          default: return 'text/plain'; // Fallback to text for unknown files to avoid 400 error
      }
  }

  /**
   * Phase 1: Ingest Context & Files
   */
  public async initializePhase1(scenario: string, files: File[]): Promise<void> {
    console.log("[Brain] Phase 1 started (Background)...");
    
    try {
        console.log(`[Brain] Processing ${files.length} files inline...`);
        const fileParts = await Promise.all(files.map(async (f) => {
            const base64 = await this.fileToBase64(f);
            return {
                inlineData: {
                    mimeType: this.getMimeType(f),
                    data: base64
                }
            };
        }));

        // CRITICAL: Start a fresh session for every new Phase 1 to avoid pollution from previous runs
        const session = this.getOrCreateSession(true);
        const promptText = getPhase1Prompt(scenario);
        
        this.addLog('system', `[PHASE 1 TRIGGER] [With ${files.length} files] ${promptText}`);
        console.log('[Brain] Sending context to Gemini...');
        
        const response = await session.sendMessage({
            message: [...fileParts, { text: promptText }]
        });

        const responseText = response.text || "";
        this.addLog('model', responseText);
        
        this.isInitialized = true;
        console.log(`[Brain] Phase 1 Complete. Response received.`);
    } catch (e: any) {
        console.error("[Brain] Phase 1 Error:", e);
        this.addLog('system', `ERROR in Phase 1: ${e.message}`);
    }
  }

  /**
   * Phase 1.5: Generate Juror Personas (Dynamic Count)
   * Uses the context from Phase 1 to generate 1-3 relevant jurors.
   */
  public async generateJurorPersonas(): Promise<Character[]> {
    console.log("[Brain] Phase 1.5: Generating Juror Personas...");
    this.addLog('system', "[PHASE 1.5] Generating Juror Personas based on context...");

    if (!this.chatSession) {
        console.warn("[Brain] Session not initialized. Initializing empty...");
        this.getOrCreateSession();
    }

    const session = this.chatSession!;

    const schema: Schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                description: { type: Type.STRING },
                voiceName: { 
                    type: Type.STRING, 
                    // Explicitly excluding Fenrir
                    enum: ["Puck", "Charon", "Kore", "Zephyr"] 
                },
                color: { 
                    type: Type.STRING, 
                    enum: ['bg-emerald-600', 'bg-indigo-600', 'bg-purple-700', 'bg-rose-600', 'bg-amber-600', 'bg-cyan-600'] 
                }
            },
            required: ["name", "role", "description", "voiceName", "color"]
        }
    };

    const prompt = `
    Based on the scenario and documents provided in Phase 1, determine the optimal number of interviewers (Min: 1, Max: 3) based on the complexity of the topic.

    1. **Analyze Complexity:**
       - Simple/Personal scenarios (e.g. "Excusing a mistake") -> 1 Juror.
       - Moderate scenarios (e.g. "Job Interview") -> 2 Jurors.
       - Complex/High Stakes (e.g. "PhD Defense", "VC Pitch") -> 3 Jurors.

    2. **Generate Personas:**
       Generate a JSON array of objects for the chosen number of jurors.
    
    REQUIREMENTS:
    - **Diversity:** They should cover different angles (e.g., The Skeptic, The Technical Expert, The Business/Product Lead).
    - **Voice:** Select a voice that fits the persona's gender/vibe. **DO NOT USE 'Fenrir'.**
    - **Color:** Assign a distinct color.
    `;

    try {
        const response = await session.sendMessage({
            message: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        let jsonRaw = response.text || "[]";
        this.addLog('model', jsonRaw);

        if (jsonRaw.includes('```')) {
            jsonRaw = jsonRaw.replace(/```json/g, '').replace(/```/g, '');
        }

        const rawJurors = JSON.parse(jsonRaw);
        
        // Map to Character Type
        const generatedJurors: Character[] = rawJurors.map((j: any, i: number) => ({
            id: `char_gen_${Date.now()}_${i}`,
            name: j.name,
            role: j.role,
            description: j.description,
            voiceName: j.voiceName,
            color: j.color,
            avatarUrl: `https://picsum.photos/seed/${j.name.replace(/\s/g,'')}${i}/300/300`,
            systemInstruction: "You are a helpful interviewer.", // Placeholder, filled in Phase 2
            tickets: 1
        }));

        console.log(`[Brain] Generated ${generatedJurors.length} personas.`);
        return generatedJurors;

    } catch (e: any) {
        console.error("[Brain] Failed to generate personas", e);
        this.addLog('system', `Error generating personas: ${e.message}`);
        return [];
    }
  }

  /**
   * Phase 2: Configure Jurors (Dynamic Loop)
   */
  public async initializePhase2(jurors: Character[]): Promise<Character[]> {
    console.log("[Brain] Phase 2 started: Configuring Jurors...");
    this.addLog('system', `[PHASE 2 TRIGGER] Configuring ${jurors.length} jurors.`);
    
    const session = this.getOrCreateSession();
    const updatedJurors: Character[] = [];

    // Define Schema for Juror Configuration
    const jurorConfigSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        context_section: { type: Type.STRING, description: "The specific context/scenario details relevant to this juror." },
        expertise_section: { type: Type.STRING, description: "Instructions on how to behave as this expert (tone, focus)." },
        character_section: { type: Type.STRING, description: "Personality traits and behavior rules. MUST start with 'You are [Name]'." },
        questions_section: { type: Type.STRING, description: "EXACTLY ONE specific, hard-hitting question based on the weakness map. Do not provide a list." },
        colleagues_section: { type: Type.STRING, description: "Description of other colleagues on the panel and when to transfer to them." },
        selected_voice: { 
            type: Type.STRING, 
            description: "The selected voice preset based on gender/persona.",
            enum: ["Puck", "Charon", "Kore", "Zephyr"] // Excluded Fenrir
        }
      },
      required: ["context_section", "expertise_section", "character_section", "questions_section", "colleagues_section", "selected_voice"]
    };

    for (const juror of jurors) {
        console.log(`[Brain] Configuring ${juror.name}...`);
        // Pass all jurors so the Brain knows the team context
        const prompt = getPhase2Prompt(juror, jurors);
        this.addLog('user', prompt);

        try {
            const response = await session.sendMessage({
                message: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: jurorConfigSchema
                }
            });

            let jsonRaw = response.text || "{}";
            this.addLog('model', jsonRaw);

            // Clean markdown if present
            if (jsonRaw.includes('```')) {
                jsonRaw = jsonRaw.replace(/```json/g, '').replace(/```/g, '');
            }
            
            if (jsonRaw) {
                const config = JSON.parse(jsonRaw);
                console.log(`[Brain] Configuration received for ${juror.name}.`);
                
                // Substitute into Template using global replacement to ensure no placeholders are missed
                let systemInstruction = JUROR_SYS_TEMPLATE;
                
                // Identity
                systemInstruction = systemInstruction.split('{{NAME}}').join(juror.name);
                systemInstruction = systemInstruction.split('{{ROLE}}').join(juror.role);
                
                // AI Generated Content
                systemInstruction = systemInstruction.split('{{CONTEXT}}').join(config.context_section || "");
                systemInstruction = systemInstruction.split('{{EXPERTISE}}').join(config.expertise_section || "");
                systemInstruction = systemInstruction.split('{{CHARACTER}}').join(config.character_section || "");
                systemInstruction = systemInstruction.split('{{QUESTIONS}}').join(config.questions_section || "");
                systemInstruction = systemInstruction.split('{{COLLEAGUE}}').join(config.colleagues_section || "");
                
                // Wrap History in Tags for Phase 3 replacement
                const initialHistory = "Session just started. No specific history yet. Start fresh.";
                systemInstruction = systemInstruction.split('{{HISTORY}}').join(initialHistory);

                updatedJurors.push({
                    ...juror,
                    systemInstruction: systemInstruction,
                    // Apply Brain's Voice Choice
                    voiceName: config.selected_voice || juror.voiceName
                });
            } else {
                updatedJurors.push(juror);
            }

        } catch (e: any) {
            console.error(`[Brain] Failed to configure ${juror.name}`, e);
            this.addLog('system', `Error configuring ${juror.name}: ${e.message}`);
            updatedJurors.push(juror);
        }
    }

    console.log("[Brain] Phase 2 Complete.");
    return updatedJurors;
  }

  /**
   * Phase 3: Supervision Loop (Triggered on Handoff)
   * Analyzes the last turn and prepares the Departing Juror for their NEXT turn.
   */
  public async Phase3Transfer(
      departingJurorName: string, 
      targetJurorName: string, 
      transcript: string, 
      summary: string, 
      reason: string
  ): Promise<Phase3Result | null> {
      console.log(`[Brain] Phase 3: Analyzing handoff (${reason}) from ${departingJurorName} to ${targetJurorName}...`);
      const session = this.getOrCreateSession();

      const assessmentSchema: Schema = {
          type: Type.OBJECT,
          properties: {
              grade: { type: Type.NUMBER, description: "Grade 0-100 of the candidate's recent performance." },
              critique: { type: Type.STRING, description: "Analysis of whether they answered the question or dodged it." },
              memory_update: { type: Type.STRING, description: "A summary of the answer to append to the juror's history." },
              next_question: { type: Type.STRING, description: "The NEXT question this juror should ask when they return." }
          },
          required: ["grade", "critique", "memory_update", "next_question"]
      };

      const prompt = getPhase3Prompt(departingJurorName, targetJurorName, transcript, summary, reason);
      this.addLog('user', prompt);

      try {
          const response = await session.sendMessage({
              message: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: assessmentSchema
              }
          });

          let jsonRaw = response.text || "[]"; // Fix empty fallback
          this.addLog('model', jsonRaw);
          
          // Robust JSON Cleanup (Handle Markdown blocks)
          if (jsonRaw.includes('```')) {
              jsonRaw = jsonRaw.replace(/```json/g, '').replace(/```/g, '');
          }
          jsonRaw = jsonRaw.trim();

          if (jsonRaw) {
              const result = JSON.parse(jsonRaw) as Phase3Result;
              console.log(`[Brain] Phase 3 Complete. ${departingJurorName} primed with new question: "${result.next_question.substring(0, 50)}..."`);
              return result;
          }

      } catch (e: any) {
          console.error("[Brain] Phase 3 Error", e);
          this.addLog('system', `Phase 3 Error: ${e.message}`);
      }

      return null;
  }

  /**
   * Phase 4: Deliberation & Verdict
   * Uses Google Search Grounding to verify claims and generate a final report.
   */
  public async initializePhase4(transcript: string): Promise<Verdict | null> {
      console.log("[Brain] Phase 4: Deliberation started...");
      this.addLog('system', "[PHASE 4] Starting Deliberation...");

      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      
      // Use standard generateContent instead of Chat to strictly separate context 
      // and enable Search Tools without schema conflicts.
      // Note: We cannot use responseSchema with googleSearch, so we parse manually.
      try {
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: getPhase4Prompt(transcript),
              config: {
                  tools: [{ googleSearch: {} }],
                  // responseSchema is intentionally OMITTED to allow search usage
              }
          });

          let rawText = response.text || "";
          
          // Log grounding metadata if available (for debugging)
          if (response.candidates?.[0]?.groundingMetadata) {
              console.log("[Brain] Grounding Metadata received:", response.candidates[0].groundingMetadata);
          }
          
          // Improved JSON extraction:
          // 1. Try to extract from Markdown block first
          let jsonStr = "";
          const markdownMatch = rawText.match(/```(?:json)?([\s\S]*?)```/);
          
          if (markdownMatch && markdownMatch[1]) {
              jsonStr = markdownMatch[1];
          } else {
              // 2. Fallback: Find first '{' and last '}'
              const startIdx = rawText.indexOf('{');
              const endIdx = rawText.lastIndexOf('}');
              
              if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                  jsonStr = rawText.substring(startIdx, endIdx + 1);
              } else {
                  // 3. Last resort
                  jsonStr = rawText;
              }
          }
          
          jsonStr = jsonStr.trim();
          this.addLog('model', rawText);

          try {
              const verdict = JSON.parse(jsonStr) as Verdict;
              console.log(`[Brain] Verdict Reached. Score: ${verdict.final_score}`);
              return verdict;
          } catch (parseError) {
              console.error("[Brain] Failed to parse Verdict JSON", parseError);
              console.log("Raw output:", rawText);
              // Attempt to recover if the error is due to truncated JSON or similar simple issues?
              // For now, fail gracefully.
              return null;
          }

      } catch (e: any) {
          console.error("[Brain] Phase 4 Error", e);
          this.addLog('system', `Phase 4 Error: ${e.message}`);
          return null;
      }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
  }

  private addLog(role: 'user' | 'model' | 'system', content: string) {
    this.transcript.push({
      timestamp: new Date().toISOString(),
      role,
      content
    });
  }

  public downloadDebugLog() {
    const lines = this.transcript.map(t => `[${t.timestamp}] [${t.role.toUpperCase()}]\n${t.content}\n-------------------`);
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brain-debug-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const brain = new Brain();
