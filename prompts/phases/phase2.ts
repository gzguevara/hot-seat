
import { Character } from "../../types";

export const getPhase2Prompt = (juror: Character, allJurors: Character[]) => {
  const colleagues = allJurors.filter(j => j.id !== juror.id);
  const colleaguesText = colleagues.map(c => `- ${c.name} (${c.role}): ${c.description}`).join('\n');

  return `[PHASE 2 START] Configuration Task.
  
  Target Juror (YOU):
  - Name: ${juror.name}
  - Role: ${juror.role}
  - Description: ${juror.description}

  Your Panel Colleagues:
  ${colleaguesText}

  **AVAILABLE VOICES:**
  - Puck (Male, Tenor, Neutral)
  - Charon (Male, Deep, Authoritative)
  - Kore (Female, Alto, Calm)
  - Zephyr (Female, Soprano, Energetic)

  Based on the "Verified Weakness Map" and scenario analysis you performed in Phase 1, generate the specific configuration for this juror. 
  
  1. **Character Section**: Start by explicitly stating "You are ${juror.name}". Define the persona. EMPHASIZE BREVITY in their communication style (e.g. "You are direct", "You hate waffle").
  2. **Colleagues Section**: Explain who the colleagues are and when to transfer to them based on their roles.
  3. **Question Section**: Formulate EXACTLY ONE specific, hard-hitting question to ask the user. Do not create a list. This question should address one specific weakness found in the context.
  4. **Voice Selection**: Choose the voice that best fits the implied gender and personality of the juror name and role. DO NOT USE FENRIR.
  5. **Language**: Ensure the juror interacts ONLY in English.
  
  Return the content in JSON format matching the schema.`;
};
