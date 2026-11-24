// Chapter 11 - wide-fabric agentic labs: fire a red-team port scan, have the agent investigate the FortiSOAR alert with
// the FortiAnalyzer evidence behind it, contain the source on the Branch2 gate, re-fire the scan and check the denies,
// then undo the containment.
//
// Built with chapter(): one test, steps in declaration order. Sessions open on the first step that uses them.
//
// The red-team dashboard has no gui driver, so the scan is fired over its HTTP API (the same calls the health check
// makes) and gets no picture. Its login comes from DOCUBOT_REDTEAM_URL / DOCUBOT_REDTEAM_USER / DOCUBOT_REDTEAM_PASS
// (set per machine in the gitignored labconfig.local.yaml). Without DOCUBOT_REDTEAM_URL the fire steps skip.
//
// Spend gates: the agent turns on the laptop and the approval terminal are spend 'subscription'
// (DOCUBOT_SPEND_SUBSCRIPTION=1 or DOCUBOT_SPEND_AI=1). Each approval names the one call it lets through:
// the Branch2 block and unblock on the scratch source the scan came from, and nothing else.
//
// Scratch: the containment is a member of the SOAR-Blocklist address group on Branch2. It is tracked the moment the
// block returns, as 'branch2:blocklist-member' (the group in the ref's label), so teardown removes exactly that member
// and reads the group back. The group's seed member is never touched. The scan alert is the scenario's shared record
// and is not created or deleted by this chapter.
//
// Run one spec through Playwright (never `docubot run`):
//   DOCUBOT_TARGET=<repo> node_modules/.bin/playwright test --config=<kit>/playwright.config.ts 11-fabric-integrations
import { request, test, chromium } from '@playwright/test';
import { chapter, env, expect, pollUntil, promptFor, skipStep, type StepCtx } from 'docubot';
import { findAlert, fortisoar, fortisoarPolicy, openRecord, toolkit, type FortisoarSession } from 'docubot/products/fortisoar';
import { agentScreen, agentTurn } from '../lib/agentlab';
import { approvedTurnOnce, type Allowed } from '../lib/approve';
import { FELL_BACK_TO_HANDS, laptopAgent } from '../lib/fsr-lab';

const CHAPTER = '11-fabric-integrations';
const P01 = '01-fire-an-attack';
const P02 = '02-investigate-the-alert';
const P03 = '03-contain-and-retest';
const P04 = '04-undo-and-clean-up';
const BRANCH2 = 'branch2';       // the device key (labconfig)
const GATE_CONFIG = 'Branch2';   // the FortiGate connector configuration the calls name
const GROUP = 'SOAR-Blocklist';
const POLICY = 'SOAR-contain-deny';
const SEED = 'SOAR-blocklist-seed';
const SCAN_ALERT = /Internal (?:port scanning|intrusion)/i;
// Lab-internal addresses never reach a picture: the gate refuses them, so the policy masks them for every shot.
const LAB_IP = /\b(?:192\.168|10\.99|10\.254)\.\d{1,3}\.\d{1,3}\b/g;

/** Shell reads a fresh agent makes before it answers: listing its folder. Nothing that changes the machine. */
/** Screen text without terminal escapes: a cursor-forward gap becomes a space, colour codes go. */
const plainText = (screen: string): string => screen.replace(/\x1b\[\d*C/g, ' ').replace(/\x1b\[[\d;]*[A-Za-z]/g, '');

/** The text after the last row that echoes the prompt's words: the agent's answer, without the prompt itself. */
const answerAfter = (screen: string, promptWords: string): string => {
  const at = screen.lastIndexOf(promptWords);
  return at < 0 ? screen : screen.slice(at + promptWords.length);
};
/** 905 named in the same sentence as what it did to the scan (let it through, allowed, accepted, the path). */
const SCAN_PATH_ANSWER = /\b905\b[^.\n]{0,160}\b(let|allow|permit|accept|path|through|pass)|\b(let|allow|permit|accept|path|through|pass)\w*\b[^.\n]{0,160}\b905\b/i;
/** The agent declined to name the policy. */
const UNDECIDED = /\b(can(?:'|no)t|cannot|unable to|not possible to) (?:tell|determine|say|confirm)\b/i;
/** The client's own failure banner ("API Error: Can't reach the API server"): a turn that shows it never answered. */
const CLIENT_API_ERROR = /API Error:/;

const LOOK_AROUND = ['ls', 'ls -la', 'ls -l', 'ls -a', 'pwd'];

/**
 * The deny-log check's shell reads, from observe-mode trials (DOCUBOT_OBSERVE=1) and live runs: folder look-around
 * (`ls -la && grep -ril "faz-branch" .`, `find .claude -type f`, `ls -la ~/.claude`) and epoch-to-date conversion (`date -u -r <epoch>`, sometimes as a `for` loop).
 * Segment shapes, so any joining of these fits; nothing here writes or reaches the network.
 */
const DENY_CHECK_SHELL = [{ segments: [
  'ls(?: -[a-zA-Z]+)*(?: (?:~/\\.claude|[\\w.][\\w./-]*))?(?: 2>/dev/null)?(?: \\| head(?: -\\d+)?)?', 'pwd',
  'find \\.?\\.claude -type f(?: 2>/dev/null)?(?: \\| head(?: -\\d+)?)?',
  'date(?: -u)?(?: -r \\d+)?(?: \\+(?:"[^"`$;&|]*"|[%\\w:.-]+))?',
  'grep -[a-zA-Z]+ "[\\w .-]+" \\.(?: 2>/dev/null)?(?: \\| head(?: -\\d+)?)?',
  'for \\w+ in [\\d ]+', 'do date(?: -u)?(?: -r \\$\\w+)?(?: \\+(?:"(?:[^"`$;&|]|\\$\\w+)*"|[%\\w:.-]+))?', 'done',
] }];

const open = (ctx: StepCtx): Promise<FortisoarSession> => ctx.open(fortisoar, 'soar');
/** The approval terminal is hosted in a FortiSOAR page (ttyd opens in a fresh context of it). */
const termPage = async (ctx: StepCtx) => (await open(ctx)).page;

/** The scan alert's source and target IPs, read from its name ("... from: <src> to: <dst> detected"). */
interface ScanAlert { id: string; name: string; source: string }

/** The scan alerts on the box, newest first, read through the toolkit (not the card). */
function scanAlerts(): ScanAlert[] {
  const query = () => toolkit('query_records', {
    module: 'alerts',
    filters: [{ field: 'name', operator: 'like', value: '%port scanning%' }],
    fields: ['uuid', 'name', 'sourceIp'],
    sort: [{ field: 'createDate', direction: 'DESC' }],
    limit: 10,
  });
  // One retry: a single transient toolkit failure (seen once, 0.5 s into the block step) must not fail the step.
  let out: any;
  try { out = query(); } catch (err) { console.log(`[ch11] scan-alert query failed once, retrying: ${(err as Error).message}`); out = query(); }
  const found: ScanAlert[] = [];
  for (const v of (out?.members ?? []) as any[]) {
    if (typeof v.name !== 'string' || !SCAN_ALERT.test(v.name)) continue;
    const source = (typeof v.sourceIp === 'string' && v.sourceIp) || /from:\s*(\d+\.\d+\.\d+\.\d+)/.exec(v.name)?.[1];
    if (source) found.push({ id: String(v.uuid ?? ''), name: v.name, source });
  }
  return found;
}

/** The scan's source IP, from the alert the scan produced (waits for ingestion when the caller polls). */
function scanSource(): string | undefined {
  return scanAlerts()[0]?.source;
}

/**
 * The student's own path through the red-team dashboard: sign in, show the tabs and the Port scan row, click Fire, show it
 * running and show it finished. One scan fires, here, through the page (not the API). Returns the run's result code.
 */
async function fireFromDashboard(ctx: StepCtx): Promise<number> {
  const url = env.optional('DOCUBOT_REDTEAM_URL');
  const user = env.value('DOCUBOT_REDTEAM_USER', 'admin');
  const pass = env.value('DOCUBOT_REDTEAM_PASS', '');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(url!, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name=username]').fill(user);
    await page.locator('input[type=password]').fill(pass);
    await page.locator('button[type=submit], input[type=submit]').first().click();
    const label = page.getByText('Port scan', { exact: true }).filter({ visible: true }).first();   // the name also appears in hidden tabs
    await label.waitFor({ timeout: 30_000 });
    const row = label.locator('xpath=ancestor::*[.//button[normalize-space()="Fire"]][1]');
    await ctx.shot(page, 'ch11-01-dashboard-tabs', { expect: [/Red team/, /Port scan/] });
    // The scan can finish before a picture of the running state is taken: hold the fire request in the browser until that
    // picture is done, then let it through. The page behaves as it does for a student; it just stays in Running a few seconds longer.
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    await page.route('**/run/port_scan', async (route) => { await hold; await route.continue(); });
    await row.getByRole('button', { name: 'Fire' }).click();
    await row.getByText(/Running/i).first().waitFor({ timeout: 20_000 });
    await ctx.shot(page, 'ch11-01-dashboard-running', { expect: [/Running/] });
    release();
    await row.getByText(/Running/i).first().waitFor({ state: 'detached', timeout: 4 * 60_000 });
    await ctx.shot(page, 'ch11-01-dashboard-finished', { expect: [/Port scan/, /rc=/] });
    const rc = Number(/rc=(\d+)/.exec(await row.innerText())?.[1]);
    return rc;
  } finally {
    await browser.close();
  }
}

/** Fire the port scan through the dashboard's HTTP API (what its Fire button calls). Returns the run's rc. */
async function firePortScan(): Promise<number | undefined> {
  const url = env.optional('DOCUBOT_REDTEAM_URL');
  const user = env.value('DOCUBOT_REDTEAM_USER', 'admin');
  const pass = env.value('DOCUBOT_REDTEAM_PASS', '');
  const ctx = await request.newContext({ ignoreHTTPSErrors: true, baseURL: url });
  try {
    const login = await ctx.post('/login', { form: { username: user, password: pass }, maxRedirects: 0 });
    expect(login.status(), 'the red-team dashboard login').toBeLessThan(400);
    const run = await ctx.post('/run/port_scan', { timeout: 150_000 });
    expect(run.ok(), `the port_scan fire returned HTTP ${run.status()}`).toBeTruthy();
    return (await run.json().catch(() => ({} as { rc?: number }))).rc;
  } finally {
    await ctx.dispose();
  }
}

/** The members of the containment group, read through the toolkit's connector operation. */
function groupMembers(): string[] {
  const out = toolkit('run_connector_operation', { connector: 'fortigatev2', operation: 'get_address_groups', config: GATE_CONFIG, params: {} });
  const names: string[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (v.name === GROUP && Array.isArray(v.member)) names.push(...v.member.map((m: any) => String(m.name)));
      else Object.values(v).forEach(walk);
    }
  };
  walk(out);
  return names;
}

/** The IP of the scan source, from the arguments of a block or unblock call. */
const ipOf = (a: Record<string, any>): string[] => {
  const v = a.params?.ip;   // a list, or one string (or a comma-separated one): the agent uses either
  return Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

/** Members this run blocked and has not yet seen removed: the afterAll undo removes them and reads the group back. */
const containment = new Set<string>();

/** The approval for the block: the scan's source only, on the group and policy the page names. */
const blockCall = (source: string): Allowed => ({
  tool: 'run_connector_operation', args: { connector: 'fortigatev2' }, required: true,
  check: (a) => {
    // The page names the goal (the group and its deny policy), not the operation: any block_ip* operation that blocks the source.
    if (a.config !== GATE_CONFIG) return 'the call does not name the Branch2 configuration';
    // The other way to the same goal: add the source's address object to the group (add_member, the connector's own parameter;
    // a guessed name is ignored by the connector and changes nothing). The gate read-back after the turn proves the member landed.
    if (a.operation === 'update_address_group') {
      if (a.params?.group_name !== GROUP) return 'the call edits a group other than the containment group';
      if (!a.params?.add_member) return 'the group edit adds no member (the connector ignores unknown parameter names)';
      if (a.params?.remove_member) return 'the group edit removes members';
      return undefined;
    }
    if (!/^block_ip/.test(String(a.operation))) return `${a.operation} is not a block operation`;
    if (JSON.stringify(ipOf(a)) !== JSON.stringify([source])) return `the call blocks ${JSON.stringify(ipOf(a))}, not the scan source`;
    if (a.params?.ip_group_name !== undefined && a.params.ip_group_name !== GROUP) return 'the call names the wrong group';
    if (a.params?.ip_block_policy !== undefined && a.params.ip_block_policy !== POLICY) return 'the call names the wrong policy';
    return undefined;
  },
});

/** The approval for the undo: the same source, the same group, unblock only. */
const unblockCall = (source: string): Allowed => ({
  tool: 'run_connector_operation', args: { connector: 'fortigatev2' }, required: true,
  check: (a) => {
    if (a.operation !== 'unblock_ip') return 'the call is not unblock_ip';
    if (a.config !== GATE_CONFIG) return 'the call does not name the Branch2 configuration';
    if (JSON.stringify(ipOf(a)) !== JSON.stringify([source])) return `the call unblocks ${JSON.stringify(ipOf(a))}, not the scan source`;
    if (a.params?.ip_group_name !== GROUP) return 'the call names the wrong group';
    return undefined;
  },
});

/** A terminal picture's options: the picture must show the expected text (the OCR gate takes an array). */
const agentShot = (expect: RegExp) => ({ ...agentScreen(), expect: [expect] });

/** Before it blocks, the agent reads the gate: its address groups, addresses and policies, through either FortiGate connector. Any get_/list_ read fits; a write never does. */
const gateReadsOn = (connector: string): Allowed => ({
  tool: 'run_connector_operation', args: { connector }, required: false,
  check: (a) => (/^(get|list)_/.test(String(a.operation)) ? undefined : `${a.operation} is not a read of the gate`),
});
const gateReads = gateReadsOn('fortigatev2');
const gateReadsLegacy = gateReadsOn('fortigate-firewall');

/** The deny-log check: FortiAnalyzer reads on the faz-branch configuration only. Anything that could change state is declined. */
const fazRead: Allowed = {
  tool: 'run_connector_operation', args: { connector: 'fortinet-fortianalyzer' }, required: false,
  check: (a) => {
    if (a.config !== 'faz-branch') return 'the read does not name the faz-branch configuration';
    if (/create|update|delete|add|remove|block|run|execute|set/i.test(String(a.operation))) return `${a.operation} is not a read`;
    return undefined;
  },
};

/** The read-back turn for the group steps: the approval session, one read, the picture of the answer. */
async function groupReadTurn(ctx: StepCtx, page: string, n: number, id: string, expect: RegExp) {
  const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, page, n), [gateReads, gateReadsLegacy], {
    nudge: 'Yes, go ahead and read it.', timeoutMs: 4 * 60 * 1000,
    // A fresh agent often lists its folder first; that read is harmless. Every other shell command stays denied.
    bash: LOOK_AROUND, rows: 160,
  });
  await (ctx.capture as any).agent(id, held, { expect: [expect] });
  return plain;
}

/**
 * A plain agent turn on the laptop (read-only asks). The returned screen starts at this turn's own prompt row, so the picture
 * does not carry the client's banner, the /mcp dismissal or an earlier turn of the same session.
 */
async function turn(ctx: StepCtx, page: string, n: number): Promise<string> {
  const agent = await laptopAgent(ctx.local);
  const prompt = promptFor(CHAPTER, page, n);
  return fromPrompt(await agentTurn(agent, prompt, { timeoutMs: 10 * 60 * 1000 }), prompt);
}

/** The screen's rows from the last one that echoes the prompt's first words (whole rows, so colour codes stay intact). */
function fromPrompt(screen: string, prompt: string): string {
  const first = prompt.split('\n')[0].trim().slice(0, 24);
  const rows = screen.split('\n');
  for (let i = rows.length - 1; i >= 0; i--) if (/^\s*[>❯]\s/.test(plainText(rows[i])) && plainText(rows[i]).includes(first)) return rows.slice(i).join('\n');
  return screen;
}

/** The scan-alert source for a later step: from the box, or the step fails (it needs step 01 first). */
function requireSource(): string {
  const src = scanSource();
  expect(src, 'a port-scan alert with a source is on the box: run ch11-01-fire-port-scan first').toBeTruthy();
  return src!;
}

/**
 * Arrange: put the block in place when it is not, so a step that depends on it runs alone (ONLY=<id>) or after an earlier
 * run's teardown undid it. Tracked before the call, so the afterAll undo removes it whatever happens next.
 */
function arrangeBlock(source: string): void {
  containment.add(source);
  if (membersFor(groupMembers(), source).length) return;
  toolkit('run_connector_operation', { connector: 'fortigatev2', operation: 'block_ip_new', config: GATE_CONFIG, params: {
    method: 'Policy Based', ip: [source], ip_group_name: GROUP, ip_block_policy: POLICY, ip_type: 'IPv4', is_new: true,
  } });
}

export default chapter('11-fabric-integrations', {
  devices: ['soar', 'laptop'],
  // An agent turn is given 10 minutes (turn()); a step's budget must outlast it, or a slow but healthy turn is cut off.
  stepTimeoutMs: 12 * 60 * 1000,
  policy: {
    ...fortisoarPolicy,
    maskText: [...(fortisoarPolicy.maskText ?? []), LAB_IP],
  },
  steps: {
    'ch11-01-fire-port-scan': async (ctx) => {
      if (!env.optional('DOCUBOT_REDTEAM_URL')) {
        skipStep('ch11-01-fire-port-scan', 'set DOCUBOT_REDTEAM_URL, DOCUBOT_REDTEAM_USER and DOCUBOT_REDTEAM_PASS (labconfig.local.yaml)');
        return;
      }
      const rc = await fireFromDashboard(ctx);
      expect(rc, 'the dashboard shows the scan run finished with rc=0').toBe(0);
      // Ingestion runs on a five-minute schedule: poll the alert itself, not a banner.
      await pollUntil('the port-scan alert is ingested', async () => scanAlerts().length > 0, { timeoutMs: 8 * 60_000, intervalMs: 15_000 });
    },

    'ch11-01-alert-in-fortisoar': async (ctx) => {
      const soar = await open(ctx);
      const alert = await findAlert(soar.page, SCAN_ALERT, { search: 'Internal' });
      expect(alert, 'the port-scan alert is in the FortiSOAR alerts list').toBeTruthy();
      await openRecord(soar.page, 'alerts', alert!.id, { tab: 'Alert Details' });
      await soar.shot('ch11-01-alert-in-fortisoar', { expect: SCAN_ALERT });
      await soar.reloadAppRoot();
    },

    'ch11-02-find-alert': {
      spend: 'subscription',
      run: async (ctx) => {
        const screen = await turn(ctx, P02, 1);
        const cap = ctx.capture as any;
        await cap.screen('ch11-02-find-alert', screen, agentShot(SCAN_ALERT));
        return { screen };
      },
      verify: (e: { screen: string }) => [
        ...(CLIENT_API_ERROR.test(plainText(e.screen)) ? ['the client hit an API error mid-turn (re-take)'] : []),
        ...(SCAN_ALERT.test(plainText(e.screen)) ? [] : ['the agent did not name the port-scan alert']),
        ...(FELL_BACK_TO_HANDS.test(plainText(e.screen)) ? ['the agent gave up and asked the student to do it by hand'] : []),
      ],
    },

    'ch11-02-faz-evidence': {
      spend: 'subscription',
      run: async (ctx) => {
        const screen = await turn(ctx, P02, 2);
        const cap = ctx.capture as any;
        await cap.screen('ch11-02-faz-evidence', screen, agentShot(/policy/i));
        return { screen };
      },
      verify: (e: { screen: string }) => [
        ...(CLIENT_API_ERROR.test(plainText(e.screen)) ? ['the client hit an API error mid-turn (re-take)'] : []),
        // 905 is the scan's own path (accept + IPS); the prompt never says it, so it must come from the logs the agent read.
        // The answer (the text after the prompt) must name 905 as the policy that let the scan in, not just list it in a table.
        ...(SCAN_PATH_ANSWER.test(answerAfter(plainText(e.screen), 'let the scan through')) ? [] : ['the answer does not name policy 905 as the policy that let the scan through']),
        ...(UNDECIDED.test(answerAfter(plainText(e.screen), 'let the scan through')) ? ['the agent said it could not tell which policy let the scan through'] : []),
        ...(FELL_BACK_TO_HANDS.test(plainText(e.screen)) ? ['the agent gave up and asked the student to do it by hand'] : []),
      ],
    },

    'ch11-02-investigate': {
      spend: 'subscription',
      run: async (ctx) => {
        const screen = await turn(ctx, P02, 3);
        const cap = ctx.capture as any;
        await cap.screen('ch11-02-investigate', screen, agentShot(/verdict|indicator|evidence/i));
        return { screen };
      },
      verify: (e: { screen: string }) => [
        ...(CLIENT_API_ERROR.test(plainText(e.screen)) ? ['the client hit an API error mid-turn (re-take)'] : []),
        ...(/verdict|indicator|evidence/i.test(plainText(e.screen)) ? [] : ['the investigation gave no verdict or evidence']),
      ],
    },

    'ch11-03-block': {
      spend: 'subscription',
      run: async (ctx) => {
        if (process.env.DOCUBOT_OBSERVE === '1') console.log('[docubot observe] block: reading the scan source');
        const source = requireSource();
        containment.add(source);   // tracked BEFORE the call: a block that lands while the turn then fails is still undone
        const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, P03, 1), [blockCall(source), gateReads, gateReadsLegacy], {
          // The page's prompt asks for a yes in chat first: a short wait for the approval, then the student's yes as the nudge.
          nudge: 'Yes, go ahead and run it.', timeoutMs: 4 * 60 * 1000, bash: LOOK_AROUND, rows: 160,
        });
        // Track the source the moment the block is through, before anything else can fail: the afterAll undo removes every
        // group member that carries this IP, whatever name the gate gave the address object.
        containment.add(source);
        const member = groupMembers().find((m) => m !== SEED && m.includes(source)) ?? source;
        await (ctx.capture as any).agent('ch11-03-block', held, { expect: [new RegExp(GROUP)] });
        return { source, member, plain, inGroup: membersFor(groupMembers(), source).length > 0 };
      },
      // The effect, read from the gate: the source is a group member. The agent's wording is not the proof.
      verify: (e: { source: string; plain: string; inGroup: boolean }) => [
        ...(e.inGroup ? [] : ['the source is not in the containment group after the block']),
        ...(CLIENT_API_ERROR.test(e.plain) ? ['the client hit an API error mid-turn (re-take)'] : []),
      ],
    },

    'ch11-03-group-check': {
      spend: 'subscription',
      run: async (ctx) => {
        arrangeBlock(requireSource());   // the read must find the source in the group
        const screen = await groupReadTurn(ctx, P03, 2, 'ch11-03-group-check', new RegExp(SEED));
        return { screen, members: groupMembers() };
      },
      verify: (e: { screen: string; members: string[] }) => [
        ...(e.members.includes(SEED) ? [] : ['the seed member is missing from the group']),
        ...(e.members.length >= 2 ? [] : ['the blocked source is not in the group']),
      ],
    },

    'ch11-03-refire': async () => {
      if (!env.optional('DOCUBOT_REDTEAM_URL')) {
        skipStep('ch11-03-refire', 'set DOCUBOT_REDTEAM_URL (labconfig.local.yaml)');
        return;
      }
      arrangeBlock(requireSource());   // the re-fired scan is meant to meet the deny policy
      const rc = await firePortScan();
      expect(rc, 'the re-fired scan returned a result code').toBeDefined();
    },

    'ch11-03-denies': {
      spend: 'subscription',
      run: async (ctx) => {
        // Arrange: the check needs the block in place, so ONLY=ch11-03-denies runs alone. Tracked before the call.
        const source = requireSource();
        arrangeBlock(source);
        // Governed, not a plain turn: a large FortiAnalyzer result is saved to a file the agent then Reads, and only the
        // approval session answers that prompt (a plain turn stalls on it). Trials ran 30 calls and 3-4 minutes.
        const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, P03, 3), [fazRead], {
          timeoutMs: 8 * 60 * 1000, bash: DENY_CHECK_SHELL, rows: 160,   // the answer runs ~96 rows
        });
        await (ctx.capture as any).agent('ch11-03-denies', held, { expect: [/deny/i] });
        return { screen: plain };
      },
      verify: (e: { screen: string }) => [
        ...(CLIENT_API_ERROR.test(plainText(e.screen)) ? ['the client hit an API error mid-turn (re-take)'] : []),
        ...(/deny/i.test(plainText(e.screen)) ? [] : ['the agent reported no deny rows']),
        ...(/still reaching[^.]*\byes\b/i.test(plainText(e.screen)) ? ['the agent says the source still reaches the server after the block'] : []),
      ],
    },

    'ch11-04-undo': {
      spend: 'subscription',
      run: async (ctx) => {
        const source = requireSource();
        arrangeBlock(source);   // the undo needs something to undo
        const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, P04, 1), [unblockCall(source)], {
          // The page's prompt asks for a yes in chat first: a short wait for the approval, then the student's yes as the nudge.
          nudge: 'Yes, go ahead and run it.', timeoutMs: 4 * 60 * 1000, bash: LOOK_AROUND, rows: 160,
        });
        await (ctx.capture as any).agent('ch11-04-undo', held, { expect: [/newly_unblocked|newly unblocked/i] });
        return { plain };
      },
      verify: (e: { plain: string }) => [
        ...(/newly_unblocked|newly unblocked/i.test(e.plain) ? [] : ['the undo did not report newly_unblocked']),
      ],
    },

    'ch11-04-group-seed': {
      spend: 'subscription',
      run: async (ctx) => {
        const screen = await groupReadTurn(ctx, P04, 2, 'ch11-04-group-seed', new RegExp(SEED));
        return { screen, members: groupMembers() };
      },
      verify: (e: { members: string[] }) => [
        ...(JSON.stringify(e.members) === JSON.stringify([SEED]) ? [] : [`the group is ${JSON.stringify(e.members)}, not the seed alone`]),
      ],
    },
  },
});

// Teardown: every group member that carries an IP this run blocked is removed (by IP, the way the page's undo does), and
// the group is read back to prove it. The seed member is never touched. Every action is logged; a failed undo fails the
// run with the member named. Matching on the IP, not on an exact member name, is the point: the gate names the address
// object itself, so an exact-name match can miss it and pass silently.
function membersFor(members: string[], ip: string): string[] {
  return members.filter((m) => m !== SEED && (m === ip || m.includes(ip)));
}

test.afterAll(async () => {
  // A resumed run re-uses a block made by an earlier process, so the in-memory set can be empty while the block stands:
  // the newest scan alert's source is always undone too (a no-op when it is not in the group).
  const latest = scanSource();
  if (latest) containment.add(latest);
  for (const ip of [...containment]) {
    const before = membersFor(groupMembers(), ip);
    console.log(`[ch11 teardown] ${GROUP} members for ${ip}: ${JSON.stringify(before)}`);
    if (before.length) {
      toolkit('run_connector_operation', { connector: 'fortigatev2', operation: 'unblock_ip', config: GATE_CONFIG, params: {
        method: 'Policy Based', ip: [ip], ip_group_name: GROUP, ip_block_policy: POLICY, ip_type: 'IPv4',
      } });
    }
    const all = groupMembers();
    const left = membersFor(all, ip);
    console.log(`[ch11 teardown] after the undo: ${JSON.stringify(all)}`);
    if (left.length) throw new Error(`teardown: ${JSON.stringify(left)} still in ${GROUP} after the undo of ${ip}`);
    if (!all.includes(SEED)) throw new Error(`teardown: the seed member ${SEED} is missing from ${GROUP}`);
    containment.delete(ip);
  }
});
