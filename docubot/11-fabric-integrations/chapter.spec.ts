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
import { request, test } from '@playwright/test';
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

const open = (ctx: StepCtx): Promise<FortisoarSession> => ctx.open(fortisoar, 'soar');
/** The approval terminal is hosted in a FortiSOAR page (ttyd opens in a fresh context of it). */
const termPage = async (ctx: StepCtx) => (await open(ctx)).page;

/** The scan alert's source and target IPs, read from its name ("... from: <src> to: <dst> detected"). */
interface ScanAlert { id: string; name: string; source: string }

/** The newest scan alert on the box, read through the toolkit (not the card). */
function scanAlerts(): ScanAlert[] {
  const out = toolkit('search_records', { module: 'alerts', term: 'Internal port scanning', fields: ['uuid', 'name'], summary: false });
  const found: ScanAlert[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.name === 'string' && SCAN_ALERT.test(v.name)) {
        const m = /from:\s*(\d+\.\d+\.\d+\.\d+)/.exec(v.name);
        if (m) found.push({ id: String(v.uuid ?? ''), name: v.name, source: m[1] });
      } else Object.values(v).forEach(walk);
    }
  };
  walk(out);
  return found;
}

/** The scan's source IP, from the alert the scan produced (waits for ingestion when the caller polls). */
function scanSource(): string | undefined {
  return scanAlerts()[0]?.source;
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
const ipOf = (a: Record<string, any>): string[] => (Array.isArray(a.params?.ip) ? a.params.ip.map(String) : []);

/** Members this run blocked and has not yet seen removed: the afterAll undo removes them and reads the group back. */
const containment = new Set<string>();

/** The approval for the block: the scan's source only, on the group and policy the page names. */
const blockCall = (source: string): Allowed => ({
  tool: 'run_connector_operation', args: { connector: 'fortigatev2' }, required: true,
  check: (a) => {
    if (a.operation !== 'block_ip_new') return 'the call is not block_ip_new';
    if (a.config !== GATE_CONFIG) return 'the call does not name the Branch2 configuration';
    if (JSON.stringify(ipOf(a)) !== JSON.stringify([source])) return `the call blocks ${JSON.stringify(ipOf(a))}, not the scan source`;
    if (a.params?.ip_group_name !== GROUP || a.params?.ip_block_policy !== POLICY) return 'the call names the wrong group or policy';
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

/** The read of the containment group: one approved connector read (get_address_groups) in the approval session. Nothing else is approved. */
const groupRead = (ops: string[]): Allowed => ({
  tool: 'run_connector_operation', args: { connector: 'fortigatev2' }, required: false,
  check: (a) => (ops.includes(String(a.operation)) ? undefined : `the read may only be one of ${ops.join(', ')}`),
});

/** The read-back turn for the group steps: the approval session, one read, the picture of the answer. */
async function groupReadTurn(ctx: StepCtx, page: string, n: number, id: string, expect: RegExp, ops: string[]) {
  const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, page, n), [groupRead(ops)], {
    nudge: 'Yes, go ahead and read it.', timeoutMs: 4 * 60 * 1000,
  });
  await (ctx.capture as any).agent(id, held, { expect: [expect] });
  return plain;
}

/** A plain agent turn on the laptop (read-only asks). */
async function turn(ctx: StepCtx, page: string, n: number): Promise<string> {
  const agent = await laptopAgent(ctx.local);
  return agentTurn(agent, promptFor(CHAPTER, page, n), { timeoutMs: 10 * 60 * 1000 });
}

/** The scan-alert source for a later step: from the box, or the step fails (it needs step 01 first). */
function requireSource(): string {
  const src = scanSource();
  expect(src, 'a port-scan alert with a source is on the box: run ch11-01-fire-port-scan first').toBeTruthy();
  return src!;
}

export default chapter('11-fabric-integrations', {
  devices: ['soar', 'laptop'],
  policy: {
    ...fortisoarPolicy,
    maskText: [...(fortisoarPolicy.maskText ?? []), LAB_IP],
  },
  steps: {
    'ch11-01-fire-port-scan': async () => {
      if (!env.optional('DOCUBOT_REDTEAM_URL')) {
        skipStep('ch11-01-fire-port-scan', 'set DOCUBOT_REDTEAM_URL, DOCUBOT_REDTEAM_USER and DOCUBOT_REDTEAM_PASS (labconfig.local.yaml)');
        return;
      }
      const rc = await firePortScan();
      expect(rc, 'the scan run returned a result code').toBeDefined();
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
        ...(SCAN_ALERT.test(e.screen) ? [] : ['the agent did not name the port-scan alert']),
        ...(FELL_BACK_TO_HANDS.test(e.screen) ? ['the agent gave up and asked the student to do it by hand'] : []),
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
        ...(/policy/i.test(e.screen) ? [] : ['the agent did not report a policy for the scan']),
        ...(FELL_BACK_TO_HANDS.test(e.screen) ? ['the agent gave up and asked the student to do it by hand'] : []),
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
        ...(/verdict|indicator|evidence/i.test(e.screen) ? [] : ['the investigation gave no verdict or evidence']),
      ],
    },

    'ch11-03-block': {
      spend: 'subscription',
      run: async (ctx) => {
        const source = requireSource();
        const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, P03, 1), [blockCall(source)], {
          // The page's prompt asks for a yes in chat first: a short wait for the approval, then the student's yes as the nudge.
          nudge: 'Yes, go ahead and run it.', timeoutMs: 4 * 60 * 1000,
        });
        // Record the member the moment the block returns, before anything else can fail: the afterAll undo removes it.
        const member = groupMembers().find((m) => m !== SEED) ?? source;
        containment.add(member);
        await (ctx.capture as any).agent('ch11-03-block', held, { expect: [/newly_blocked|newly blocked/i] });
        return { source, member, plain };
      },
      verify: (e: { source: string; plain: string }) => [
        ...(/newly_blocked|newly blocked/i.test(e.plain) ? [] : ['the block did not report newly_blocked']),
      ],
    },

    'ch11-03-group-check': {
      spend: 'subscription',
      run: async (ctx) => {
        const screen = await groupReadTurn(ctx, P03, 2, 'ch11-03-group-check', new RegExp(SEED), ['get_address_groups', 'get_list_of_policies']);
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
      const rc = await firePortScan();
      expect(rc, 'the re-fired scan returned a result code').toBeDefined();
    },

    'ch11-03-denies': {
      spend: 'subscription',
      run: async (ctx) => {
        const screen = await turn(ctx, P03, 4);
        const cap = ctx.capture as any;
        await cap.screen('ch11-03-denies', screen, agentShot(/deny/i));
        return { screen };
      },
      verify: (e: { screen: string }) => [
        ...(/deny/i.test(e.screen) ? [] : ['the agent reported no deny rows']),
        ...(/still reaching[^.]*\byes\b/i.test(e.screen) ? ['the agent says the source still reaches the server after the block'] : []),
      ],
    },

    'ch11-04-undo': {
      spend: 'subscription',
      run: async (ctx) => {
        const source = requireSource();
        const { held, plain } = await approvedTurnOnce(await termPage(ctx), promptFor(CHAPTER, P04, 1), [unblockCall(source)], {
          // The page's prompt asks for a yes in chat first: a short wait for the approval, then the student's yes as the nudge.
          nudge: 'Yes, go ahead and run it.', timeoutMs: 4 * 60 * 1000,
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
        const screen = await groupReadTurn(ctx, P04, 2, 'ch11-04-group-seed', new RegExp(SEED), ['get_address_groups']);
        return { screen, members: groupMembers() };
      },
      verify: (e: { members: string[] }) => [
        ...(JSON.stringify(e.members) === JSON.stringify([SEED]) ? [] : [`the group is ${JSON.stringify(e.members)}, not the seed alone`]),
      ],
    },
  },
});

// Teardown: whatever this run blocked and did not see removed is undone, and the group is read back to prove it. The
// group's seed member is never touched. A failed undo fails the run with the member named.
test.afterAll(async () => {
  for (const member of [...containment]) {
    if (groupMembers().includes(member)) {
      toolkit('run_connector_operation', { connector: 'fortigatev2', operation: 'unblock_ip', config: GATE_CONFIG, params: {
        method: 'Policy Based', ip: [member], ip_group_name: GROUP, ip_block_policy: POLICY, ip_type: 'IPv4',
      } });
    }
    const left = groupMembers();
    if (left.includes(member)) throw new Error(`teardown: ${member} is still in ${GROUP} after the undo (members: ${JSON.stringify(left)})`);
    containment.delete(member);
  }
});
