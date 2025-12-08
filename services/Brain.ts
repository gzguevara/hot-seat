import { GoogleGenAI, Chat } from "@google/genai";
import { BRAIN_SYS_PROMPT } from "../prompts/app_brain";
import { getPhase1Prompt } from "../prompts/phases/phase1";

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
   * Converts files to Base64 (inlineData) and sends them to the persistent chat.
   */
  public async initializePhase1(scenario: string, files: File[]): Promise<void> {
    console.log("[Brain] Phase 1 started (Background)...");
    
    try {
        // 1. Convert files to Base64 parts
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

        // 2. Get Persistent Session
        const session = this.getOrCreateSession();

        // 3. Construct Phase 1 Prompt
        const promptText = getPhase1Prompt(scenario);
        
        // Log as SYSTEM message as requested ("every time a new phase starts, we send a new system message")
        this.addLog('system', `[PHASE 1 TRIGGER] [With ${files.length} files] ${promptText}`);
        console.log('[Brain] Sending context to Gemini...');
        
        // 4. Send Message (Files + Text)
        // Note: We send this as a user message to the API, but conceptually it's the system driving the phase.
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
   * Helper to convert File object to Base64 string
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Remove data:type/ext;base64, prefix
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