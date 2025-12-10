
export const getPhase3Prompt = (
    departingJurorName: string, 
    targetJurorName: string, 
    transcript: string,
    summary: string,
    reason: string
  ) => {
    return `[PHASE 3: SUPERVISION & MEMORY UPDATE]
  
  **SITUATION:**
  The interview is in progress.
  Current Juror (${departingJurorName}) has just finished their turn and is handing off to (${targetJurorName}).
  
  **TRANSCRIPT OF LAST TURN:**
  ${transcript}
  
  **YOUR TASK:**
  You are the Supervisor Brain. 
  Your goal is to update the state of the DEPARTING JUROR (${departingJurorName}) so they remember what happened and are ready for their NEXT turn later in the session.
  
  1. **Analyze**: How did the candidate answer ${departingJurorName}'s question?
  2. **Grade**: Score the performance (0-100).
  3. **Critique**: Did they dodge? Were they specific?
  4. **Memory Update**: Create a concise bullet point summary of what the candidate admitted or claimed.
  5. **Future Question**: Formulate the NEXT step for ${departingJurorName} when they return.
     - IF the candidate gave a poor or evasive answer: Formulate a hard-hitting follow-up question.
     - IF the candidate answered satisfactorily and the topic is exhausted: Formulate a "Conclusion" statement. E.g. "I've heard enough on this. I'm satisfied. I'll pass to my colleagues."
  
  **LANGUAGE**: All outputs and generated questions must be in **ENGLISH**.

  **OUTPUT FORMAT:**
  Return a JSON object with:
  - grade (number)
  - critique (string)
  - memory_update (string) -> e.g. "Candidate admitted they haven't solved the latency issue yet."
  - next_question (string) -> e.g. "You mentioned earlier that latency wasn't solved. How exactly do you plan to handle peak load then?" OR "I am satisfied with the latency explanation. Passing."
  `;
  };
