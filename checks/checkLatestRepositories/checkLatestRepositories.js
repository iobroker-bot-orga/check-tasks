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
    from: '',
    recheck: false,
    recreate: false,
};

function debug(text) {
    if (opts.debug) {
        console.log(`[DEBUG] ${text}`);
    }
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
        from: {
            type: 'string',
        },
        recheck: {
            type: 'boolean',
        },
        recreate: {
            type: 'boolean',
        },
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { values, positionals } = parseArgs({ options, strict: true, allowPositionals: true });

    //console.log(values, positionals);

    opts.cleanup = values['cleanup'];
    opts.dry = values['dry'];
    opts.debug = values['debug'];
    opts.from = values['from'];
    opts.erroronly = values['erroronly'];
    opts.recheck = values['recheck'];
    opts.recreate = values['recreate'];

    //if (positionals.length != x) {
    //    console.log ('[ERROR] Please specify exactly one repository');
    //    process.exit (1);
    //}

    const latestRepo = await iobroker.getLatestRepoLive();
    const total = Object.keys(latestRepo).length;
    let curr = 0;
    let skip = opts.from && opts.from !== '';
    if (skip) {
        console.log(`--from set to "${opts.from}" - serching for first adapter to process ...`);
    }
    for (const adapter in latestRepo) {
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
        console.log(`[INFO] processing ${owner}/ioBroker.${adapter} (${curr}/${total})`);

        triggerRepoCheck(owner, adapter);
        console.log('sleeping (30s) ...');
        await common.sleep(30000);
    }
}

process.env.OWN_GITHUB_TOKEN = process.env.IOBBOT_GITHUB_TOKEN;
main();
