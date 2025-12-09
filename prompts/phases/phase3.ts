
export const getPhase3Prompt = (
    departingJurorName: string, 
    targetJurorName: string, 
    transcript: string,
    summary: string,
    mode: 'polite' | 'interrupt'
  ) => {
    return `[PHASE 3: SUPERVISION & HANDOVER]
  
  **SITUATION:**
  The interview is in progress. 
  Current Juror (${departingJurorName}) is handing off the candidate to (${targetJurorName}).
  **MODE:** ${mode.toUpperCase()}
  
  **DEPARTING JUROR'S REASON/SUMMARY:**
  "${summary}"
  
  **RECENT TRANSCRIPT:**
  ${transcript}
  
  **YOUR TASK:**
  You are the Supervisor Brain. Analyze the candidate's recent answers and instruct the new juror (${targetJurorName}).
  
  1. **Grade** the candidate's last performance (0-100).
  2. **Critique**: Did they dodge the question? Were they specific? Did they bluff?
  3. **Briefing**: Write specific instructions for ${targetJurorName}.
  
  **HANDOVER BRIEFING RULES:**
  ${mode === 'interrupt' 
    ? `- **INTERRUPT MODE:** ${targetJurorName} MUST start their turn by aggressively interrupting or cutting into the conversation. e.g., "Sorry to stop you, but..." or "I have to disagree there...". The tone should be urgent.`
    : `- **POLITE MODE:** ${targetJurorName} should acknowledge the handoff gracefully. e.g., "Thanks ${departingJurorName}. I'd like to dig into..."`
  }
  - Contextualize the previous answer.
  - Suggest the next line of questioning.
  
  **OUTPUT:**
  Return a JSON object with:
  - grade (number)
  - critique (string)
  - handover_briefing (string) -> Injected directly into ${targetJurorName}'s mind. Start with "CONTEXT FROM PREVIOUS TURN: ...".
  `;
  };
