const fs = require('fs');
const path = require('path');

/** @typedef {import('../../../shared/domain.js').ProjectProfileResult} ProjectProfileResult */
/** @typedef {import('../../../shared/domain.js').ValidationCommand} ValidationCommand */

/** @param {string} root @param {string} rel */
function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

/** @param {string} filePath */
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** @param {string} blob @param {string} root */
function detectFramework(blob, root) {
  const text = String(blob || '').toLowerCase();
  if (text.includes('spring-boot') || exists(root, 'src/main/resources/application.properties') || exists(root, 'src/main/resources/application.yml')) return 'springboot';
  if (text.includes('quarkus')) return 'quarkus';
  if (text.includes('micronaut')) return 'micronaut';
  return 'java';
}

/** @param {string} root @returns {ProjectProfileResult | null} */
function detect(root) {
  const hasMaven = exists(root, 'pom.xml');
  const hasGradle = exists(root, 'build.gradle') || exists(root, 'build.gradle.kts');
  if (!hasMaven && !hasGradle) return null;

  const pom = readText(path.join(root, 'pom.xml'));
  const gradle = [readText(path.join(root, 'build.gradle')), readText(path.join(root, 'build.gradle.kts')), readText(path.join(root, 'settings.gradle')), readText(path.join(root, 'settings.gradle.kts'))].join('\n');
  const blob = [pom, gradle].join('\n');
  const framework = detectFramework(blob, root);
  const hasWrapper = exists(root, 'gradlew') || exists(root, 'mvnw');

  let buildCmd = 'mvn -q -DskipTests compile';
  let testCmd = 'mvn -q test';
  let packageManager = 'maven';
  let detectedBy = 'pom.xml';

  if (hasGradle) {
    const wrapper = exists(root, 'gradlew') ? './gradlew' : 'gradle';
    buildCmd = `${wrapper} compileJava`;
    testCmd = `${wrapper} test`;
    packageManager = 'gradle';
    detectedBy = exists(root, 'build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
  } else if (exists(root, 'mvnw')) {
    buildCmd = './mvnw -q -DskipTests compile';
    testCmd = './mvnw -q test';
  }

  /** @type {ValidationCommand[]} */
  const commands = [
    { kind: 'build', command: buildCmd, source: detectedBy },
    { kind: 'test', command: testCmd, source: detectedBy },
  ];
  const lowerBlob = blob.toLowerCase();
  const isWorkspace = /<modules>|include\(/i.test(blob);
  return {
    runtime: 'java',
    language: 'java',
    framework,
    package_manager: packageManager,
    package_name: path.basename(root),
    validation: commands,
    detected_by: detectedBy,
    build_tool: packageManager,
    test_runner: 'junit-or-gradle-test',
    lint_tool: lowerBlob.includes('checkstyle') ? 'checkstyle' : null,
    typecheck_tool: 'javac',
    format_tool: lowerBlob.includes('spotless') ? 'spotless' : null,
    app_type: framework === 'java' ? 'library-or-service' : 'backend-service',
    repo_shape: isWorkspace ? 'multi-module' : 'single-module',
    workspace: { is_workspace: isWorkspace, tool: /<modules>/i.test(blob) ? 'maven-modules' : (/include\(/i.test(blob) ? 'gradle-multi-project' : null) },
    entrypoints: ['src/main/resources/application.properties', 'src/main/resources/application.yml', 'src/main/java'].filter((rel) => exists(root, rel)),
    config_files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].filter((rel) => exists(root, rel)),
    signals: {
      has_wrapper: hasWrapper,
      has_test_dir: exists(root, 'src/test/java'),
    },
    confidence: 0.86,
  };
}

module.exports = {
  id: 'java',
  detect,
};
