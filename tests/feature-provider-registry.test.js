const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');
const { listFeatureProviders, selectFeatureProvider, buildFeatureSupportSummary } = require('../src/core/feature/providers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function javaFixture() {
  return {
    'pom.xml': ['<project>', '  <modelVersion>4.0.0</modelVersion>', '  <groupId>com.example</groupId>', '  <artifactId>demo</artifactId>', '  <version>0.0.1-SNAPSHOT</version>', '  <dependencies>', '    <dependency>', '      <groupId>org.springframework.boot</groupId>', '      <artifactId>spring-boot-starter-web</artifactId>', '    </dependency>', '  </dependencies>', '</project>', ''].join('\n'),
    'src/main/resources/application.properties': 'server.port=8080\n',
  };
}

test('feature provider registry exposes the tier1 primary feature flows', () => {
  const providers = listFeatureProviders();
  assert.equal(providers.length, 3);
  assert.deepEqual(new Set(providers.map((provider) => provider.support_tier)), new Set(['tier1']));
  assert.deepEqual(new Set(providers.map((provider) => provider.runtime)), new Set(['node', 'python', 'go']));

  const nodeProvider = selectFeatureProvider({ runtime: 'node', framework: 'express', language: 'typescript' });
  assert.equal(nodeProvider.skill, 'generate-node-feature');

  const fastapiProvider = selectFeatureProvider({ runtime: 'python', framework: 'fastapi', language: 'python' });
  assert.equal(fastapiProvider.skill, 'generate-fastapi-feature');

  const unsupported = selectFeatureProvider({ runtime: 'java', framework: 'springboot', language: 'java' });
  assert.equal(unsupported, null);
});

test('generate-feature can list providers and unsupported runtimes fail with tier1 guidance', () => {
  const catalog = runNodeJson(GENERATE_FEATURE, ['--providers', '--json'], { cwd: ROOT });
  assert.equal(Array.isArray(catalog.providers), true);
  assert.equal(catalog.providers.length, 3);

  withTempDir((dir) => { writeFiles(dir, javaFixture()); }, (dir) => {
    const result = runNodeResult(GENERATE_FEATURE, ['payments', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /no tier1 provider/i);
    assert.match(result.stderr, /springboot/i);
  });
});

test('feature support summary reflects the detected profile and primary providers', () => {
  const summary = buildFeatureSupportSummary(ROOT, { runtime: 'python', framework: 'fastapi', language: 'python' });
  assert.equal(summary.selected_provider.skill, 'generate-fastapi-feature');
  assert.deepEqual(new Set(summary.supported_runtimes), new Set(['node', 'python', 'go']));
  assert.ok(summary.feature_skills.some((skill) => skill.name === 'generate-node-feature' && skill.support_tier === 'tier1'));
});
