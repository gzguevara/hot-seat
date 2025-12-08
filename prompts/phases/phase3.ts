
export const getPhase3Prompt = (
    departingJurorName: string, 
    targetJurorName: string, 
    transcript: string,
    summary: string
  ) => {
    return `[PHASE 3: SUPERVISION & HANDOVER]
  
  **SITUATION:**
  The interview is in progress. 
  Current Juror (${departingJurorName}) is handing off the candidate to (${targetJurorName}).
  
  **DEPARTING JUROR'S INTERNAL SUMMARY:**
  "${summary}"
  
  **RECENT TRANSCRIPT:**
  ${transcript}
  
  **YOUR TASK:**
  You are the Supervisor Brain. Analyze the candidate's recent answers.
  1. **Grade** the candidate's last performance (0-100).
  2. **Critique**: Did they dodge the question? Were they specific? Did they bluff?
  3. **Briefing**: Write a specific context paragraph for ${targetJurorName}. 
     - Tell them what the candidate JUST said.
     - Tell them if the candidate is weak, strong, or evasive.
     - Suggest a specific angle of attack to maintain continuity.
  
  **OUTPUT:**
  Return a JSON object with:
  - grade (number)
  - critique (string)
  - handover_briefing (string) -> This is the most important part. It will be injected directly into ${targetJurorName}'s mind. Start with "CONTEXT FROM PREVIOUS TURN: ...".
  `;
  };
