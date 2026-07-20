/**
 * @file firebase-auth-smoke-test.ts
 * @description Exercises the Firebase anonymous-auth mechanism in firebase.ts (initFirebase's
 * sign-up -> refresh-token-exchange -> reconnect flow) across several separate, sequential
 * process instances, and confirms the resolved userId stays stable throughout — without ever
 * touching the real ~/.free-llm-mcp/usage-stats.json profile.
 *
 * How isolation works: PersistenceManager.resolvePath() honors MCP_USAGE_PATH if set, so this
 * script points that env var at a throwaway file under the OS temp dir before ever importing
 * firebase.js. Each "instance" is spawned as a brand-new `node`/`tsx` child process (not a
 * re-import in-process, since firebase.ts's module-level cachedIdToken/isOffline state would
 * otherwise persist across in-process calls and defeat the point of testing reconnect behavior).
 *
 * Usage: npx tsx scripts/verification/firebase-auth-smoke-test.ts
 * Child mode (internal, do not run directly): npx tsx scripts/verification/firebase-auth-smoke-test.ts --child
 */
import 'dotenv/config';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);

async function runChild(label: string) {
    // Runs inside the spawned child process, with MCP_USAGE_PATH already pointed at the
    // isolated test file via the parent's `env` option below.
    const { initFirebase, getUserStats, getLeaderboard } = await import('../../src/utils/firebase.js');
    const userId = await initFirebase();
    let statsOk = false;
    let leaderboardCount = -1;
    try {
        const stats = await getUserStats(userId);
        statsOk = stats !== null;
    } catch { /* leave statsOk false */ }
    try {
        const board = await getLeaderboard(userId);
        leaderboardCount = board.length;
    } catch { /* leave -1 */ }

    // Single-line JSON on stdout so the parent can parse it out from any stderr chatter.
    console.log(JSON.stringify({ label, userId, statsOk, leaderboardCount }));
}

interface InstanceResult {
    label: string;
    userId: string;
    statsOk: boolean;
    leaderboardCount: number;
}

function spawnInstance(label: string, testUsagePath: string, envOverrides: Record<string, string> = {}): InstanceResult {
    const tsxBin = path.join(path.dirname(__filename), '..', '..', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    const proc = spawnSync(
        tsxBin,
        [__filename, '--child', label],
        {
            env: { ...process.env, MCP_USAGE_PATH: testUsagePath, ...envOverrides },
            encoding: 'utf8',
            windowsHide: true,
            shell: process.platform === 'win32',
        }
    );
    const stdout = proc.stdout || '';
    const stderr = proc.stderr || '';
    if (stderr.trim()) {
        console.log(`    [stderr] ${stderr.trim().split('\n').join('\n    [stderr] ')}`);
    }
    const lastJsonLine = stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop();
    if (!lastJsonLine) {
        throw new Error(`No JSON result line from instance "${label}". stdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    return JSON.parse(lastJsonLine);
}

async function runParent() {
    const testDir = path.join(os.tmpdir(), 'llm-mcp-firebase-auth-test');
    await fs.ensureDir(testDir);
    const testUsagePath = path.join(testDir, `usage-stats-test-${Date.now()}.json`);

    console.log(`\n=== Firebase Auth Mechanism Smoke Test ===`);
    console.log(`Isolated test profile: ${testUsagePath}`);
    console.log(`(real profile at ~/.free-llm-mcp/usage-stats.json is never touched)\n`);

    const results: InstanceResult[] = [];

    // Instances 1-3: sequential, non-simultaneous "reconnects" with valid Firebase config.
    // Instance 1 has no saved refresh token yet -> exercises accounts:signUp (new anon user).
    // Instances 2-3 have a saved refresh token from the previous instance's persisted state
    // -> exercise exchangeRefreshToken() (the reconnect path), which must resolve to the SAME
    // Firebase userId every time.
    for (let i = 1; i <= 3; i++) {
        console.log(`[>] Spawning instance ${i} (reconnect ${i - 1 === 0 ? '(initial sign-up)' : `#${i - 1}`})...`);
        const result = spawnInstance(`instance-${i}`, testUsagePath);
        console.log(`    userId=${result.userId} statsOk=${result.statsOk} leaderboardCount=${result.leaderboardCount}`);
        results.push(result);
        await new Promise(r => setTimeout(r, 500)); // ensure strictly sequential, not overlapping
    }

    // Instance 4: same persisted profile, but this "instance" has no Firebase config at all
    // (simulates e.g. a misconfigured/offline environment). Verifies that userId still
    // resolves to the SAME id already on disk — state.userId is read back, not re-derived —
    // even though this run never talks to Firebase and flags isOffline internally.
    console.log(`[>] Spawning instance 4 (forced offline / missing config)...`);
    const offlineResult = spawnInstance('instance-4-offline', testUsagePath, {
        FIREBASE_API_KEY: '',
        FIREBASE_PROJECT_ID: '',
    });
    console.log(`    userId=${offlineResult.userId} statsOk=${offlineResult.statsOk} leaderboardCount=${offlineResult.leaderboardCount}`);
    results.push(offlineResult);

    // Instance 5: back to valid config, one more reconnect after the offline instance, to
    // confirm the identity survived the offline gap.
    console.log(`[>] Spawning instance 5 (reconnect after offline gap)...`);
    const finalResult = spawnInstance('instance-5', testUsagePath);
    console.log(`    userId=${finalResult.userId} statsOk=${finalResult.statsOk} leaderboardCount=${finalResult.leaderboardCount}`);
    results.push(finalResult);

    console.log(`\n=== Results ===`);
    const uniqueUserIds = new Set(results.map(r => r.userId));
    results.forEach(r => console.log(`  ${r.label}: userId=${r.userId}`));

    if (uniqueUserIds.size === 1) {
        console.log(`\n[PASS] All ${results.length} instances resolved to the same userId (${[...uniqueUserIds][0]}), including across a forced-offline instance.`);
    } else {
        console.log(`\n[FAIL] userId changed across instances! Unique ids seen: ${[...uniqueUserIds].join(', ')}`);
        process.exitCode = 1;
    }

    console.log(`\nCleaning up isolated test profile at ${testUsagePath}...`);
    await fs.remove(testUsagePath).catch(() => {});
    await fs.remove(`${testUsagePath}.bak`).catch(() => {});
    await fs.remove(`${testUsagePath}.lock`).catch(() => {});
    console.log(`=== Test Completed ===\n`);
}

if (process.argv.includes('--child')) {
    const labelArg = process.argv[process.argv.indexOf('--child') + 1] || 'child';
    runChild(labelArg).catch(err => {
        console.error('Child instance failed:', err);
        process.exit(1);
    });
} else {
    runParent().catch(err => {
        console.error('Fatal error during Firebase auth smoke test:', err);
        process.exit(1);
    });
}
