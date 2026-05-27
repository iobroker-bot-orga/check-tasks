#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const axios = require('axios');

const common = require('../../lib/commonTools.js');
//const github = require('../../lib/githubTools.js');
const iobroker = require('../../lib/iobrokerTools.js');

const opts = {
    cleanup: false,
    dry: false,
    debug: false,
    erroronly: false,
    filter: '',
    from: '',
    delay: 30,
    recheck: false,
    recreate: false,
};

function debug(text) {
    if (opts.debug) {
        console.log(`[DEBUG] ${text}`);
    }
}

/**
 * Validate filter pattern format
 *
 * @param {string} pattern - Filter pattern to validate
 * @returns {boolean} True if the pattern is valid or empty
 */
function validateFilterPattern(pattern) {
    if (!pattern) {
        return true;
    }
    return pattern.split('/').length === 2;
}

/**
 * Compile filter pattern into regex objects for efficient matching
 *
 * @param {string} pattern - Filter pattern with wildcards
 * @returns {object|null} Object with ownerRegex and repoRegex, or null if no filter
 */
function compileFilterPattern(pattern) {
    if (!pattern) {
        return null;
    }

    const lowerPattern = pattern.toLowerCase();
    const [ownerPattern, repoPattern] = lowerPattern.split('/');

    const escapeRegex = str => str.replace(/[-+.?^${}()|[\]\\]/g, '\\$&');
    const toRegexPattern = p => `^${escapeRegex(p).replace(/\*/g, '.*')}$`;

    return {
        ownerRegex: new RegExp(toRegexPattern(ownerPattern)),
        repoRegex: new RegExp(toRegexPattern(repoPattern)),
    };
}

/**
 * Check if a repository matches the pre-compiled filter pattern
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {boolean} True if the repository matches the pattern
 */
function matchesFilter(owner, repo) {
    if (!filterRegexes) {
        return true;
    }
    return filterRegexes.ownerRegex.test(owner.toLowerCase()) && filterRegexes.repoRegex.test(repo.toLowerCase());
}

let filterRegexes = null;

function triggerRestart(adapter) {
    debug(`trigger latest restart from ${adapter}`);

    let flags = '';
    if (opts.cleanup) {
        flags = `${flags} --cleanup`;
    }
    if (opts.dry) {
        flags = `${flags} --dry`;
    }
    if (opts.debug) {
        flags = `${flags} --debug`;
    }
    if (opts.erroronly) {
        flags = `${flags} --erroronly`;
    }
    if (opts.recheck) {
        flags = `${flags} --recheck`;
    }
    if (opts.recreate) {
        flags = `${flags} --recreate`;
    }

    const clientPayload = {
        from: adapter,
        filter: opts.filter,
        delay: `${opts.delay}`,
        flags: flags.trim(),
    };

    return axios
        .post(
            `https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches`,
            { event_type: 'check-latest-restart', client_payload: clientPayload },
            {
                headers: {
                    Authorization: `bearer ${process.env.IOBBOT_GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github+json',
                    'user-agent': 'Action script',
                },
            },
        )
        .then(response => {
            console.log(response.data);
        })
        .catch(e => console.error(e));
}

function triggerRepoCheck(owner, adapter) {
    let url = `${owner}/ioBroker.${adapter}`;

    if (opts.cleanup) {
        url = `${url} --cleanup`;
    }
    if (opts.dry) {
        url = `${url} --dry`;
    }
    if (opts.debug) {
        url = `${url} --debug`;
    }
    if (opts.erroronly) {
        url = `${url} --erroronly`;
    }
    if (opts.recheck) {
        url = `${url} --recheck`;
    }
    if (opts.recreate) {
        url = `${url} --recreate`;
    }

    debug(`trigger rep checker for ${url}`);

    // curl -L -X POST -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ghp_xxxxxxxx" https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches -d "{\"event_type\": \"check-repository\", \"client_payload\": {\"url\": \"mcm1957/iobroker.weblate-test\"}}"
    return axios
        .post(
            `https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches`,
            { event_type: 'check-repository', client_payload: { url: url } },
            {
                headers: {
                    Authorization: `bearer ${process.env.IOBBOT_GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github+json',
                    'user-agent': 'Action script',
                },
            },
        )
        .then(response => response.data)
        .catch(e => console.error(e));
}

async function main() {
    const options = {
        cleanup: {
            type: 'boolean',
        },
        dry: {
            type: 'boolean',
        },
        debug: {
            type: 'boolean',
            short: 'd',
        },
        erroronly: {
            type: 'boolean',
        },
        filter: {
            type: 'string',
        },
        from: {
            type: 'string',
        },
        recheck: {
            type: 'boolean',
        },
        recreate: {
            type: 'boolean',
        },
        delay: {
            type: 'string',
        },
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { values, positionals } = parseArgs({ options, strict: true, allowPositionals: true });

    //console.log(values, positionals);

    opts.cleanup = values['cleanup'];
    opts.dry = values['dry'];
    opts.debug = values['debug'];
    opts.filter = values['filter'] || '';
    opts.from = values['from'];
    opts.erroronly = values['erroronly'];
    opts.recheck = values['recheck'];
    opts.recreate = values['recreate'];
    if (!values['delay']) {
        opts.delay = 30;
    } else {
        const delayValue = values['delay'].trim();
        if (!/^\d+$/.test(delayValue)) {
            console.log(`[WARN] Invalid delay "${values['delay']}", using minimum delay of 15 seconds`);
            opts.delay = 15;
        } else {
            const parsedDelay = Number.parseInt(delayValue, 10);
            opts.delay = Math.max(parsedDelay, 15);
            if (opts.delay !== parsedDelay) {
                console.log(`[WARN] Delay "${values['delay']}" is below the minimum, using 15 seconds`);
            }
        }
    }

    if (!validateFilterPattern(opts.filter)) {
        console.log(`[ERROR] Invalid filter pattern: ${opts.filter}`);
        console.log('   Expected format: owner/repo');
        console.log('   Examples: iobroker-community-adapters/*, */*watch*, iobroker*/*');
        process.exit(1);
    }
    filterRegexes = compileFilterPattern(opts.filter);

    //if (positionals.length != x) {
    //    console.log ('[ERROR] Please specify exactly one repository');
    //    process.exit (1);
    //}

    const latestRepo = await iobroker.getLatestRepoLive();
    const total = Object.keys(latestRepo).length;
    const delay = opts.delay;
    let counter = Math.floor((3 * 60 * 60) / delay); /* restart after 3h */

    console.log(`[INFO] delay set to ${delay} seconds`);
    console.log(`[INFO] will restart after 3h (${counter} checks)`);
    if (opts.filter) {
        console.log(`[INFO] filter set to "${opts.filter}"`);
    }

    let curr = 0;
    let skip = opts.from && opts.from !== '';
    if (skip) {
        console.log(`--from set to "${opts.from}" - searching for first adapter to process ...`);
    }
    for (const adapter in latestRepo) {
        if (counter <= 0) {
            console.log(`[INFO] task will be restarted, next adapter is ${adapter}`);
            await triggerRestart(adapter);
            break;
        }

        curr = curr + 1;
        if (adapter.startsWith('_')) {
            continue;
        }
        if (adapter === opts.from) {
            skip = false;
        }
        if (skip) {
            console.log(`skipping ${adapter}`);
            continue;
        }

        debug(`processing ${latestRepo[adapter].meta}`);

        const parts = latestRepo[adapter].meta.split('/');
        const owner = parts[3];
        const repoName = `ioBroker.${adapter}`;

        if (!matchesFilter(owner, repoName)) {
            debug(`skipping ${owner}/${repoName} (does not match filter)`);
            continue;
        }

        console.log(`[INFO] processing ${owner}/${repoName} (${curr}/${total})`);

        triggerRepoCheck(owner, adapter);
        counter = counter - 1;
        if (counter > 0) {
            console.log(`will restart after ${counter} checks, sleeping (${delay}s) ...`);
        } else {
            console.log(`will restart after delay, sleeping (${delay}s) ...`);
        }
        await common.sleep(delay * 1000);
    }

    console.log(`[INFO] task completed`);
}

process.env.OWN_GITHUB_TOKEN = process.env.IOBBOT_GITHUB_TOKEN;
main();
