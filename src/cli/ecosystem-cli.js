const {
  EXIT_CODE,
  buildUsage,
  handleCliError,
  parseCliArgs,
  resolveIo,
  resolveRootOption,
  writeJson,
} = require('./lib/shared.js');

/** @typedef {{ id: string, summary?: string, requires?: string[], contributes?: Record<string, unknown> }} BundleRecord */
/** @typedef {{ preset: string, source: string, reason: string }} PresetRecommendation */
/** @typedef {{ command: string, root: string, ecosystem_state?: Record<string, unknown>, workspace_profile?: Record<string, unknown>, bundles?: BundleRecord[], recommendations?: string[], recommended_presets?: string[], preset_recommendations?: PresetRecommendation[], resolved_bundle_plan?: string[], result?: Record<string, unknown> }} EcosystemPayload */

/** @param {(command: string, args: string[]) => string} formatManagedInvocation */
function createUsage(formatManagedInvocation) {
  return buildUsage(formatManagedInvocation, [
    ['ecosystem', 'status', '--json'],
    ['ecosystem', 'list', '--json'],
    ['ecosystem', 'recommend', '--root', '/path/to/project', '--json'],
    ['ecosystem', 'enable', '--bundle', 'node-service', '--json'],
    ['ecosystem', 'disable', '--bundle', 'mcp-devtools', '--json'],
    ['ecosystem', 'apply', '--bundle', 'release-governance', '--json'],
  ]);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  return parseCliArgs(argv, { multiValueKeys: ['bundle'] });
}

/** @param {unknown} value @returns {string[]} */
function normalizeBundles(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const bundles = [];
  for (const item of value) {
    const bundle = String(item || '').trim();
    if (!bundle || seen.has(bundle)) {
      continue;
    }
    seen.add(bundle);
    bundles.push(bundle);
  }
  return bundles;
}

/** @param {ReturnType<typeof parseArgs>} opts */
function resolveCommand(opts) {
  return String(opts._[0] || 'status').trim() || 'status';
}

/** @param {ReturnType<typeof parseArgs>} opts */
function resolveBundleArgs(opts) {
  return normalizeBundles([...(Array.isArray(opts.bundle) ? opts.bundle : []), ...opts._.slice(1)]);
}

/** @param {{ write(chunk: string): void }} stdout @param {EcosystemPayload} payload */
function printHuman(stdout, payload) {
  stdout.write(`ecosystem command: ${payload.command}\n`);
  stdout.write(`root: ${payload.root}\n`);
  if (Array.isArray(payload.bundles)) {
    stdout.write(`bundles: ${payload.bundles.map((item) => item.id).join(', ') || 'none'}\n`);
  }
  if (Array.isArray(payload.recommendations)) {
    stdout.write(`recommendations: ${payload.recommendations.join(', ') || 'none'}\n`);
  }
  if (payload.workspace_profile && Array.isArray(payload.workspace_profile.explanation)) {
    stdout.write(`explanation: ${payload.workspace_profile.explanation.join(' | ')}\n`);
  }
  if (payload.result) {
    stdout.write(`result: ${JSON.stringify(payload.result)}\n`);
  }
}

/** @param {{
 * loadEcosystemState?: (root: string) => Record<string, unknown>,
 * buildWorkspaceProfile?: (root: string, options?: Record<string, unknown>) => Record<string, unknown>,
 * listBundles?: () => BundleRecord[],
 * applyBundles?: (options: Record<string, unknown>) => Record<string, unknown>,
 * argv?: string[],
 * stdout?: { write(chunk: string): void },
 * stderr?: { write(chunk: string): void },
 * exit?: (code: number) => void,
 * formatManagedInvocation?: (command: string, args: string[]) => string,
 * }} [deps] */
function main(deps = {}) {
  const io = resolveIo({
    argv: deps.argv,
    stdout: deps.stdout,
    stderr: deps.stderr,
    exit: deps.exit,
    formatManagedInvocation: deps.formatManagedInvocation,
  });

  try {
    const opts = parseArgs(io.argv);
    if (opts.help || opts.h) {
      io.stdout.write(createUsage(io.formatManagedInvocation) + '\n');
      io.exit(EXIT_CODE.OK);
      return;
    }

    if (typeof deps.loadEcosystemState !== 'function') throw new Error('loadEcosystemState is required');
    if (typeof deps.buildWorkspaceProfile !== 'function') throw new Error('buildWorkspaceProfile is required');
    if (typeof deps.listBundles !== 'function') throw new Error('listBundles is required');
    if (typeof deps.applyBundles !== 'function') throw new Error('applyBundles is required');

    const command = resolveCommand(opts);
    const root = resolveRootOption(opts, opts._[1]);
    const ecosystemState = deps.loadEcosystemState(root);
    const workspaceProfile = deps.buildWorkspaceProfile(root, { ecosystemState });

    /** @type {EcosystemPayload} */
    let payload;
    if (command === 'status') {
      payload = {
        command,
        root,
        ecosystem_state: ecosystemState,
        workspace_profile: workspaceProfile,
        recommended_presets: Array.isArray(workspaceProfile.recommended_presets) ? workspaceProfile.recommended_presets : [],
        preset_recommendations: Array.isArray(workspaceProfile.preset_recommendations) ? workspaceProfile.preset_recommendations : [],
        resolved_bundle_plan: Array.isArray(workspaceProfile.effective_bundles) ? workspaceProfile.effective_bundles : [],
      };
    } else if (command === 'list') {
      payload = {
        command,
        root,
        bundles: deps.listBundles(),
      };
    } else if (command === 'recommend') {
      payload = {
        command,
        root,
        recommendations: Array.isArray(workspaceProfile.recommended_bundles) ? workspaceProfile.recommended_bundles : [],
        recommended_presets: Array.isArray(workspaceProfile.recommended_presets) ? workspaceProfile.recommended_presets : [],
        preset_recommendations: Array.isArray(workspaceProfile.preset_recommendations) ? workspaceProfile.preset_recommendations : [],
        resolved_bundle_plan: Array.isArray(workspaceProfile.effective_bundles) ? workspaceProfile.effective_bundles : [],
        workspace_profile: workspaceProfile,
      };
    } else if (command === 'enable' || command === 'disable' || command === 'apply') {
      const bundleIds = resolveBundleArgs(opts);
      if ((command === 'enable' || command === 'disable') && bundleIds.length === 0) {
        throw new Error(`ecosystem ${command} requires at least one --bundle <id>`);
      }
      payload = {
        command,
        root,
        result: deps.applyBundles({
          rootDir: root,
          bundle_ids: bundleIds,
          command,
          state: ecosystemState,
          enabled_bundles: command === 'enable'
            ? normalizeBundles([...(Array.isArray(ecosystemState.enabled_bundles) ? ecosystemState.enabled_bundles : []), ...bundleIds])
            : ecosystemState.enabled_bundles,
          disabled_bundles: command === 'disable'
            ? normalizeBundles([...(Array.isArray(ecosystemState.disabled_bundles) ? ecosystemState.disabled_bundles : []), ...bundleIds])
            : ecosystemState.disabled_bundles,
          recommended_bundles: command === 'apply'
            ? (Array.isArray(workspaceProfile.recommended_bundles) ? workspaceProfile.recommended_bundles : bundleIds)
            : (Array.isArray(workspaceProfile.recommended_bundles) ? workspaceProfile.recommended_bundles : []),
          bootstrap: ecosystemState.bootstrap || null,
        }),
      };
    } else {
      throw new Error(`unknown ecosystem subcommand: ${command}`);
    }

    if (opts.json) {
      writeJson(io.stdout, payload);
      return;
    }
    printHuman(io.stdout, payload);
  } catch (error) {
    handleCliError(io.stderr, 'ecosystem', error, {
      usage: createUsage(io.formatManagedInvocation),
      exitCode: EXIT_CODE.INVALID_ARGS,
      exit: io.exit,
    });
  }
}

module.exports = {
  createUsage,
  main,
  normalizeBundles,
  parseArgs,
  printHuman,
  resolveBundleArgs,
  resolveCommand,
};
