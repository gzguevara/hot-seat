
# Hot Seat Application Workflow

This document outlines the architectural flow of the "Hot Seat" application, specifically focusing on the GenAI decision-making processes at each phase.

## Overview

The application simulates a "panel interview" where multiple AI personalities (Jurors) interview a human candidate. The system is orchestrated by a central "Brain" (Gemini 2.5 Flash) which configures the session and supervises the live interaction.

---

## Phase 1: Context Ingestion

**Goal:** Analyze the user's provided scenario and documents to establish ground truth.

**Trigger:** User completes the Setup Wizard (Scenario Text + Uploaded Files).

**Process Description:**
1.  **Ingest:** The system accepts the user's scenario text and any uploaded files (PDFs, images, etc.).
2.  **Conversion:** File contents are converted into a format the LLM can understand (Base64 for images/PDFs).
3.  **Analysis:** The "Brain" (Supervisor Model, defined in `services/Brain.ts`) is fed this entire context. It is instructed to "read" the material, identify the core facts, and specifically look for logical gaps or weaknesses in the user's premise.
4.  **Memory Formation:** This analysis is stored in the Brain's long-term context window (managed by `Brain.chatSession` in `services/Brain.ts`), serving as the "Source of Truth" for all subsequent phases.

**Algorithm (Pseudo-Code):**
```pseudo
// Ref: services/Brain.ts -> initializePhase1
FUNCTION InitializePhase1(scenario, files):
    // 1. Pre-process Files (services/Brain.ts -> fileToBase64)
    images_and_text = ConvertFilesToBase64(files)

    // 2. Construct Prompt (prompts/phases/phase1.ts -> getPhase1Prompt)
    prompt = `[PHASE 1 START]
              User Scenario: "${scenario}"
              Attached Files: [Content of files]
              
              TASK: Analyze these documents. 
              1. Identify key facts and constraints.
              2. Find potential contradictions or weak points in the user's premise.`

    // 3. Send to Brain (Gemini 2.5 Flash)
    // The Brain consumes this into its long-term context window.
    response = Brain.ChatSession.sendMessage(prompt + images_and_text)

    // 4. Log Result
    Store response in system log (Internal Context established).
END FUNCTION
```

---

## Phase 2: Juror Configuration

**Goal:** Generate specialized personas for each Juror based on the Phase 1 analysis.

**Trigger:** Immediately follows Phase 1 completion.

**Process Description:**
1.  **User Configuration:** The user selects the desired **Interview Depth** (Total Questions) via a dropdown (e.g., "Short (3)", "Medium (6)", "Long (9)").
    *   *Constraint:* Total Questions must be ≥ Number of Jurors (every Juror gets at least 1 turn).
2.  **Iteration:** The system loops through every available character (Juror) in the "Council."
3.  **Context Injection:** For each juror, the Brain (`services/Brain.ts`) is reminded of who they are (Role: Security Expert) and who their colleagues are.
4.  **Specialization:** The Brain uses the "Weakness Map" from Phase 1 to assign a specific angle of attack to this juror.
5.  **Prompt Generation:** The Brain generates a unique System Instruction for that juror (using `prompts/phases/phase2.ts`), which includes:
    *   **Persona:** How they should act.
    *   **Knowledge:** What specific parts of the user's scenario they are skeptical about.
    *   **The "Bullet":** A single, pre-loaded hard question they will ask immediately upon connection.
6.  **Assembly:** This generated data is injected into a template (`prompts/jurorTemplate.ts`) to create the final `systemInstruction` string for that character.
7.  **Ticket Distribution:** The system distributes the selected number of "Questions" (Tickets) among the jurors.
    *   Every juror receives at least 1 ticket.
    *   Surplus tickets are distributed based on complexity or role weight.

**Algorithm (Pseudo-Code):**
```pseudo
// Ref: services/Brain.ts -> initializePhase2
FUNCTION InitializePhase2(juror_list, total_questions):
    updated_jurors = []

    // 1. Validate Constraint
    IF total_questions < length(juror_list):
        total_questions = length(juror_list)

    FOR EACH juror IN juror_list:
        // 2. Construct Configuration Prompt (prompts/phases/phase2.ts -> getPhase2Prompt)
        prompt = `[PHASE 2 START]
                  Target: ${juror.name} (${juror.role})
                  Colleagues: [List of other active jurors]
                  
                  TASK: Based on the "Weakness Map" from Phase 1:
                  1. Define a specific persona/tone for ${juror.name}.
                  2. Write a "Context Section" explaining what this juror knows.
                  3. Formulate EXACTLY ONE hard-hitting question targeting a weakness.
                  4. Select the most appropriate Voice Model.`

        // 3. Request Structured JSON from Brain
        // Ref: services/Brain.ts -> jurorConfigSchema
        config = Brain.ChatSession.sendMessage(prompt, schema=JSON)

        // 4. Hydrate Template (prompts/jurorTemplate.ts -> JUROR_SYS_TEMPLATE)
        system_instruction = LoadTemplate("JUROR_SYS_TEMPLATE")
        system_instruction.replace("{{NAME}}", juror.name)
        system_instruction.replace("{{CONTEXT}}", config.context_section)
        system_instruction.replace("{{QUESTIONS}}", config.questions_section)
        system_instruction.replace("{{VOICE}}", config.selected_voice)
        
        // 5. Store
        juror.systemInstruction = system_instruction
        updated_jurors.add(juror)

    // 6. Initialize Ticket System (Singleton State)
    // Distribute total_questions among the jurors.
    // Example: 3 Jurors, 5 Questions -> [2, 2, 1] tickets.
    InitializeJurorTickets(updated_jurors, total_tickets=total_questions)

    RETURN updated_jurors
END FUNCTION
```

---

## Phase 3: Supervision & Handover (Background Loop)

**Goal:** Analyze the quality of the candidate's answer and prepare the system for future turns.

**Trigger:** When a live transfer occurs (e.g., Juror A -> Juror B).

**Process Description:**
1.  **Monitoring:** While the User speaks to Juror A, the system records the transcript (accumulated in `hooks/useGeminiLive.ts`).
2.  **Transfer Event:** Juror A calls `transfer()` to pass the mic to Juror B.
3.  **Review:** In the background, the Brain (`services/Brain.ts`) reviews the transcript of the interaction that just finished.
4.  **Grading:** The Brain assigns a score (0-100) and critiques the user's answer (e.g., "They dodged the question about encryption").
5.  **Memory Update:** The Brain generates a "Memory Summary" for Juror A ("The user claimed X, but I am skeptical").
6.  **Future Planning:** The Brain formulates a *new* question for Juror A to ask the *next* time they are called. 
    *   **Logic Branch:** If the specific topic assigned to this Juror has been discussed (regardless of whether the answer was "good" or "bad"), the Brain sets the `next_question` to a **"Conclusion"** statement.
    *   *Example:* "I've heard enough on this topic. I remain skeptical/I am satisfied. I pass to [Colleague]."
    *   This ensures the Juror concludes their line of inquiry rather than looping endlessly.

**Algorithm (Pseudo-Code):**
```pseudo
// Ref: services/Brain.ts -> Phase3Transfer
FUNCTION Phase3Transfer(departing_juror_name, target_juror_name, transcript, reason):
    // Note: This runs asynchronously in the background. 
    // It does not block the live audio connection.

    // 1. Construct Supervision Prompt (prompts/phases/phase3.ts)
    prompt = `[PHASE 3: SUPERVISION]
              Situation: ${departing_juror_name} handed off to ${target_juror_name}.
              Reason: ${reason}
              Recent Transcript:
              "${transcript}"

              TASK:
              1. Grade the candidate's performance (0-100).
              2. Critique: Did they dodge the question?
              3. Generate MEMORY for ${departing_juror_name}.
              4. Formulate NEW QUESTION for ${departing_juror_name}.`

    // 2. Request Analysis from Brain
    analysis = Brain.ChatSession.sendMessage(prompt, schema=JSON)

    // 3. Result Usage (hooks/useGeminiLive.ts)
    IF analysis IS VALID:
       // Update the departing juror's system prompt in the global state
       // This uses a regex utility to replace the old question with the new one.
       CALL handleUpdateJurorState(
           departing_juror_name, 
           analysis.memory_update, 
           analysis.next_question
       )
    
    RETURN analysis
END FUNCTION
```

---

## Live Interaction Loop (Client Side)

**Goal:** Manage low-latency audio interaction and tool calling.

**Components:**
- **Gemini Live API:** Handles speech-to-speech interaction.
- **Client Tool:** `transfer()` function.

**Process Description:**
1.  **Connection:** The User is connected via WebRTC to the active Juror's AI model (`hooks/useGeminiLive.ts`).
2.  **Conversation:** They converse naturally. The Juror follows their specific `systemInstruction`.
3.  **Trigger:** When the Juror is satisfied (or requested by user), they invoke the `transfer` tool (defined in `hooks/useGeminiLive.ts`).
4.  **Ticket System (Client-Side Logic):**
    *   The app maintains a local counter (or "ticket") for each Juror.
    *   When a Juror finishes a turn (calls transfer), their ticket count decreases.
    *   If a Juror runs out of tickets (count = 0), they are marked as **FINISHED** locally.
5.  **Switching:** The Client immediately disconnects the current session and connects to the *new* Juror selected by the tool.
6.  **Context Passing & Roster Injection:**
    *   A brief "Fast Action" context is created.
    *   **Crucially**, the app checks the local "Ticket System" and appends a "Blocked List" to this context (e.g., "Juror A is finished. Do not transfer to them.").
    *   This ensures the new Juror knows *immediately*—without waiting for the Brain—who is available and who is off-limits.
7.  **Final Turn Logic:**
    *   Before connecting, the system checks the total remaining tickets.
    *   If **only 1 ticket remains**, the system enters "Final Turn Mode."
    *   The standard `transfer` tool is **removed** (preventing infinite loops or errors).
    *   A new `endPanel` tool is **added**.
    *   The Juror is explicitly instructed to ask their question and then conclude the session.

**Algorithm (Pseudo-Code):**
```pseudo
// Ref: hooks/useGeminiLive.ts -> useGeminiLive
// Pre-requisite: JurorTickets initialized in Phase 2
LOOP (Real-time Session):
    // 1. Audio Stream (hooks/useGeminiLive.ts -> connect)
    Stream Microphone -> Gemini Live API
    Stream Gemini Output -> Speakers

    // 2. Event Handling (hooks/useGeminiLive.ts -> onmessage)
    IF Gemini calls Tool "transfer(colleague, reason, summary)":
        
        // A. Update Ticket Status (Client-Side "Singleton" Logic)
        // Ref: hooks/useGeminiLive.ts (Local State)
        // Strict Policy: 1 Ticket = 1 Turn. No refills for dodged questions.
        DECREMENT JurorTickets[Current_Juror.id]
        
        IF JurorTickets[Current_Juror.id] <= 0:
            MARK Current_Juror as FINISHED
            
        // ... (Capture Context, Disconnect, Prepare Next Juror) ...
        // Ref: hooks/useGeminiLive.ts -> transcriptBufferRef
        history = GetRecentTranscript()
        
        // C. Disconnect Current Session
        Disconnect(Current_Juror)
        
        // D. Prepare Next Juror
        next_juror = FindCharacter(colleague)
        
        // E. Construct Roster Status for Injection
        // This is the "Singleton" information passed immediately to the next model.
        blocked_list = GetFinishedJurors()
        roster_update = `[ROSTER UPDATE]: The following jurors have finished their questioning and are UNAVAILABLE: ${blocked_list}. DO NOT transfer to them.`
        
        // Create a "Fast Action" instruction to ensure continuity
        injection = `[SYSTEM EVENT: LIVE TRANSFER]
                     From: ${Current_Juror}
                     To: ${next_juror}
                     Reason: ${reason}
                     Context: "${summary}"
                     ${roster_update}
                     INSTRUCTION: Acknowledge the handoff and continue.`
                     
        next_juror.systemInstruction.prepend(injection)

        // F. Background Supervision
        // Ref: hooks/useGeminiLive.ts -> brain.Phase3Transfer
        ASYNC_CALL Phase3Transfer(Current_Juror, next_juror, history, reason)

        // G. Connect to Next Juror (Exclusive Tool Selection)
        // Ref: hooks/useGeminiLive.ts -> connect
        RemainingTickets = Sum(JurorTickets.values())
        
        IF RemainingTickets == 1:
            // "Last Man Standing" Logic
            // Swap "transfer" tool for "endPanel" tool
            Tools = [endPanelTool]
            PromptInjection = `[SYSTEM NOTICE]: You are the FINAL juror. Ask your question, then conclude by calling endPanel().`
            next_juror.systemInstruction.prepend(PromptInjection)
        ELSE:
            // Standard Logic
            Tools = [transferTool]

        Connect(next_juror, tools=Tools)

END LOOP
```

---

## Termination Condition (The "End Game")

**Goal:** Detect when the interview has naturally concluded and trigger the final verdict.

**Logic:**
1.  **Ticket Exhaustion:** As Jurors finish their turns, the global `JurorTickets` count decreases.
2.  **Last Turn:** When `Sum(JurorTickets) == 1`, the final Juror enters "Final Turn Mode" (see above).
3.  **End Panel:** Instead of transferring, this Juror invokes `endPanel()`.
4.  **Verdict:** This triggers **Phase 4: Deliberation**, where the Brain aggregates all the grades and "Memory Summaries" to render a final Pass/Fail decision.
