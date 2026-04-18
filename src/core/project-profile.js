const {
  CODE_EXT,
  TEST_RE,
  findRelatedTests,
  listCodeFiles,
  normalizeTarget,
  readJsonSafe,
  splitCsv,
  unique,
} = require('./project-profile/files.js');
const { getGitChangedFiles, hasGit } = require('./project-profile/git.js');
const { summarizeGenericFile, summarizeJsTsFile } = require('./project-profile/summarize.js');
const { detectProjectProfile } = require('./project-profile/detect.js');

module.exports = {
  CODE_EXT,
  TEST_RE,
  detectProjectProfile,
  findRelatedTests,
  getGitChangedFiles,
  hasGit,
  listCodeFiles,
  normalizeTarget,
  readJsonSafe,
  splitCsv,
  summarizeGenericFile,
  summarizeJsTsFile,
  unique,
};
