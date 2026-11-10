// Shared pieces for the chapters whose agent writes to the box (08-playbook,
// 09-connectors, 10-capstone): the declared-call checks two chapters state for
// the same shapes, the screen regex for an agent that fell back to doing the
// work by hand, and the standard laptop agent session.
import { startAgent } from './agentlab';
import type { Allowed } from './approve';

/** The standard laptop agent session the workshop's TUI shots run in. */
export const laptopAgent = (local: Parameters<typeof startAgent>[0]) =>
  startAgent(local, 'laptop', { cols: 100, rows: 40 });

/**
 * A `publish_playbook` call must carry THIS playbook's YAML: the tool acts on the
 * box the server is configured for and takes no target argument, so the playbook
 * it names is only visible in the call's `yaml_text`.
 */
export const yamlNames = (playbook: string): NonNullable<Allowed['check']> =>
  (a) => (String(a.yaml_text ?? '').includes(playbook) ? undefined : `the YAML is not the "${playbook}" playbook`);

/** A `create_record` call must name the test alert with `prefix` — nothing else on the box gets written. */
export const alertNamed = (prefix: string): Allowed => ({
  tool: 'create_record', args: { module: 'alerts' },
  check: (a) => (String(a.data?.name ?? '').startsWith(prefix) ? undefined : `a test alert must be named starting with "${prefix}"`),
});

/** The screen text of an agent that gave up and tells the student to do the work by hand. */
export const FELL_BACK_TO_HANDS = /couldn't (?:finish|complete|publish|build)|could not (?:finish|complete|publish|build)|(?:do|finish|create|publish|run) (?:it|this|that|them) (?:by hand|manually)/i;
