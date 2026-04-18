const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveSkill } = require('../src/core/skills/manifest.js');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { buildVerifySuggestions } = require('../src/core/verification/suggestions.js');

const ROOT = path.resolve(__dirname, '..');

function withTempDir(setup, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-verify-'));
  try {
    setup(dir);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('node verify suggestions keep only node-relevant commands and prefer detected scripts', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'sample-node-app',
      scripts: {
        build: 'echo building',
        test: 'node --test',
      },
    }, null, 2));
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    const skill = resolveSkill(ROOT, 'add-unit-test');
    const verify = buildVerifySuggestions(skill.verify, profile, profile.runtime);
    assert.deepEqual(verify, ['npm run test', 'npm run build']);
  });
});

test('java verify suggestions collapse wrapper alternatives to the detected test command', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'build.gradle'), 'plugins { id "java" }\n');
    fs.writeFileSync(path.join(dir, 'gradlew'), '#!/bin/sh\nexit 0\n');
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    const skill = resolveSkill(ROOT, 'add-spring-controller');
    const verify = buildVerifySuggestions(skill.verify, profile, profile.runtime);
    assert.deepEqual(verify, ['./gradlew test', './gradlew compileJava']);
  });
});
