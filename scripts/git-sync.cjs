'use strict';

/**
 * git-sync.cjs — Git Sync Engine
 *
 * Utilities for git sync operations in skills-guru:
 *   - parseSourcesMarkdown(content) → array of source objects
 *   - formatSourcesMarkdown(sources) → markdown string
 *   - detectDivergence(localHash, remoteHash, installedHash) → string
 *   - isGitRepo(dir) → boolean
 *   - hasGhCli() → boolean
 *   - safeForSync(dir) → { safe: boolean, reason?: string }
 *
 * CLI usage:
 *   node git-sync.cjs <sync|reset|push|pr|fork|diff|self-update|self-reset>
 *     [--source <name>] [--skill <name>] [--skills-dir <path>] [--sources <path>]
 *
 * Sources markdown format:
 *   ## Registered Sources
 *   ### <name>
 *   - URL: <url>
 *   - Branch: <branch>
 *   - Last sync: <ISO timestamp>
 *   - Skills: [skill-a, skill-b]
 *   - Fork of: <url>  (optional)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── parseSourcesMarkdown ─────────────────────────────────────────────────────

/**
 * Parse a sources.md file content into an array of source objects.
 *
 * Expected format:
 *   ## Registered Sources
 *   ### <name>
 *   - URL: <url>
 *   - Branch: <branch>
 *   - Last sync: <ISO timestamp>
 *   - Skills: [skill-a, skill-b]
 *   - Fork of: <url>  (optional)
 *
 * @param {string} content - Markdown file content
 * @returns {Array<{name:string, url:string, branch:string, lastSync:string, skills:string[], forkOf?:string}>}
 */
function parseSourcesMarkdown(content) {
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return [];
  }

  // Find the "## Registered Sources" section
  const registeredSectionMatch = content.match(/^##\s+Registered Sources\s*$/m);
  if (!registeredSectionMatch) {
    return [];
  }

  const sectionStart = registeredSectionMatch.index + registeredSectionMatch[0].length;
  const sectionContent = content.slice(sectionStart);

  // Split by ### headers to get individual source blocks
  const sourceBlocks = sectionContent.split(/^###\s+/m).slice(1); // first element is empty before first ###

  const sources = [];

  for (const block of sourceBlocks) {
    const lines = block.split('\n');
    const name = lines[0].trim();

    if (!name) continue;

    let url = '';
    let branch = '';
    let lastSync = '';
    let skills = [];
    let forkOf = undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();

      const urlMatch = trimmed.match(/^-\s+URL:\s*(.+)$/);
      if (urlMatch) { url = urlMatch[1].trim(); continue; }

      const branchMatch = trimmed.match(/^-\s+Branch:\s*(.+)$/);
      if (branchMatch) { branch = branchMatch[1].trim(); continue; }

      const syncMatch = trimmed.match(/^-\s+Last sync:\s*(.+)$/);
      if (syncMatch) { lastSync = syncMatch[1].trim(); continue; }

      const skillsMatch = trimmed.match(/^-\s+Skills:\s*\[([^\]]*)\]$/);
      if (skillsMatch) {
        const skillsStr = skillsMatch[1].trim();
        skills = skillsStr === '' ? [] : skillsStr.split(',').map(s => s.trim()).filter(Boolean);
        continue;
      }

      const forkOfMatch = trimmed.match(/^-\s+Fork of:\s*(.+)$/);
      if (forkOfMatch) { forkOf = forkOfMatch[1].trim(); continue; }
    }

    const source = { name, url, branch, lastSync, skills };
    if (forkOf !== undefined) {
      source.forkOf = forkOf;
    }

    sources.push(source);
  }

  return sources;
}

// ─── formatSourcesMarkdown ────────────────────────────────────────────────────

/**
 * Format an array of source objects back into markdown.
 *
 * @param {Array<{name:string, url:string, branch:string, lastSync:string, skills:string[], forkOf?:string}>} sources
 * @returns {string} Markdown content
 */
function formatSourcesMarkdown(sources) {
  if (!sources || sources.length === 0) {
    return '## Registered Sources\n';
  }

  const lines = ['## Registered Sources', ''];

  for (const source of sources) {
    lines.push(`### ${source.name}`);
    lines.push(`- URL: ${source.url}`);
    lines.push(`- Branch: ${source.branch}`);
    lines.push(`- Last sync: ${source.lastSync}`);

    const skillsList = Array.isArray(source.skills) ? source.skills.join(', ') : '';
    lines.push(`- Skills: [${skillsList}]`);

    if (source.forkOf) {
      lines.push(`- Fork of: ${source.forkOf}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ─── detectDivergence ─────────────────────────────────────────────────────────

/**
 * Detect divergence between local, remote, and installed states.
 *
 * Parameters represent commit hashes (or any comparable string identifiers):
 *   localHash     — current local working copy state
 *   remoteHash    — current upstream/remote state
 *   installedHash — state at time of last install/sync
 *
 * Returns:
 *   'identical'      — all three are the same
 *   'local-changed'  — local differs from installed, remote matches installed
 *   'remote-changed' — remote differs from installed, local matches installed
 *   'both-changed'   — both local and remote differ from installed
 *
 * @param {string} localHash
 * @param {string} remoteHash
 * @param {string} installedHash
 * @returns {'identical'|'local-changed'|'remote-changed'|'both-changed'}
 */
function detectDivergence(localHash, remoteHash, installedHash) {
  const localChanged = localHash !== installedHash;
  const remoteChanged = remoteHash !== installedHash;

  if (!localChanged && !remoteChanged) {
    return 'identical';
  }
  if (localChanged && !remoteChanged) {
    return 'local-changed';
  }
  if (!localChanged && remoteChanged) {
    return 'remote-changed';
  }
  return 'both-changed';
}

// ─── isGitRepo ────────────────────────────────────────────────────────────────

/**
 * Check if a directory is inside a git repository.
 *
 * @param {string} dir - Directory path to check
 * @returns {boolean}
 */
function isGitRepo(dir) {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: dir,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

// ─── hasGhCli ─────────────────────────────────────────────────────────────────

/**
 * Check if the GitHub CLI (gh) is available on the system.
 *
 * @returns {boolean}
 */
function hasGhCli() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ─── safeForSync ──────────────────────────────────────────────────────────────

/**
 * Check if a directory is safe to use for sync operations.
 * Specifically verifies that .local/ is covered by .gitignore.
 *
 * @param {string} dir - Directory to check
 * @returns {{ safe: boolean, reason?: string }}
 */
function safeForSync(dir) {
  const gitignorePath = path.join(dir, '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    return {
      safe: false,
      reason: '.gitignore not found — .local/ directory would not be ignored',
    };
  }

  let content;
  try {
    content = fs.readFileSync(gitignorePath, 'utf8');
  } catch (err) {
    return {
      safe: false,
      reason: `Could not read .gitignore: ${err.message}`,
    };
  }

  // Check if .local/ or .local is covered by .gitignore
  const lines = content.split('\n').map(l => l.trim());
  const coversLocal = lines.some(line => {
    return line === '.local/' || line === '.local' || line === '/.local/' || line === '/.local';
  });

  if (!coversLocal) {
    return {
      safe: false,
      reason: '.gitignore does not cover .local/ — local secrets could be committed',
    };
  }

  return { safe: true };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseSourcesMarkdown,
  formatSourcesMarkdown,
  detectDivergence,
  isGitRepo,
  hasGhCli,
  safeForSync,
};

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const COMMANDS = ['sync', 'reset', 'push', 'pr', 'fork', 'diff', 'self-update', 'self-reset'];

  if (!command || !COMMANDS.includes(command)) {
    console.log(`
git-sync.cjs — Skills Guru Git Sync Engine

Usage:
  node git-sync.cjs <command> [options]

Commands:
  sync         Sync skills from registered sources
  reset        Reset local changes to match remote
  push         Push local changes to remote
  pr           Create a pull request with local changes
  fork         Fork a source repository
  diff         Show divergence between local, remote, and installed states
  self-update  Update skills-guru itself from its upstream source
  self-reset   Reset skills-guru to upstream state

Options:
  --source <name>       Target a specific registered source
  --skill <name>        Target a specific skill
  --skills-dir <path>   Override skills directory path
  --sources <path>      Override sources.md file path

Notes:
  Full sync orchestration is handled by Claude reading sync-guide.md.
  These utilities provide building blocks for that orchestration.

Examples:
  node git-sync.cjs diff --source default
  node git-sync.cjs sync --source default --skill my-skill
  node git-sync.cjs push --source default
`);
    process.exit(command ? 1 : 0);
  }

  // Parse options
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) { options.source = args[++i]; }
    else if (args[i] === '--skill' && args[i + 1]) { options.skill = args[++i]; }
    else if (args[i] === '--skills-dir' && args[i + 1]) { options.skillsDir = args[++i]; }
    else if (args[i] === '--sources' && args[i + 1]) { options.sources = args[++i]; }
  }

  console.log(`git-sync.cjs: command '${command}' — full orchestration handled via sync-guide.md`);
  console.log('Options:', options);
  console.log('');
  console.log('Utility checks:');
  console.log(`  isGitRepo(cwd): ${isGitRepo(process.cwd())}`);
  console.log(`  hasGhCli():     ${hasGhCli()}`);
  const syncCheck = safeForSync(process.cwd());
  console.log(`  safeForSync():  ${syncCheck.safe}${syncCheck.reason ? ` (${syncCheck.reason})` : ''}`);
}
