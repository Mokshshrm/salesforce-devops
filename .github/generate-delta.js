// Author: Moksh Sharma / DevOps Architecture
// Description: Resolves PR changed files and uses @salesforce/source-deploy-retrieve to generate manifest/package.xml and dynamic Apex test parameters.

const { ComponentSet } = require('@salesforce/source-deploy-retrieve');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageDir = process.env.PACKAGE_DIR || 'force-app';
const buildReason = process.env.BUILD_REASON || 'Manual';
const targetBranch = (process.env.PR_TARGET_BRANCH || 'main').replace('refs/heads/', '');
let forceFull = process.env.FORCE_FULL === 'true';

function emit(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
  console.log(`[delta] ${name}=${value}`);
}

let prBody = process.env.PR_BODY || '';
if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    prBody = (event.pull_request && event.pull_request.body) || prBody;
  } catch (e) {
    console.error('[delta] Failed to parse GITHUB_EVENT_PATH:', e.message);
  }
}

let searchString = prBody;
try {
  const commitMsg = execSync('git log -1 --pretty=%B', { encoding: 'utf8' });
  searchString += '\n' + commitMsg;
  if (/NO[_-]?DELTA/i.test(commitMsg)) {
    forceFull = true;
  }
} catch (e) {
  console.error('[delta] Failed to read commit message:', e.message);
}

let testLevel = 'RunLocalTests';
let testArgs = '--test-level RunLocalTests';

const apexTestMatch = searchString.match(/\|ApexTest:\[(.*?)\]/i);
if (apexTestMatch && apexTestMatch[1].trim()) {
  const tests = apexTestMatch[1]
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  if (tests.length > 0) {
    testLevel = 'RunSpecifiedTests';
    testArgs = `--test-level RunSpecifiedTests --tests ${tests.join(' ')}`;
  }
}

let diffCmd;
if (buildReason === 'PullRequest') {
  const targetRef = `refs/remotes/origin/${targetBranch}`;
  try {
    execSync(`git fetch --no-tags --prune origin "+refs/heads/${targetBranch}:${targetRef}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`[delta] Failed to fetch origin/${targetBranch}:`, e.message);
  }
  diffCmd = `git diff --name-only --diff-filter=d "${targetRef}...HEAD" -- "${packageDir}"`;
} else {
  const beforeSha = process.env.BEFORE_SHA;
  if (beforeSha && !/^0+$/.test(beforeSha)) {
    diffCmd = `git diff --name-only --diff-filter=d "${beforeSha}..HEAD" -- "${packageDir}"`;
  } else {
    diffCmd = `git diff --name-only --diff-filter=d HEAD~1 HEAD -- "${packageDir}"`;
  }
}

let changedFiles = [];
try {
  const output = execSync(diffCmd, { encoding: 'utf8' }).trim();
  if (output) {
    changedFiles = output.split('\n').map(f => f.trim()).filter(Boolean);
  }
} catch (e) {
  console.error('[delta] Git diff failed:', e.message);
  if (diffCmd.includes('..HEAD')) {
    try {
      const fallbackOutput = execSync(`git diff --name-only --diff-filter=d HEAD~1 HEAD -- "${packageDir}"`, { encoding: 'utf8' }).trim();
      if (fallbackOutput) {
        changedFiles = fallbackOutput.split('\n').map(f => f.trim()).filter(Boolean);
      }
    } catch (err) {
      console.error('[delta] Git diff fallback failed:', err.message);
    }
  }
}

changedFiles = changedFiles.filter(f => fs.existsSync(f));

async function run() {
  emit('SF_TEST_LEVEL', testLevel);
  emit('SF_TEST_ARGS', testArgs);

  if (forceFull) {
    emit('SF_DEPLOY_MODE', 'full');
    emit('SF_HAS_CHANGES', 'true');
    emit('SF_USE_MANIFEST', 'false');
    return;
  }

  if (changedFiles.length === 0) {
    emit('SF_DEPLOY_MODE', 'delta');
    emit('SF_HAS_CHANGES', 'false');
    emit('SF_USE_MANIFEST', 'false');
    return;
  }

  console.log(`[delta] ${changedFiles.length} changed files detected`);

  const componentSet = ComponentSet.fromSource(changedFiles);

  if (componentSet.size === 0) {
    console.log('[delta] No metadata components detected in changed files');
    emit('SF_DEPLOY_MODE', 'delta');
    emit('SF_HAS_CHANGES', 'false');
    emit('SF_USE_MANIFEST', 'false');
    return;
  }

  if (process.env.SF_API_VERSION) {
    componentSet.apiVersion = process.env.SF_API_VERSION.replace(/^v/i, '');
  }

  const manifestDir = path.join(process.cwd(), 'manifest');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'package.xml');

  const xmlContent = await componentSet.getPackageXml();
  fs.writeFileSync(manifestPath, xmlContent);

  console.log('\n--- BEGIN MANIFEST: manifest/package.xml ---');
  console.log(xmlContent);
  console.log('--- END MANIFEST: manifest/package.xml ---\n');

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Manifest Content (package.xml)\n\`\`\`xml\n${xmlContent}\n\`\`\`\n`
      );
    } catch (e) {
      console.error('[delta] Failed to write step summary:', e.message);
    }
  }

  emit('SF_DEPLOY_MODE', 'delta');
  emit('SF_HAS_CHANGES', 'true');
  emit('SF_USE_MANIFEST', 'true');
  emit('SF_MANIFEST_PATH', manifestPath);
}

run().catch(err => {
  console.error('[delta] Fatal:', err.message);
  process.exit(1);
});
