// Workshop-local helpers layered on docubot's device modules. Everything product-generic (the toolkit CLI, the
// lab seeder, the agent launcher, login, nav, capture, pty) comes from docubot; this file holds only what is
// specific to THIS workshop: the persona the shots show and the connector the ch09 lab builds.
import { createAgentLab } from 'docubot/agents';
import { boxMasks as boxMasksFor, pyfsrEnv, toolkitSkills, toolkitVenvMasks } from 'docubot/products/fortisoar';

/** The connector the ch09 build lab produces (one source of truth). */
export const DADJOKE = 'agentlab-dadjoke';

/** The login the captures show, as the page names it (`connected: agentlab`). The box's real login is masked. */
export const SHOWN_LOGIN = 'agentlab';
/** The box URL the captures show. */
export const SHOWN_BOX_URL = 'https://fortisoar.example.com';

/** Replace the box's real URL, host, login and display name with the page's placeholders. */
export const boxMasks = () => boxMasksFor({ login: SHOWN_LOGIN, name: 'Agent Lab', url: SHOWN_BOX_URL });

// The agent lab: this workshop's temp folder name, box masks, and how the toolkit's skills install.
// Terminal shots (docubot's shellShot) get the lab env, the toolkit venv as /your/venv, and the box masks.
const lab = createAgentLab({
  name: 'fsa-workshop',
  masks: boxMasks,
  skills: toolkitSkills,
  shot: () => ({ baseEnv: pyfsrEnv(), replaceFirst: toolkitVenvMasks(), masks: boxMasks() }),
});
export const { AGENT_CWD, CODEX_HOME, agentScreen, codexScreen, startAgent, agentTurn, startCodex, startCodexApproval, startClaudeApproval, codexShell, shellShot } = lab;
