
/**
 * Updates specific sections of a Juror's System Prompt.
 * 
 * @param originalPrompt The full current system prompt string.
 * @param newQuestion The new question text to replace the existing one.
 * @param newMemory The summary of the last interaction to append to history.
 * @returns The updated system prompt string.
 */
export function updateJurorSystemPrompt(originalPrompt: string, newQuestion: string, newMemory: string): string {
    let updatedPrompt = originalPrompt;
  
    // 1. Update Question Section
    // Handles headers like "# 4." or "## 4."
    // regex breakdown:
    // (#+ 4\.) matches "# 4." or "## 4."
    // [\s\S]*? matches content lazily
    // (?=[\r\n]+#+ 5) looks ahead for the next section header (Section 5)
    const questionRegex = /(#+ 4\. YOUR ASSIGNED QUESTION\s*[\r\n]+)([\s\S]*?)(?=[\r\n]+#+ 5)/;
    
    if (questionRegex.test(updatedPrompt)) {
      updatedPrompt = updatedPrompt.replace(questionRegex, `$1${newQuestion}\n`);
    } else {
      console.warn("[PromptUtils] Could not find Question section to update (Header #4 missing or malformed).");
    }
  
    // 2. Append to History Section
    // Handles headers like "# 5." or "## 5."
    // Looks ahead for Section 6 OR end of string ($)
    const historyRegex = /(#+ 5\. CANDIDATE HISTORY \(SATISFACTION LEVEL\)\s*[\r\n]+)([\s\S]*?)(?=[\r\n]+#+ 6|$)/;
  
    if (historyRegex.test(updatedPrompt)) {
      updatedPrompt = updatedPrompt.replace(historyRegex, (match, header, content) => {
        // Clean up content to avoid excessive newlines, then append new memory
        return `${header}${content.trim()}\n\n- ${newMemory}\n`;
      });
      console.log("[PromptUtils] ✅ History successfully updated.");
    } else {
      console.warn("[PromptUtils] Could not find History section to update (Header #5 missing or malformed).");
    }
  
    return updatedPrompt;
  }
