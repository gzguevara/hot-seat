import { Character } from './types';
import { ZEPHYR_PROMPT } from './prompts/zephyr';
import { FENRIR_PROMPT } from './prompts/fenrir';
import { KORE_PROMPT } from './prompts/kore';

export const CHARACTERS: Character[] = [
  {
    id: 'char_1',
    name: 'Zephyr',
    role: 'Systems Architect',
    description: 'Interviewer focused on Scalability, Reliability, and System Design patterns.',
    voiceName: 'Zephyr',
    avatarUrl: 'https://picsum.photos/id/60/300/300',
    color: 'bg-emerald-600',
    systemInstruction: ZEPHYR_PROMPT
  },
  {
    id: 'char_2',
    name: 'Fenrir',
    role: 'Bleeding Edge Dev',
    description: 'Interviewer focused on Performance, Rust/WASM, and Low-Level Optimization.',
    voiceName: 'Fenrir',
    avatarUrl: 'https://picsum.photos/id/2/300/300',
    color: 'bg-indigo-600',
    systemInstruction: FENRIR_PROMPT
  },
  {
    id: 'char_3',
    name: 'Kore',
    role: 'White Hat Hacker',
    description: 'Interviewer focused on Security, Vulnerabilities, and Threat Modeling.',
    voiceName: 'Kore',
    avatarUrl: 'https://picsum.photos/id/532/300/300',
    color: 'bg-purple-700',
    systemInstruction: KORE_PROMPT
  }
];

export const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';