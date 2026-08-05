import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { HERMES_ROOT, generateManifest, extractFrontmatter } from '../src/hermes/manifest.js';
import { listHermesSkills, findHermesSkill, searchHermesSkills, loadHermesSkillContent } from '../src/hermes/loader.js';

const TEST_SKILL_DIR = path.join(HERMES_ROOT, 'software-development', 'test-skill-fixture');

describe('Hermes skill integration', () => {
    beforeAll(async () => {
        await fs.ensureDir(path.join(TEST_SKILL_DIR, 'references'));
        await fs.writeFile(path.join(TEST_SKILL_DIR, 'SKILL.md'), `---
name: Test Skill Fixture
description: A fixture skill used only by hermes.test.ts
tags: [testing, fixture]
---

# Test Skill Fixture

Do the test thing.`);
        await fs.writeFile(path.join(TEST_SKILL_DIR, 'references', 'notes.md'), '# Reference notes\nSome reference content.');
        await generateManifest();
    });

    afterAll(async () => {
        await fs.remove(TEST_SKILL_DIR);
        await generateManifest(); // regenerate so the fixture doesn't linger in manifest.json
    });

    it('extractFrontmatter() parses name/description/tags out of SKILL.md', () => {
        const { fields, body } = extractFrontmatter(`---
name: Foo
description: Bar baz
tags: [a, b, c]
---
# Body content`);
        expect(fields.name).toBe('Foo');
        expect(fields.description).toBe('Bar baz');
        expect(fields.tags).toEqual(['a', 'b', 'c']);
        expect(body.trim()).toBe('# Body content');
    });

    it('generateManifest() discovers the fixture skill and writes manifest.json', async () => {
        const manifest = await generateManifest();
        const entry = manifest.skills.find(s => s.id === 'test-skill-fixture');
        expect(entry).toBeDefined();
        expect(entry!.name).toBe('Test Skill Fixture');
        expect(entry!.tags).toEqual(['testing', 'fixture']);
        expect(entry!.path).toBe('software-development/test-skill-fixture');
    });

    it('listHermesSkills() returns the fixture via the cached manifest', async () => {
        const skills = await listHermesSkills();
        expect(skills.some(s => s.id === 'test-skill-fixture')).toBe(true);
    });

    it('findHermesSkill() matches by id or by name, case-insensitively', async () => {
        expect((await findHermesSkill('test-skill-fixture'))?.id).toBe('test-skill-fixture');
        expect((await findHermesSkill('Test Skill Fixture'))?.id).toBe('test-skill-fixture');
        expect((await findHermesSkill('TEST-SKILL-FIXTURE'))?.id).toBe('test-skill-fixture');
        expect(await findHermesSkill('does-not-exist')).toBeNull();
    });

    it('searchHermesSkills() ranks by keyword overlap in name/description/tags', async () => {
        const results = await searchHermesSkills(['fixture']);
        expect(results.some(s => s.id === 'test-skill-fixture')).toBe(true);
        expect(await searchHermesSkills([])).toEqual([]);
    });

    it('loadHermesSkillContent() reads SKILL.md and walks references/', async () => {
        const loaded = await loadHermesSkillContent('test-skill-fixture');
        expect(loaded).not.toBeNull();
        expect(loaded!.content).toContain('Do the test thing.');
        expect(loaded!.references).toHaveLength(1);
        expect(loaded!.references[0].path).toBe('references/notes.md');
        expect(loaded!.references[0].content).toContain('Some reference content.');
    });

    it('loadHermesSkillContent() returns null for a skill missing from the manifest', async () => {
        expect(await loadHermesSkillContent('totally-unknown-skill')).toBeNull();
    });
});
