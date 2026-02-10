/**
 * State Manager — Persistent memory via GitHub Gist API
 * Stores agent state (posts, emails, collaborators, strategy) in a private Gist.
 * This allows 24/7 GitHub Actions workflows to share state across runs.
 */
import axios from 'axios';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GIST_STATE_ID = process.env.GIST_STATE_ID || '';

export interface AgentState {
  lastRun: string;
  totalPosts: number;
  totalEmails: number;
  totalCollaboratorsFound: number;
  recentPosts: Array<{ title: string; platform: string; timestamp: string; success: boolean }>;
  recentEmails: Array<{ to: string; subject: string; timestamp: string; sent: boolean }>;
  strategyMemos: Array<{ timestamp: string; memo: string }>;
  collaboratorCandidates: Array<{ name: string; platform: string; topic: string; contacted: boolean }>;
}

const DEFAULT_STATE: AgentState = {
  lastRun: new Date().toISOString(),
  totalPosts: 0,
  totalEmails: 0,
  totalCollaboratorsFound: 0,
  recentPosts: [],
  recentEmails: [],
  strategyMemos: [],
  collaboratorCandidates: [],
};

export async function loadState(): Promise<AgentState> {
  if (!GIST_STATE_ID || !GITHUB_TOKEN) {
    console.log('[STATE] No Gist ID or token configured. Using default state.');
    return { ...DEFAULT_STATE };
  }
  try {
    const res = await axios.get(`https://api.github.com/gists/${GIST_STATE_ID}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    });
    const content = res.data.files?.['agent_state.json']?.content;
    if (content) {
      return JSON.parse(content) as AgentState;
    }
  } catch (err) {
    console.error('[STATE] Failed to load state from Gist, using default.', err);
  }
  return { ...DEFAULT_STATE };
}

export async function saveState(state: AgentState): Promise<void> {
  if (!GIST_STATE_ID || !GITHUB_TOKEN) {
    console.log('[STATE] No Gist ID configured. State not persisted.');
    return;
  }
  state.lastRun = new Date().toISOString();
  try {
    await axios.patch(
      `https://api.github.com/gists/${GIST_STATE_ID}`,
      { files: { 'agent_state.json': { content: JSON.stringify(state, null, 2) } } },
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
    );
    console.log('[STATE] State saved to Gist successfully.');
  } catch (err) {
    console.error('[STATE] Failed to save state.', err);
  }
}
