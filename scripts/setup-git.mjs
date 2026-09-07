/** Installs the local `ours` merge driver that .gitattributes refers to.
 *
 * Git has no built-in `ours` driver and config is not versioned, so this has to be set
 * per clone. The driver is `true`: it succeeds without writing, which leaves the file
 * at the current tree's version. That is always safe here because both files it applies
 * to are reproducible output of `scripts/build.mjs`, and `pretest` rebuilds them.
 *
 * Deliberately quiet and never fatal — it runs from `postinstall`, where a tarball
 * install or a CI checkout may have no git repository at all.
 */
import { execFileSync } from 'node:child_process';

function git(args) {
 return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

try {
 git(['rev-parse', '--git-dir']);
} catch {
 process.exit(0);   // not a git checkout; nothing to configure
}

try {
 if (git(['config', '--get', 'merge.ours.driver']) === 'true') process.exit(0);
} catch { /* unset, fall through and set it */ }

try {
 git(['config', 'merge.ours.driver', 'true']);
 console.log('Configured the `ours` merge driver for generated build output.');
} catch {
 console.log('Could not configure the `ours` merge driver; generated files will conflict as before.');
}
