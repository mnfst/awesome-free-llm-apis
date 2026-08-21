import { loadSkillPrompt } from '../../src/tools/load-skill-prompt.js';
import { executeSkill } from '../../src/tools/execute-skill.js';
import { listHermesSkills, findHermesSkill } from '../../src/hermes/loader.js';

async function main() {
  console.log('--- listHermesSkills() ---');
  console.log(await listHermesSkills());

  console.log('--- loadSkillPrompt({type: "list", source: "hermes"}) ---');
  console.log(await loadSkillPrompt({ type: 'list', source: 'hermes' } as any));

  console.log('--- findHermesSkill("humanizer") (expect null — manifest is empty until fetch-hermes runs) ---');
  console.log(await findHermesSkill('humanizer'));

  console.log('--- executeSkill({skill: "humanizer", source: "hermes"}) (expect explicit not-found error, not a crash) ---');
  console.log(await executeSkill({ skill: 'humanizer', input: 'test', source: 'hermes' } as any));

  console.log('--- executeSkill({skill: "some-random-unknown-skill"}) auto-detect path (expect fallback to agentic-awesome, not a Hermes crash) ---');
  console.log(await executeSkill({ skill: 'some-random-unknown-skill', input: 'test' } as any));
}

main().catch(err => { console.error('SMOKE TEST FAILED:', err); process.exit(1); });
