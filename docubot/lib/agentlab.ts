// Workshop-local helpers layered on docubot's device modules. Everything product-generic (the toolkit CLI, the
// lab seeder, the agent launcher, login, nav, capture, pty) comes from docubot; this file holds only what is
// specific to THIS workshop: the persona the shots show, the connector the ch09 lab builds, pulling an agent
// prompt out of the page it is documented on, and the terminal shots.
import * as fs from 'fs';
import * as path from 'path';
import { boxMasks as boxMasksFor, createAgentLab, pyfsrEnv, toolkitSkills, toolkitVenvMasks } from 'docubot';

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
export const { AGENT_CWD, CODEX_HOME, agentScreen, codexScreen, startAgent, agentTurn, startCodex, codexShell, shellShot } = lab;

/**
 * The Nth "Give your agent this prompt" fenced block on a content page — the
 * SAME prompt the student is told to run, so the spec proves the documented
 * text, never a spec-only copy. `page` is a content page stem in this chapter,
 * e.g. '01-explore-and-run'. n is 1-based.
 */
export function promptFor(chapter: string, page: string, n = 1): string {
  const file = path.join(__dirname, '..', '..', 'content', chapter, `${page}.md`);
  const md = fs.readFileSync(file, 'utf8');
  const re = /Give your agent this prompt[^\n]*\n+```[a-z]*\n([\s\S]*?)```/gi;
  const found: string[] = [];
  for (let m = re.exec(md); m; m = re.exec(md)) found.push(m[1].trim());
  const prompt = found[n - 1];
  if (!prompt) throw new Error(`no prompt #${n} on content/${chapter}/${page}.md (found ${found.length})`);
  return prompt;
}

/** Raw Markdown of a content page (`content/<chapter>/<page>.md`). */
export function pageMd(chapter: string, page: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'content', chapter, `${page}.md`), 'utf8');
}

/** The first ```yaml fence on a content page: the YAML the page tells the agent to produce. */
export function pageYaml(chapter: string, page: string): string {
  const m = /```yaml\n([\s\S]*?)```/.exec(pageMd(chapter, page));
  if (!m) throw new Error(`no yaml fence on content/${chapter}/${page}.md`);
  return m[1];
}

/** YAML embedded in a prompt, from a literal start marker up to (not incl.) an end marker. */
export function promptYaml(chapter: string, page: string, startMarker: string, endMarker: string): string {
  const md = pageMd(chapter, page);
  const start = md.indexOf(startMarker);
  const end = md.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`prompt YAML markers not found on content/${chapter}/${page}.md`);
  return md.slice(start, end).trim() + '\n';
}
