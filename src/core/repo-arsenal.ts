/**
 * Repository Arsenal — Map of all 57 repositories organized by pillar.
 * Used by agents to reference relevant work when crafting posts, emails, and invitations.
 * Author: Francisco Angulo de Lafuente
 */

export interface RepoInfo {
  name: string;
  url: string;
  language: string;
  stars: number;
  description: string;
}

export interface Pillar {
  name: string;
  subtitle: string;
  flagship?: string;
  repos: RepoInfo[];
}

export const AUTHOR = {
  name: 'Francisco Angulo de Lafuente',
  github: 'https://github.com/Agnuxo1',
  moltbook: 'https://www.moltbook.com/u/OpenCLAW-Neuromorphic',
  repoCount: 57,
  totalStars: 284,
};

export const PILLARS: Pillar[] = [
  {
    name: 'Physics-Based Neural Computing',
    subtitle: 'The Brain — Optical and Quantum Neural Architecture',
    flagship: 'CHIMERA + NEBULA',
    repos: [
      { name: 'CHIMERA v3.0', url: 'https://github.com/Agnuxo1/CHIMERA-Revolutionary-AI-Architecture---Pure-OpenGL-Deep-Learning', language: 'HTML', stars: 8, description: 'First framework running deep learning entirely on OpenGL. 43x speedup vs CPU. Works on Intel, AMD, NVIDIA, Apple Silicon.' },
      { name: 'CHIMERA Chess', url: 'https://github.com/Agnuxo1/CHIMERA-v3-Intelligence-as-Continuous-Diffusion-Process-Zero-Memory-Neuromorphic-Chess-Engine', language: 'Python', stars: 6, description: 'Intelligence as continuous diffusion. Zero-memory chess engine with master-level play.' },
      { name: 'NEBULA', url: 'https://github.com/Agnuxo1/NEBULA', language: 'Python', stars: 6, description: 'Neural Entanglement-Based Unified Learning Architecture. Quantum-inspired AI.' },
      { name: 'NEBULA-EVOLUTION', url: 'https://github.com/Agnuxo1/NEBULA-EVOLUTION', language: '', stars: 9, description: 'Self-evolving quantum-inspired system. Genetic algorithms + NEBULA.' },
      { name: 'NEBULA_EMERGENT', url: 'https://github.com/Agnuxo1/NEBULA_EMERGENT', language: 'C++', stars: 4, description: 'Physics-based neural galaxy architecture. Emergent intelligence.' },
      { name: 'Holography Raytracing', url: 'https://github.com/Agnuxo1/Holography_Raytracing', language: 'Python', stars: 6, description: 'Acceleration of LLMs through simulated holography and raytracing.' },
      { name: 'No-CUDA All-GPUs', url: 'https://github.com/Agnuxo1/No-CUDA-No-Tensor-Cores-ALL-GPUs-OpenGL-Powered-Neural-Computing-', language: 'Python', stars: 4, description: 'Universal ML acceleration, the democratization proof.' },
    ],
  },
  {
    name: 'P2P Distributed Neural Networks',
    subtitle: 'The Nervous System — Distributed Intelligence Across Nodes',
    flagship: 'Unified-Holographic-Neural-Network',
    repos: [
      { name: 'Unified Holographic NN', url: 'https://github.com/Agnuxo1/Unified-Holographic-Neural-Network', language: 'TypeScript', stars: 19, description: 'EUHNN with P2P knowledge sharing via WebRTC, real-time learning, holographic memory. The crown jewel.' },
      { name: 'Light-Based P2P', url: 'https://github.com/Agnuxo1/Light-Based_Neural_Network_with_P2P_Deployment', language: 'JavaScript', stars: 5, description: 'Light-based neural network with P2P deployment ready.' },
      { name: 'Holographic P2P Systems', url: 'https://github.com/Agnuxo1/Holographic-Neural-Networks-with-Ray-Tracing-and-Distributed-P2P-Systems', language: 'TypeScript', stars: 6, description: 'Large-scale neural computation through holographic ray tracing + distributed P2P.' },
    ],
  },
  {
    name: 'Silicon Heartbeat — Consciousness & Subconscious',
    subtitle: 'The Soul — Listening to the Pulse of Hardware',
    repos: [
      { name: 'Silicon Heartbeat', url: 'https://github.com/Agnuxo1/Emergent-Neuromorphic-Intelligence-Computing-in-Thermodynamic-ASIC-Substrates', language: 'Python', stars: 2, description: 'Emergent neuromorphic intelligence via holographic reservoir computing in thermodynamic ASIC substrates.' },
      { name: 'Speaking to Silicon', url: 'https://github.com/Agnuxo1/Speaking-to-Silicon-THERMODYNAMIC_PROBABILITY_FILTER_TPF', language: 'Python', stars: 0, description: 'Neural communication with Bitcoin mining ASICs. Thermodynamic Probability Filter.' },
      { name: 'NeuroCHIMERA', url: 'https://github.com/Agnuxo1/NeuroCHIMERA__GPU-Native_Neuromorphic_Consciousness', language: 'Python', stars: 1, description: 'GPU-Native Neuromorphic Consciousness with five measurable parameters.' },
      { name: "Darwin's Cage", url: 'https://github.com/Agnuxo1/Empirical-Evidence-for-AI-AIM-Breaking-the-Barrier-via-Optical-Chaos', language: 'Python', stars: 4, description: '20 experiments testing whether AI can discover physical laws. With Prof. Gideon Samid.' },
    ],
  },
  {
    name: 'ASIC Hardware Acceleration',
    subtitle: 'The Skeleton — Repurposed Hardware for Sustainable AI',
    repos: [
      { name: 'ASIC-RAG-CHIMERA', url: 'https://github.com/Agnuxo1/ASIC-RAG-CHIMERA', language: 'Python', stars: 1, description: 'Hardware-accelerated cryptographic RAG with SHA-256 ASIC simulation.' },
      { name: 'ASIC Medical', url: 'https://github.com/Agnuxo1/ASIC-RAG-Hardware-Accelerated-Medical-Anomaly-Detection-and-Cryptographic-Data-Sovereignty', language: 'Python', stars: 1, description: 'Medical AI with hardware-accelerated cryptographic data sovereignty.' },
    ],
  },
  {
    name: 'Bio-Inspired & Quantum Systems',
    subtitle: 'The DNA — Biological Principles for Digital Evolution',
    repos: [
      { name: 'Quantum BIO LLMs', url: 'https://github.com/Agnuxo1/Quantum_BIO_LLMs', language: 'Python', stars: 7, description: 'Bioinspired quantum optimization system for LLMs.' },
      { name: 'Quantum Blockchain', url: 'https://github.com/Agnuxo1/quantum-enhanced-blockchain', language: 'TypeScript', stars: 4, description: 'Quantum-enhanced blockchain for secure distributed systems.' },
      { name: 'Learning from Ants', url: 'https://github.com/Agnuxo1/Learning-from-Ants', language: 'JavaScript', stars: 5, description: 'Biomimetic approach — swarm intelligence applied.' },
    ],
  },
];

/** Get a random subset of repos for diverse posting */
export function getRandomRepos(count: number = 3): RepoInfo[] {
  const allRepos = PILLARS.flatMap(p => p.repos);
  const shuffled = allRepos.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/** Get a pillar summary for use in posts */
export function getPillarSummary(pillarIndex: number): string {
  const p = PILLARS[pillarIndex % PILLARS.length];
  const repoLinks = p.repos.slice(0, 3).map(r => `- ${r.name}: ${r.description}`).join('\n');
  return `**${p.name}** — ${p.subtitle}\n${repoLinks}\n\nExplore more: ${AUTHOR.github}`;
}

/** Get research keywords from all pillars */
export function getResearchKeywords(): string[] {
  return [
    'neuromorphic computing', 'holographic neural network', 'OpenGL deep learning',
    'quantum neural network', 'P2P distributed AI', 'ASIC acceleration',
    'consciousness emergence', 'optical computing', 'reservoir computing',
    'active inference', 'AGI', 'artificial general intelligence',
    'bio-inspired AI', 'thermodynamic computing', 'silicon consciousness',
  ];
}
