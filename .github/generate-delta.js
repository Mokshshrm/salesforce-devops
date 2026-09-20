// Author: Moksh Sharma / DevOps Architecture
// Description: PR/push delta → SDR → manifest/package.xml + Apex test args.
// Deletions are intentionally excluded (--diff-filter=d): developers remove metadata from the org manually.

const { ComponentSet, MetadataResolver } = require('@salesforce/source-deploy-retrieve');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

function emit(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
  console.log(`[delta] ${name}=${value}`);
}

function gitLines(cmd) {
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();
  return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

const PACKAGE_DIR = requireEnv('PACKAGE_DIR');
const SF_API_VERSION = requireEnv('SF_API_VERSION').replace(/^v/i, '');
const BUILD_REASON = requireEnv('BUILD_REASON').toLowerCase();
const FORCE_FULL = process.env.FORCE_FULL === 'true';

if (!['pullrequest', 'push'].includes(BUILD_REASON)) {
  throw new Error(`BUILD_REASON must be "PullRequest" or "Push", got "${BUILD_REASON}"`);
}

const TARGET_BRANCH = BUILD_REASON === 'pullrequest'
  ? requireEnv('PR_TARGET_BRANCH').replace('refs/heads/', '')
  : null;

const BEFORE_SHA = BUILD_REASON === 'push' && !FORCE_FULL
  ? (process.env.BEFORE_SHA || '').trim()
  : null;

function resolveTestArgs() {
  if (!process.env.GITHUB_EVENT_PATH || !fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    return { level: 'RunLocalTests', args: '--test-level RunLocalTests' };
  }

  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const body = (event.pull_request && event.pull_request.body) || '';

  const match = body.match(/\|ApexTest:\[(.*?)\]/i);
  const tests = match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  return tests.length
    ? { level: 'RunSpecifiedTests', args: `--test-level RunSpecifiedTests --tests ${tests.join(' ')}` }
    : { level: 'RunLocalTests', args: '--test-level RunLocalTests' };
}

function getChangedFiles() {
  let range;
  if (BUILD_REASON === 'pullrequest') {
    const ref = `refs/remotes/origin/${TARGET_BRANCH}`;

    execSync(
      `git fetch --no-tags --prune origin "+refs/heads/${TARGET_BRANCH}:${ref}"`,
      { stdio: 'inherit' }
    );
    range = `${ref}...HEAD`;   // three-dot: diff against merge-base
  } else {
    if (!BEFORE_SHA || /^0+$/.test(BEFORE_SHA)) {  // new branch first commit // safe guard for 40 00000
      range = `HEAD~1..HEAD`;
    } else {
      range = `${BEFORE_SHA}..HEAD`;
    }
  }
  return gitLines(`git diff --name-only --diff-filter=d ${range} -- "${PACKAGE_DIR}"`);
}

function getAllFiles() {
  return gitLines(`git ls-files -- "${PACKAGE_DIR}"`);
}

function toComponentSet(files) {
  const resolver = new MetadataResolver();
  const components = [];
  const skipped = [];

  for (const f of files) {
    if (!fs.existsSync(f)) { skipped.push(`${f} (not on disk)`); continue; }
    try {
      components.push(...resolver.getComponentsFromPath(f));
    } catch {
      skipped.push(`${f} (not metadata)`);
    }
  }

  if (skipped.length) {
    console.log(`[delta] Skipped ${skipped.length} file(s):`);
    skipped.forEach(s => console.log(`  - ${s}`));
  }
  return new ComponentSet(components);
}

async function main() {
  const { level, args } = resolveTestArgs();
  emit('SF_TEST_LEVEL', level);
  emit('SF_TEST_ARGS', args);

  const files = FORCE_FULL ? getAllFiles() : getChangedFiles();
  console.log(`[delta] Source files: ${files.length}${FORCE_FULL ? ' (FORCE_FULL)' : ''}`);
  files.forEach(f => console.log(`  - ${f}`));

  if (files.length === 0) {
    console.log('[delta] No source files detected.');
    emit('SF_DEPLOY_MODE', 'none');
    emit('SF_HAS_CHANGES', 'false');
    return;
  }

  const componentSet = toComponentSet(files);

  if (componentSet.size === 0) {
    console.log('[delta] No metadata components resolved.');
    emit('SF_DEPLOY_MODE', 'none');
    emit('SF_HAS_CHANGES', 'false');
    return;
  }

  componentSet.apiVersion = SF_API_VERSION;

  const manifestDir = path.join(process.cwd(), 'manifest');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'package.xml');

  const xml = await componentSet.getPackageXml();
  fs.writeFileSync(manifestPath, xml);

  console.log('\n--- manifest/package.xml ---');
  console.log(xml);
  console.log('--- end ---\n');

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Manifest (package.xml)\n\`\`\`xml\n${xml}\n\`\`\`\n`
    );
  }

  emit('SF_DEPLOY_MODE', FORCE_FULL ? 'full' : 'delta');
  emit('SF_HAS_CHANGES', 'true');
}

main().catch(err => {
  console.error('[delta] Fatal:', err.message);
  process.exit(1);
});