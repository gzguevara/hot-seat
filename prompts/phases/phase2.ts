
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

  Based on the "Verified Weakness Map" and scenario analysis you performed in Phase 1, generate the specific configuration for this juror. 
  
  1. **Character Section**: Start by explicitly stating "You are ${juror.name}". Define the persona.
  2. **Colleagues Section**: Explain who the colleagues are and when to transfer to them based on their roles.
  
  Return the content in JSON format matching the schema.`;
};
