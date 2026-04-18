const fs = require('fs');
const path = require('path');

/** @param {string} rootDir @param {string} relPath */
function exists(rootDir, relPath) {
  return fs.existsSync(path.join(path.resolve(rootDir), relPath));
}

/** @param {unknown} values */
function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean)));
}

/** @param {string} [rootDir] */
function detectTooling(rootDir = process.cwd()) {
  const markers = [];
  const runtimes = [];
  const ciProviders = [];
  let packageManager = null;

  if (exists(rootDir, 'package.json')) {
    markers.push('package.json');
    runtimes.push('node');
  }
  if (exists(rootDir, 'pyproject.toml') || exists(rootDir, 'requirements.txt')) {
    markers.push(exists(rootDir, 'pyproject.toml') ? 'pyproject.toml' : 'requirements.txt');
    runtimes.push('python');
  }
  if (exists(rootDir, 'go.mod')) {
    markers.push('go.mod');
    runtimes.push('go');
  }
  if (exists(rootDir, 'pom.xml') || exists(rootDir, 'build.gradle')) {
    markers.push(exists(rootDir, 'pom.xml') ? 'pom.xml' : 'build.gradle');
    runtimes.push('java');
  }
  if (exists(rootDir, 'Dockerfile')) {
    markers.push('Dockerfile');
  }

  if (exists(rootDir, 'pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (exists(rootDir, 'yarn.lock')) packageManager = 'yarn';
  else if (exists(rootDir, 'package-lock.json') || exists(rootDir, 'npm-shrinkwrap.json') || exists(rootDir, 'package.json')) packageManager = 'npm';

  if (exists(rootDir, '.github/workflows')) ciProviders.push('github-actions');
  if (exists(rootDir, '.gitlab-ci.yml')) ciProviders.push('gitlab-ci');
  if (exists(rootDir, 'azure-pipelines.yml') || exists(rootDir, 'azure-pipelines.yaml')) ciProviders.push('azure-pipelines');
  if (exists(rootDir, '.circleci/config.yml') || exists(rootDir, 'circle.yml')) ciProviders.push('circleci');

  return {
    package_manager: packageManager,
    ci_providers: uniqueStrings(ciProviders),
    runtimes: uniqueStrings(runtimes),
    markers: uniqueStrings(markers),
  };
}

module.exports = {
  detectTooling,
};
