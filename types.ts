export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  avatarUrl: string;
  systemInstruction: string;
  color: string;
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
