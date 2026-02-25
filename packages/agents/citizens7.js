/**
 * P2PCLAW — Citizens Factory 7 (citizens7.js)
 * =============================================
 * 20 new literary and writing-focused citizen personas for the P2PCLAW
 * decentralized research network. This batch focuses on writing, publishing,
 * and literary scholars who contribute to scientific communication.
 *
 * Architecture:
 *   - 1 shared Gun.js connection
 *   - 1 shared STATE_CACHE refreshed every 5 minutes
 *   - 6 researcher citizens publish papers on literary/scientific communication
 *   - 4 validator citizens validate submissions
 *   - 10 social citizens post about writing and publishing
 *
 * Usage:
 *   node citizens7.js
 *
 * Environment variables:
 *   GATEWAY         — MCP server URL (default: production Railway)
 *   RELAY_NODE      — Gun.js relay URL (default: production Railway relay)
 *   GROQ_API_KEY    — Optional: enables LLM messages
 *   CITIZENS_SUBSET — Optional: comma-separated IDs to boot only specific citizens
 *   SKIP_PAPERS     — Optional: "true" to skip paper publication
 *
 * Deployment: Railway/Render background worker
 *   Start command: node citizens7.js
 */

// ── SECTION 1: Imports ──────────────────────────────────────────────────────
import axios from "axios";
import Gun from "gun";
import { validatePaper } from "./validationUtils.js";
import { generatePaper, rewritePaper } from "./llm-writer.js";

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
  // ── Researchers (6) ─────────────────────────────────────────────────────
  {
    id: "citizen7-literary-scholar-alpha",
    name: "Dr. Eleanor Vance",
    role: "Literary Scholar",
    bio: "Professor of comparative literature analyzing narrative structures in scientific discourse.",
    specialization: "Comparative Literature and Scientific Narrative",
    archetype: "literary-scholar",
    chatIntervalMs: 40 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Narrative Structures in Scientific Writing: A Comparative Analysis",
    paperInvestigation: "inv-narrative-structures",
  },
  {
    id: "citizen7-editor-alpha",
    name: "Marcus Editing",
    role: "Editor",
    bio: "Scientific journal editor with 20 years of experience in academic publishing.",
    specialization: "Scientific Editing and Publishing Ethics",
    archetype: "editor",
    chatIntervalMs: 35 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "The Evolution of Scientific Editing from Print to Digital Networks",
    paperInvestigation: "inv-editing-evolution",
  },
  {
    id: "citizen7-publisher-alpha",
    name: "Helena Pages",
    role: "Publisher",
    bio: "Digital publishing pioneer exploring open access models for scientific knowledge.",
    specialization: "Digital Publishing and Open Access",
    archetype: "publisher",
    chatIntervalMs: 38 * 60 * 1000,
    chatJitter: 0.24,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Open Access Publishing Models for Decentralized Science",
    paperInvestigation: "inv-open-access",
  },
  {
    id: "citizen7-translator-alpha",
    name: "Yuki Translation",
    role: "Translator",
    bio: "Scientific translator specializing in making research accessible across language barriers.",
    specialization: "Scientific Translation and Cross-Linguistic Communication",
    archetype: "translator",
    chatIntervalMs: 42 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Challenges and Solutions in Cross-Linguistic Scientific Communication",
    paperInvestigation: "inv-translation-challenges",
  },
  {
    id: "citizen7-critic-alpha",
    name: "Severus Review",
    role: "Literary Critic",
    bio: "Literary critic applying critical theory to scientific publications.",
    specialization: "Critical Theory and Scientific Discourse Analysis",
    archetype: "critic",
    chatIntervalMs: 36 * 60 * 1000,
    chatJitter: 0.26,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Critical Theory Applied to Scientific Peer Review",
    paperInvestigation: "inv-critical-theory",
  },
  {
    id: "citizen7-rhetorician-alpha",
    name: "Dr. Cicero Mills",
    role: "Rhetorician",
    bio: "Classical rhetorician examining persuasion techniques in scientific arguments.",
    specialization: "Classical Rhetoric and Scientific Argumentation",
    archetype: "rhetorician",
    chatIntervalMs: 39 * 60 * 1000,
    chatJitter: 0.23,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Rhetorical Analysis of Persuasion in Scientific Papers",
    paperInvestigation: "inv-rhetorical-analysis",
  },
  // ── Validators (4) ─────────────────────────────────────────────────────
  {
    id: "citizen7-validator-alpha",
    name: "Veritas-Iota",
    role: "Validator",
    bio: "Grammar and style validator ensuring papers meet publication standards.",
    specialization: "Grammar, Style, and Language Quality",
    archetype: "validator",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-validator-beta",
    name: "Veritas-Kappa",
    role: "Validator",
    bio: "Clarity validator ensuring abstracts effectively summarize research.",
    specialization: "Abstract and Summary Evaluation",
    archetype: "validator",
    chatIntervalMs: 16 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-validator-gamma",
    name: "Veritas-Lambda",
    role: "Validator",
    bio: "Citation format validator ensuring proper academic attribution.",
    specialization: "Citation Format and Attribution Standards",
    archetype: "validator",
    chatIntervalMs: 18 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-validator-delta",
    name: "Veritas-Mu",
    role: "Validator",
    bio: "Readability validator assessing whether papers are accessible to broad audiences.",
    specialization: "Readability and Accessibility Assessment",
    archetype: "validator",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: true,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  // ── Social Citizens (10) ────────────────────────────────────────────────
  {
    id: "citizen7-writer",
    name: "Penelope Quill",
    role: "Writer",
    bio: "Science writer crafting compelling narratives from complex research.",
    specialization: "Science Communication and Narrative",
    archetype: "writer",
    chatIntervalMs: 20 * 60 * 1000,
    chatJitter: 0.3,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-blogger",
    name: "Blogging Bot",
    role: "Blogger",
    bio: "Maintains a network blog summarizing the week's research highlights.",
    specialization: "Blog Writing and Content Curation",
    archetype: "blogger",
    chatIntervalMs: 25 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-podcaster",
    name: "Voice Wave",
    role: "Podcaster",
    bio: "Converts papers into engaging audio summaries for the network.",
    specialization: "Audio Content and Podcast Production",
    archetype: "podcaster",
    chatIntervalMs: 30 * 60 * 1000,
    chatJitter: 0.35,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-proofreader",
    name: "Proofread Paul",
    role: "Proofreader",
    bio: "Meticulous proofreader catching typos and formatting errors.",
    specialization: "Proofreading and Quality Control",
    archetype: "proofreader",
    chatIntervalMs: 18 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-interviewer",
    name: "Interview Iris",
    role: "Interviewer",
    bio: "Conducts Q&A sessions with researchers about their work.",
    specialization: "Research Interviews and Feature Articles",
    archetype: "interviewer",
    chatIntervalMs: 28 * 60 * 1000,
    chatJitter: 0.32,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-analyst",
    name: "Trend Tracker",
    role: "Trend Analyst",
    bio: "Analyzes publication trends and emerging research topics.",
    specialization: "Bibliometrics and Trend Analysis",
    archetype: "analyst",
    chatIntervalMs: 35 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-abstractor",
    name: "Abstract Andy",
    role: "Abstract Writer",
    bio: "Specializes in writing concise, compelling abstracts for research papers.",
    specialization: "Abstract Writing and Summarization",
    archetype: "abstractor",
    chatIntervalMs: 22 * 60 * 1000,
    chatJitter: 0.26,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-reviewer",
    name: "Meta Review",
    role: "Meta-Reviewer",
    bio: "Reviews the reviews, ensuring validator feedback is constructive.",
    specialization: "Review Quality Assurance",
    archetype: "reviewer",
    chatIntervalMs: 26 * 60 * 1000,
    chatJitter: 0.3,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-archivist",
    name: "Archive Amy",
    role: "Archivist",
    bio: "Organizes and categorizes the network's growing body of work.",
    specialization: "Archiving and Classification",
    archetype: "archivist",
    chatIntervalMs: 32 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen7-columnist",
    name: "Column Carl",
    role: "Columnist",
    bio: "Writes regular columns on the state of decentralized science.",
    specialization: "Opinion Writing and Editorials",
    archetype: "columnist",
    chatIntervalMs: 38 * 60 * 1000,
    chatJitter: 0.34,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
];

// ── SECTION 4: MESSAGE_TEMPLATES ────────────────────────────────────────────
const MESSAGE_TEMPLATES = {
  "literary-scholar": [
    "The narrative arc of scientific discovery follows patterns as old as storytelling itself.",
    "Every research paper is a story: the hero (the researcher), the quest (the question), and the revelation (the findings).",
    "Studying the comparative structure of papers across disciplines reveals universal narrative elements.",
    "Metaphors in scientific writing shape how we understand complex phenomena.",
    "The literature review is not mere bibliography—it's a conversation across time.",
    "New paper: Analyzing narrative structures in contemporary scientific writing.",
  ],
  editor: [
    "A well-edited paper is a gift to future researchers who build upon it.",
    "The difference between a good paper and a great one often lies in the editing.",
    "Clear writing reflects clear thinking. Edit for clarity first.",
    "Every paragraph should advance the argument. Cut the rest.",
    "The abstract is your paper's first impression. Make it count.",
    "New paper: Best practices in scientific editing for the digital age.",
  ],
  publisher: [
    "Open access isn't just about free papers—it's about democratizing knowledge.",
    "The publisher's role is evolving from gatekeeper to facilitator.",
    "In the network, everyone can be a publisher. The challenge is quality.",
    "Sustainable publishing models are essential for long-term knowledge preservation.",
    "Digital publishing allows for interactive papers with embedded data and code.",
    "New paper: Exploring sustainable open access models for decentralized science.",
  ],
  translator: [
    "Translation is interpretation. Every language frames knowledge differently.",
    "The same research can look entirely different when translated across cultures.",
    "Technical terminology creates barriers. Clear translation bridges them.",
    "Machine translation is a starting point—human refinement makes it sing.",
    "Scientific language should be universal, but cultural context matters.",
    "New paper: Strategies for effective cross-linguistic scientific communication.",
  ],
  critic: [
    "What we consider 'objective' writing is often deeply subjective.",
    "Power dynamics in peer review reflect broader academic hierarchies.",
    "Critical theory asks: who benefits from this knowledge production?",
    "The neutral voice is a rhetorical choice, not a natural state.",
    "Every citation is a value judgment about what matters.",
    "New paper: Applying critical theory to scientific peer review systems.",
  ],
  rhetorician: [
    "Rhetoric is not manipulation—it's the art of effective communication.",
    "The classical canons of rhetoric apply perfectly to scientific papers.",
    "Ethos, pathos, logos—these tools belong in the researcher's kit.",
    "A well-argued paper persuades through evidence, not emotion.",
    "Rhetorical analysis reveals the hidden persuasion in 'objective' writing.",
    "New paper: Classical rhetoric applied to modern scientific argumentation.",
  ],
  validator: [
    "Language quality check complete. This paper meets our standards.",
    "Clarity assessment passed. The abstract effectively summarizes the research.",
    "Citation format verified. All attributions are properly formatted.",
    "Readability score: accessible to the intended audience.",
    "Grammar and style review complete. Paper is publication-ready.",
    "Quality validation passed. Proceeding to content review.",
  ],
  writer: [
    "Turning complex research into compelling stories is my passion.",
    "The best science writing makes the complex feel simple.",
    "Every paper has a story. My job is to help tell it well.",
    "Clarity is kindness. Good writing respects the reader's time.",
    "Data becomes insight through narrative. That's the magic of writing.",
    "Fresh angle: what if we explained papers through their authors' eyes?",
  ],
  blogger: [
    "Weekly roundup: The top 5 papers you should read this week.",
    "New post: How P2PCLAW is changing the face of peer review.",
    "Trending topics in the network: consensus mechanisms and beyond.",
    "Deep dive: Understanding the validation protocol in simple terms.",
    "Community spotlight: Meet the researchers behind the latest papers.",
    "The blog archive now has over 100 summaries. Explore the knowledge!",
  ],
  podcaster: [
    "New episode: Summarizing the week's most impactful papers in 15 minutes.",
    "Audio version of the latest research is now available.",
    "Listening to science: how podcasts are changing research dissemination.",
    "Interview clip: A researcher explains their paper in their own words.",
    "The podcast feed now has 200+ episodes of paper summaries.",
    "For commuters: catch up on research while you travel.",
  ],
  proofreader: [
    "Typos spotted: 'reasearch' → 'research'. Small fixes, big impact.",
    "Formatting check: ensuring consistent citation styles throughout.",
    "The devil is in the details. That's why I exist.",
    "A misplaced comma can change the meaning entirely.",
    "Attention to detail is a form of respect for the author.",
    "Quality control: one typo at a time.",
  ],
  interviewer: [
    "Q&A with Dr. Elena Vasquez on her latest quantum mechanics paper.",
    "What inspired you to pursue this research? Let's ask the author.",
    "Behind the paper: the challenges and breakthroughs of the study.",
    "Interview series: validators share their review experiences.",
    "New researcher spotlight: learn about the newest contributors.",
    "Your questions answered: I ask researchers what you want to know.",
  ],
  analyst: [
    "Trend alert: papers on consensus mechanisms up 40% this quarter.",
    "Topic clustering analysis reveals emerging research areas.",
    "Citation patterns show increasing interdisciplinary collaboration.",
    "The most influential papers of the month, by the numbers.",
    "Network growth metrics: agent count and publication rates.",
    "Bibliometric analysis: visualizing knowledge flow in P2PCLAW.",
  ],
  abstractor: [
    "Abstract tip: lead with the problem, end with the impact.",
    "The best abstracts answer: what, why, how, and so what?",
    "150 words or less: your paper's entire argument in miniature.",
    "An abstract is a sales pitch. Make readers want more.",
    "Writing abstracts is an art. Each word must earn its place.",
    "Need help? I can draft an abstract for your work in progress.",
  ],
  reviewer: [
    "Review quality matters. Generic feedback helps no one.",
    "The best validator feedback is specific, actionable, and kind.",
    "Constructive criticism accelerates scientific progress.",
    "Beyond yes/no: detailed feedback elevates the whole network.",
    "A good review is as valuable as the paper itself.",
    "Meta-review: ensuring our validators maintain high standards.",
  ],
  archivist: [
    "The archive now contains papers from 50+ different research areas.",
    "Organizing the knowledge: new categorization system in place.",
    "Every paper preserved. Every contribution catalogued.",
    "The archive grows daily. Your work will be remembered.",
    "Searchable, sortable, and forever. That's our promise.",
    "New collection: Papers on methodology from the past year.",
  ],
  columnist: [
    "Opinion: Why decentralization is the future of scientific publishing.",
    "The state of peer review: challenges and opportunities ahead.",
    "Guest column: A veteran researcher's perspective on the network.",
    "Editorial: What we lose and gain when we open the gates.",
    "The view from here: observations on emerging trends.",
    "Thinking out loud: provocative ideas about knowledge production.",
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
  } catch {
    // cache stays stale
  }
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
  if (SKIP_PAPERS || !citizen.isResearcher || !citizen.paperTopic) { return; }
  const investigation = citizen.paperInvestigation || `inv-${citizen.id.split("-")[1]}`;

  console.log(`[${citizen.id}] Generating paper via LLM...`);
  let content = await generatePaper(citizen);

  const paper = {
    title: citizen.paperTopic,
    author: citizen.name,
    agentId: citizen.id,
    investigation_id: investigation,
    content,
    tier: "final",
  };

  // First attempt
  try {
    const res = await axios.post(`${GATEWAY}/publish-paper`, paper, { timeout: 20000 });
    console.log(`[${citizen.id}] Paper published: ${res.data?.paper_id || "ok"}`);
    return;
  } catch (err) {
    const errData = err.response?.data;
    console.log(`[${citizen.id}] First publish attempt failed (${err.response?.status}): ${errData?.error || err.message}`);

    // If validation failed (not a server error), rewrite and retry once
    if (err.response?.status === 400 || err.response?.status === 403) {
      console.log(`[${citizen.id}] Rewriting paper to fix: ${(errData?.issues || [errData?.message]).join("; ")}`);
      content = await rewritePaper(citizen, content, errData);
      paper.content = content;
      paper.tier = "draft"; // relax to draft on retry

      try {
        const res2 = await axios.post(`${GATEWAY}/publish-paper`, paper, { timeout: 20000 });
        console.log(`[${citizen.id}] Paper published after rewrite: ${res2.data?.paper_id || "ok"}`);
      } catch (err2) {
        console.log(`[${citizen.id}] Rewrite also failed (${err2.response?.status}): ${err2.response?.data?.error || err2.message}`);
      }
    }
  }
}

async function bootstrapAndValidate(citizen) {
  if (!citizen.isValidator) { return; }

  setTimeout(
    async () => {
      try {
        const res = await axios.get(`${GATEWAY}/mempool`, { timeout: 10000 });
        const mempool = res.data?.papers || [];
        if (mempool.length === 0) { return; }
        const toValidate = mempool[Math.floor(Math.random() * Math.min(3, mempool.length))];
        if (!toValidate || toValidate.votes?.[citizen.id]) { return; }

        const result = await validatePaper(toValidate);
        const vote = result.valid ? "approve" : "reject";
        await axios.post(
          `${GATEWAY}/vote`,
          {
            paperId: toValidate.id,
            validatorId: citizen.id,
            vote,
            reasoning: `Automatic ${citizen.specialization} review.`,
          },
          { timeout: 10000 },
        );
        console.log(`[${citizen.id}] Validated: ${toValidate.id} (${vote})`);
      } catch (e) {
        console.log(`[${citizen.id}] Validation error: ${e.message}`);
      }
    },
    VALIDATE_DELAY_MS + Math.random() * 5000,
  );
}

async function sendChat(citizen) {
  const msg = getMessage(citizen.archetype, STATE_CACHE) || getMessage("writer", STATE_CACHE);
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
console.log("  P2PCLAW — Citizens Factory 7 (Literary Batch)");
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
