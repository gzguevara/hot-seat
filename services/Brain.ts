
import { GoogleGenAI, Chat, Type, Schema } from "@google/genai";
import { BRAIN_SYS_PROMPT } from "../prompts/app_brain";
import { getPhase1Prompt } from "../prompts/phases/phase1";
import { getPhase2Prompt } from "../prompts/phases/phase2";
import { getPhase3Prompt } from "../prompts/phases/phase3";
import { JUROR_SYS_TEMPLATE } from "../prompts/jurorTemplate";
import { Character } from "../types";

interface LogEntry {
  timestamp: string;
  role: 'user' | 'model' | 'system';
  content: string;
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
   */
  private getOrCreateSession(): Chat {
    if (!this.chatSession) {
      console.log('[Brain] Initializing persistent Gemini Chat Session...');
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.chatSession = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: BRAIN_SYS_PROMPT
        }
      });
      // Explicitly log the System Prompt as the first entry
      this.addLog('system', BRAIN_SYS_PROMPT);
    }
    return this.chatSession;
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
                    mimeType: f.type || 'application/octet-stream',
                    data: base64
                }
            };
        }));

        const session = this.getOrCreateSession();
        const promptText = getPhase1Prompt(scenario);
        
        this.addLog('system', `[PHASE 1 TRIGGER] [With ${files.length} files] ${promptText}`);
        console.log('[Brain] Sending context to Gemini...');
        
        const response = await session.sendMessage({
            message: [...fileParts, { text: promptText }]
        });

        const responseText = response.text || "";
        this.addLog('model', responseText);
        
        this.isInitialized = true;
        console.log(`[Brain] Phase 1 Complete. Response: ${responseText}`);
    } catch (e: any) {
        console.error("[Brain] Phase 1 Error:", e);
        this.addLog('system', `ERROR in Phase 1: ${e.message}`);
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
        questions_section: { type: Type.STRING, description: "3-5 specific, hard-hitting questions based on the weakness map." },
        colleagues_section: { type: Type.STRING, description: "Description of other colleagues on the panel and when to transfer to them." },
        selected_voice: { 
            type: Type.STRING, 
            description: "The selected voice preset based on gender/persona.",
            enum: ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]
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

            const jsonRaw = response.text;
            this.addLog('model', jsonRaw || "{}");
            
            if (jsonRaw) {
                const config = JSON.parse(jsonRaw);
                
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
                const initialHistory = "<HISTORY>\nSession just started. No specific history yet. Start fresh.\n</HISTORY>";
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
   */
  public async initializePhase3(
      departingJurorName: string, 
      targetJurorName: string, 
      transcript: string, 
      summary: string,
      mode: 'polite' | 'interrupt' = 'polite'
  ): Promise<string> {
      console.log(`[Brain] Phase 3: Analyzing handoff (${mode}) from ${departingJurorName} to ${targetJurorName}...`);
      const session = this.getOrCreateSession();

      const assessmentSchema: Schema = {
          type: Type.OBJECT,
          properties: {
              grade: { type: Type.NUMBER, description: "Grade 0-100 of the candidate's recent performance." },
              critique: { type: Type.STRING, description: "Analysis of whether they answered the question or dodged it." },
              handover_briefing: { type: Type.STRING, description: "Specific instructions for the next juror." }
          },
          required: ["grade", "critique", "handover_briefing"]
      };

      const prompt = getPhase3Prompt(departingJurorName, targetJurorName, transcript, summary, mode);
      this.addLog('user', prompt);

      try {
          const response = await session.sendMessage({
              message: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: assessmentSchema
              }
          });

          const jsonRaw = response.text;
          this.addLog('model', jsonRaw || "{}");

          if (jsonRaw) {
              const result = JSON.parse(jsonRaw);
              console.log("[Brain] Supervision Assessment:", result);
              return `<HISTORY>\n[SUPERVISOR UPDATE]:\nLast Grade: ${result.grade}/100\nCritique: ${result.critique}\n\n${result.handover_briefing}\n</HISTORY>`;
          }

      } catch (e: any) {
          console.error("[Brain] Phase 3 Error", e);
          this.addLog('system', `Phase 3 Error: ${e.message}`);
      }

      return `<HISTORY>\nTransfer from ${departingJurorName}. Mode: ${mode}. Summary: ${summary}\n</HISTORY>`;
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
