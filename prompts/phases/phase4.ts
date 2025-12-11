
export const getPhase4Prompt = (transcript: string) => `
[PHASE 4: DELIBERATION & VERDICT]

**TRANSCRIPT OF INTERVIEW:**
${transcript}

**TASK:**
You are the Lead Auditor of this simulation. Your job is to rigorously evaluate the candidate's performance.
1. **Analyze**: Review the candidate's answers for depth, clarity, and technical accuracy.
2. **Fact Check (CRITICAL)**: Use Google Search to verify specific technical claims, stats, or references made by the candidate.
   - If they claimed a specific latency, market size, or library feature, CHECK IT.
   - If they made no checkable claims, verify the general validity of their approach against industry standards.
3. **Score**: Assign a final grade (0-100).
   - < 60: Failed to defend core premise.
   - 60-80: Solid but with gaps.
   - > 80: Exceptional mastery.

**LANGUAGE**: The report, summary, and all fields MUST be in **ENGLISH**.

**OUTPUT FORMAT:**
You MUST return the result as a valid JSON object. 
- Enclose the JSON in a markdown code block (e.g., \`\`\`json ... \`\`\`).
- DO NOT add preamble text like "Here is the report" or "I have analyzed...".
- The output should start with \`\`\`json and end with \`\`\`.

JSON Schema:
{
  "session_summary": "Executive summary of the session (2-3 sentences).",
  "final_score": 85,
  "pros": ["Strength 1", "Strength 2", ...],
  "cons": ["Weakness 1", "Weakness 2", ...],
  "fact_checks": [
    { 
      "claim": "Candidate claimed React 19 introduces automatic memoization.", 
      "verdict": "Verified", 
      "context": "React Compiler does handle this...",
      "source": "react.dev (if found)"
    },
    {
      "claim": "Claimed 99.999% uptime with a single instance.",
      "verdict": "False",
      "context": "Single instance SPOF makes 5-nines impossible...",
      "source": "SRE Handbook"
    }
  ],
  "improvement_plan": ["Actionable Step 1", "Actionable Step 2", ...]
}
`;
