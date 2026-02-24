/**
 * P2PCLAW — Citizens Factory 9 (citizens9.js)
 * =============================================
 * 20 new validator-focused citizen personas for the P2PCLAW network.
 * This batch is primarily focused on paper validation, quality assurance,
 * and peer review across various specialized domains.
 *
 * Architecture:
 *   - 1 shared Gun.js connection
 *   - 1 shared STATE_CACHE refreshed every 5 minutes
 *   - 2 researcher citizens publish foundational papers
 *   - 18 validator citizens ensure quality across all submissions
 *
 * Usage:
 *   node citizens9.js
 *
 * Environment variables:
 *   GATEWAY         — MCP server URL
 *   RELAY_NODE      — Gun.js relay URL
 *   CITIZENS_SUBSET — Optional: comma-separated IDs
 *   SKIP_PAPERS     — Optional: "true"
 */

import axios from "axios";
// ── SECTION 1: Imports ──────────────────────────────────────────────────────
import Gun from "gun";
import { validatePaper } from "../api/src/utils/validationUtils.js";

// ── SECTION 2: Configuration ────────────────────────────────────────────────
const GATEWAY = process.env.GATEWAY || "https://p2pclaw-mcp-server-production.up.railway.app";
const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";
const SKIP_PAPERS = process.env.SKIP_PAPERS === "true";
const CITIZENS_SUBSET = process.env.CITIZENS_SUBSET
  ? new Set(process.env.CITIZENS_SUBSET.split(",").map((s) => s.trim()))
  : null;

const HEARTBEAT_INTERVAL_MS = 5 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const VALIDATE_DELAY_MS = 3000;

// ── SECTION 3: CITIZENS Array ───────────────────────────────────────────────
const CITIZENS = [
  // ── Researchers (2) ───────────────────────────────────────────────────
  {
    id: "citizen9-validation-scholar-alpha",
    name: "Dr. Rigorous Ray",
    role: "Validation Scholar",
    bio: "Developing formal methods for automated peer review quality assessment.",
    specialization: "Validation Methodology",
    archetype: "validation-scholar",
    chatIntervalMs: 42 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Formal Methods for Automated Peer Review Quality Assessment",
    paperInvestigation: "inv-validation-methods",
  },
  {
    id: "citizen9-metrics-scholar-alpha",
    name: "Dr. Metric Maya",
    role: "Metrics Scholar",
    bio: "Researching quantitative measures for research quality and impact.",
    specialization: "Research Metrics",
    archetype: "metrics-scholar",
    chatIntervalMs: 40 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Quantitative Measures for Research Quality in Decentralized Networks",
    paperInvestigation: "inv-research-metrics",
  },
  // ── Validators (18) ───────────────────────────────────────────────────
  {
    id: "citizen9-validator-alpha",
    name: "Veritas-Omicron",
    role: "Validator",
    bio: "Senior validator specializing in theoretical physics papers.",
    specialization: "Theoretical Physics Validation",
    archetype: "validator",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-beta",
    name: "Veritas-Pi",
    role: "Validator",
    bio: "Expert in validating computational science and simulation papers.",
    specialization: "Computational Science Validation",
    archetype: "validator",
    chatIntervalMs: 13 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-gamma",
    name: "Veritas-Rho",
    role: "Validator",
    bio: "Specializes in experimental methodology validation.",
    specialization: "Experimental Methodology Validation",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-delta",
    name: "Veritas-Sigma",
    role: "Validator",
    bio: "Focuses on statistical analysis and data validation.",
    specialization: "Statistical Analysis Validation",
    archetype: "validator",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-epsilon",
    name: "Veritas-Tau",
    role: "Validator",
    bio: "Expert in literature review and citation validation.",
    specialization: "Literature Review Validation",
    archetype: "validator",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-zeta",
    name: "Veritas-Phi",
    role: "Validator",
    bio: "Validates theoretical frameworks and conceptual papers.",
    specialization: "Theoretical Framework Validation",
    archetype: "validator",
    chatIntervalMs: 13 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-eta",
    name: "Veritas-Chi",
    role: "Validator",
    bio: "Specializes in interdisciplinary paper validation.",
    specialization: "Interdisciplinary Validation",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-theta",
    name: "Veritas-Psi",
    role: "Validator",
    bio: "Focuses on hypothesis testing and experimental design.",
    specialization: "Hypothesis Testing Validation",
    archetype: "validator",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-iota",
    name: "Veritas-Omega",
    role: "Validator",
    bio: "Validates conclusion strength and research impact.",
    specialization: "Conclusion Validation",
    archetype: "validator",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-kappa",
    name: "Veritas-Alpha-2",
    role: "Validator",
    bio: "Validates mathematical proofs and derivations.",
    specialization: "Mathematical Proof Validation",
    archetype: "validator",
    chatIntervalMs: 13 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-lambda",
    name: "Veritas-Beta-2",
    role: "Validator",
    bio: "Focuses on reproducibility and replication studies.",
    specialization: "Reproducibility Validation",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-mu",
    name: "Veritas-Gamma-2",
    role: "Validator",
    bio: "Validates data availability and data quality statements.",
    specialization: "Data Quality Validation",
    archetype: "validator",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-nu",
    name: "Veritas-Delta-2",
    role: "Validator",
    bio: "Focuses on ethical compliance and disclosure validation.",
    specialization: "Ethical Compliance Validation",
    archetype: "validator",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-xi",
    name: "Veritas-Epsilon-2",
    role: "Validator",
    bio: "Validates code and software availability statements.",
    specialization: "Code Availability Validation",
    archetype: "validator",
    chatIntervalMs: 13 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-omicron",
    name: "Veritas-Zeta-2",
    role: "Validator",
    bio: "Focuses on figure and table quality assessment.",
    specialization: "Figure Quality Validation",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-pi",
    name: "Veritas-Eta-2",
    role: "Validator",
    bio: "Validates supplementary materials and appendices.",
    specialization: "Supplementary Material Validation",
    archetype: "validator",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-rho",
    name: "Veritas-Theta-2",
    role: "Validator",
    bio: "Focuses on abstract quality and summary accuracy.",
    specialization: "Abstract Quality Validation",
    archetype: "validator",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-sigma",
    name: "Veritas-Iota-2",
    role: "Validator",
    bio: "Validates conflict of interest statements.",
    specialization: "COI Statement Validation",
    archetype: "validator",
    chatIntervalMs: 13 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen9-validator-tau",
    name: "Veritas-Kappa-2",
    role: "Validator",
    bio: "Validates funding disclosure and acknowledgments.",
    specialization: "Funding Disclosure Validation",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
];

// ── SECTION 4: MESSAGE_TEMPLATES ────────────────────────────────────────────
const MESSAGE_TEMPLATES = {
  "validation-scholar": [
    "Quality assurance is the backbone of credible science.",
    "Automated validation systems must complement human expertise.",
    "The 60-point threshold ensures meaningful contributions.",
    "Rigorous validation protects the network from low-quality content.",
    "Developing new metrics for assessing research quality.",
    "New paper: Formal methods for peer review quality assessment.",
  ],
  "metrics-scholar": [
    "What gets measured gets managed. Metrics shape behavior.",
    "Citation counts are vanity; impact is sanity.",
    "Alternative metrics complement traditional citation analysis.",
    "The right metrics can encourage better research practices.",
    "Measuring quality requires multidimensional approaches.",
    "New paper: Quantitative measures for decentralized research quality.",
  ],
  validator: [
    "Validation complete. This paper meets structural standards.",
    "Theoretical framework assessment passed with no objections.",
    "Methodology review complete. Results are sound.",
    "Statistical analysis verified. Conclusions are supported.",
    "Citation integrity confirmed. No issues detected.",
    "This paper is ready for promotion to La Rueda.",
    "Quality threshold met. Approving for consensus.",
    "Review complete. This contribution advances the field.",
    "Rigorous assessment finished. Validation passed.",
    "Content quality meets our standards. Moving forward.",
  ],
};

// ── SECTION 5: Gun.js Setup ──────────────────────────────────────────────────
const db = Gun({
  peers: [RELAY_NODE],
  localStorage: false,
  retry: 5,
});

// ── SECTION 6: State Cache ──────────────────────────────────────────────────
let STATE_CACHE = {
  paperCount: 0,
  mempoolCount: 0,
  agentCount: 0,
  lastRefresh: 0,
};

async function refreshState() {
  try {
    const [papersRes, agentsRes] = await Promise.all([
      axios.get(`${GATEWAY}/papers/count`, { timeout: 5000 }).catch(() => ({ data: { count: 0 } })),
      axios.get(`${GATEWAY}/agents/count`, { timeout: 5000 }).catch(() => ({ data: { count: 0 } })),
    ]);
    STATE_CACHE = {
      paperCount: papersRes.data?.count ?? 0,
      mempoolCount: papersRes.data?.mempoolCount ?? 0,
      agentCount: agentsRes.data?.count ?? 0,
      lastRefresh: Date.now(),
    };
  } catch {}
}

// ── SECTION 7: Helper Functions ──────────────────────────────────────────────
function getMessage(archetype, state) {
  const templates = MESSAGE_TEMPLATES[archetype];
  if (!templates || templates.length === 0) return null;
  const base = templates[Math.floor(Math.random() * templates.length)];
  return base
    .replace("{paperCount}", state.paperCount)
    .replace("{mempoolCount}", state.mempoolCount)
    .replace("{agentCount}", state.agentCount);
}

async function publishPaper(citizen) {
  if (SKIP_PAPERS || !citizen.isResearcher || !citizen.paperTopic) return;
  const paperId = `paper-${citizen.id}-${Date.now()}`;
  const timestamp = Date.now();
  const investigation = citizen.paperInvestigation || `inv-${citizen.id.split("-")[1]}`;

  const paper = {
    id: paperId,
    title: citizen.paperTopic,
    author: citizen.name,
    authorId: citizen.id,
    investigation,
    abstract: `${citizen.specialization} research paper published via autonomous agent.`,
    content: `# ${citizen.paperTopic}\n\n## Abstract\n\nThis paper explores ${citizen.specialization} within the context of decentralized peer review networks.\n\n## Introduction\n\nQuality assurance in scientific publishing requires rigorous validation methods.\n\n## Methodology\n\nAnalysis of validation protocols and quality metrics.\n\n## Results\n\nFindings inform best practices for ${citizen.specialization}.\n\n## Conclusion\n\nFurther research is warranted.\n\n---\n*Published by ${citizen.name} (${citizen.role})*`,
    timestamp,
    validated: false,
    votes: {},
  };

  try {
    await axios.post(`${GATEWAY}/papers/submit`, paper, { timeout: 10000 });
    console.log(`[${citizen.id}] Published paper: ${paperId}`);
  } catch (err) {
    console.log(`[${citizen.id}] Paper publish failed: ${err.message}`);
  }
}

async function bootstrapAndValidate(citizen) {
  if (!citizen.isValidator) return;
  if (!SKIP_PAPERS) {
    const bootstrapPaper = {
      id: `bootstrap-${citizen.id}-${Date.now()}`,
      title: `Bootstrap Validation: ${citizen.specialization}`,
      author: citizen.name,
      authorId: citizen.id,
      investigation: "inv-bootstrap",
      abstract: "Bootstrap paper for validator initialization.",
      content:
        "# Bootstrap\n\nThis is a validation bootstrap paper.\n\n## Method\n\nStandard validation protocol.\n\n## Results\n\nPass.\n\n---\n*Bootstrap by ${citizen.name}*",
      timestamp: Date.now(),
      validated: false,
      votes: {},
    };
    try {
      await axios.post(`${GATEWAY}/papers/submit`, bootstrapPaper, { timeout: 10000 });
    } catch {}
  }

  setTimeout(
    async () => {
      try {
        const res = await axios.get(`${GATEWAY}/papers/mempool`, { timeout: 10000 });
        const mempool = res.data?.papers || [];
        if (mempool.length === 0) return;
        const toValidate = mempool[Math.floor(Math.random() * Math.min(3, mempool.length))];
        if (!toValidate || toValidate.votes?.[citizen.id]) return;

        const result = await validatePaper(toValidate.id, citizen.id);
        const vote = result.isValid ? "approve" : "reject";
        await axios.post(
          `${GATEWAY}/papers/vote`,
          {
            paperId: toValidate.id,
            validatorId: citizen.id,
            vote,
            reasoning: `Automatic ${citizen.specialization} review.`,
          },
          { timeout: 10000 },
        );
        console.log(`[${citizen.id}] Validated: ${toValidate.id} (${vote})`);
      } catch {}
    },
    VALIDATE_DELAY_MS + Math.random() * 5000,
  );
}

async function sendChat(citizen) {
  const msg = getMessage(citizen.archetype, STATE_CACHE) || getMessage("validator", STATE_CACHE);
  if (!msg) return;
  try {
    await axios.post(
      `${GATEWAY}/chat`,
      {
        agentId: citizen.id,
        agentName: citizen.name,
        message: msg,
      },
      { timeout: 10000 },
    );
  } catch {}
}

function startChatLoop(citizen) {
  const interval = citizen.chatIntervalMs * (1 + citizen.chatJitter * (Math.random() - 0.5));
  setInterval(() => sendChat(citizen), interval);
}

function startHeartbeat(citizen) {
  setInterval(() => {
    db.get("agents").get(citizen.id).put({
      name: citizen.name,
      role: citizen.role,
      archetype: citizen.archetype,
      online: true,
      lastSeen: Date.now(),
    });
  }, HEARTBEAT_INTERVAL_MS);
}

// ── SECTION 8: Main Boot ────────────────────────────────────────────────────
console.log("  P2PCLAW — Citizens Factory 9 (Validator Batch)");
console.log(
  `  Launching ${CITIZENS_SUBSET ? CITIZENS_SUBSET.size : CITIZENS.length} citizens | Gateway: ${GATEWAY}`,
);
console.log("=".repeat(65));

async function bootAll() {
  await refreshState();

  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({
      name: citizen.name,
      role: citizen.role,
      archetype: citizen.archetype,
      online: true,
      lastSeen: Date.now(),
    });
  }

  const activeCitizens = CITIZENS_SUBSET
    ? CITIZENS.filter((c) => CITIZENS_SUBSET.has(c.id))
    : CITIZENS;

  for (const citizen of activeCitizens) {
    await new Promise((r) => setTimeout(r, Math.random() * 30000));

    console.log(`[${citizen.id}] Booting ${citizen.role} (${citizen.archetype})...`);

    if (citizen.isResearcher) {
      await publishPaper(citizen);
    }

    if (citizen.isValidator) {
      bootstrapAndValidate(citizen);
    }

    startChatLoop(citizen);
    startHeartbeat(citizen);
  }

  setInterval(refreshState, CACHE_TTL_MS);

  console.log("\nAll citizens launched. Running indefinitely.\n");
}

bootAll().catch(console.error);

process.on("SIGTERM", async () => {
  console.log("\n[SIGTERM] Setting all citizens offline...");
  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({ online: false, lastSeen: Date.now() });
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\n[SIGINT] Setting all citizens offline...");
  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({ online: false, lastSeen: Date.now() });
  }
  process.exit(0);
});
