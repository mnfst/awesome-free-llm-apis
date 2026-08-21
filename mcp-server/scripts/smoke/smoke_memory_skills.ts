import { manageMemory } from '../../src/tools/manage-memory.js';
import { loadSkillPrompt } from '../../src/tools/load-skill-prompt.js';
import { indexWorkspace } from '../../src/tools/index-workspace.js';

async function runMemorySkillSmoke() {
  console.error('=== Memory & Skills Smoke Test ===\n');

  // 1. Memory write & read
  const testTitle = `smoke-note-${Date.now()}`;
  console.error(`1. Writing memory: ${testTitle}`);
  const writeRes = await manageMemory({
    action: 'wiki_write',
    title: testTitle,
    content: 'Spaced repetition and Ebbinghaus decay mechanism test content.'
  });
  console.error('   Write result:', writeRes.success ? 'OK' : writeRes.error);

  const readRes = await manageMemory({
    action: 'wiki_read',
    title: testTitle
  });
  console.error('   Read result:', readRes.page ? 'OK' : 'Not found');

  // 2. Load skill prompt list
  console.error('2. Listing workspace skills:');
  const skillsRes = await loadSkillPrompt({ type: 'list' });
  console.error(`   Found ${skillsRes.skills?.length || 0} skills.`);

  // 3. Index workspace
  console.error('3. Indexing workspace:');
  const indexRes = await indexWorkspace({ workspace_root: process.cwd(), force: false });
  console.error('   Index result:', indexRes.success ? 'OK' : indexRes.error);

  console.error('\nMemory & Skills Smoke Test Complete!');
}

runMemorySkillSmoke().catch(console.error);
