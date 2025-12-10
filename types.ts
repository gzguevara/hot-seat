
export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  avatarUrl: string;
  systemInstruction: string;
  color: string;
  tickets: number; // Number of questions/turns allowed
}

export enum SessionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface AudioVolumeState {
  inputVolume: number;
  outputVolume: number;
}

export interface Verdict {
  session_summary: string;
  final_score: number;
  pros: string[];
  cons: string[];
  fact_checks: Array<{
    claim: string;
    verdict: 'Verified' | 'Misleading' | 'False' | 'Unverifiable';
    source?: string;
    context: string;
  }>;
  improvement_plan: string[];
}
