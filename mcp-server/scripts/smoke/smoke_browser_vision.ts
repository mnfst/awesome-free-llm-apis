import { ScrapingSessionCheckpointManager } from '../../src/tools/browser-action.js';
import { visionTool } from '../../src/tools/vision-tool.js';

async function runBrowserVisionSmoke() {
  console.error('=== Browser & Vision Tools Smoke Test ===\n');

  // 1. Browser action checkpoint list
  console.error('1. Browser action checkpoints:');
  const checkpoints = await ScrapingSessionCheckpointManager.listCheckpoints(process.cwd());
  console.error(`   Found ${checkpoints.length} saved checkpoints.`);

  // 2. Vision Tool boundary assertion
  console.error('2. Vision tool boundary validation:');
  try {
    await visionTool({ image_path: 'file:///invalid_path_outside_project.png', workspace_root: process.cwd() });
    console.error('   Unexpected pass!');
  } catch (err: any) {
    console.error('   Correctly caught boundary validation:', err.message);
  }

  console.error('\nBrowser & Vision Smoke Test Complete!');
}

runBrowserVisionSmoke().catch(console.error);

