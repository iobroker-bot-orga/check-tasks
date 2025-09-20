'use strict';
const { parseArgs } = require('node:util');

const { sleep } = require('../../lib/commonTools');
const { getAllIssues, getAllLabels, addComment, createIssue, closeIssue } = require('../../lib/githubTools');
const { getLatestRepoLive, getStableRepoFile, getStableRepoLive, getStatistics } = require('../../lib/iobrokerTools');
//const { exit } = require('node:process');

// const axios = require('axios');
const semver = require('semver');

const TITLE_ADD = '🚀 Please add adapter to stable repository - ';
const TITLE_UPDATE = '🚀 Consider updating stable version in repo';

const ONE_DAY = 3600000 * 24;

const opts = {
    nocheck: false,
    debug: false,
    dry: false,
    recreate: false,
};

function debug(text) {
    if (opts.debug) {
        console.log(`[DEBUG] ${text}`);
    }
}

function triggerRepoCheck(adapter) {
    const url = `${adapter.owner}/ioBroker.${adapter.adapter}`;
    console.log(`trigger rep checker for ${url}`);
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

async function checkIssues(latest, stable, statistics, result) {
    for (const adapter in latest) {
        if (!adapter.startsWith('_')) {
            console.log(`checking ${adapter} ...\n`);
            debug(`    ${latest[adapter].meta}\n`);
            const parts = latest[adapter].meta.split('/');
            const owner = parts[3];
            //let issues = await getGithub(`https://api.github.com/repos/${owner}/ioBroker.${adapter}/issues`);
            let issues = await getAllIssues(owner, `ioBroker.${adapter}`);
            issues = issues.filter(
                i => i.state === 'open' && (i.title.startsWith(TITLE_ADD) || i.title.startsWith(TITLE_UPDATE)),
            );
            for (const issue of issues) {
                const issueId = issues[0].number;
                console.log(`\n${adapter}: [ https://www.github.com/${owner}/iobroker.${adapter} ]`);
                //const res = result.filter(r => r.adapter === adapter);
                const res = result[adapter];
                let newTitle = '';
                if (res) {
                    if (res.stable.version === '0.0.0') {
                        newTitle = `${TITLE_ADD} ${res.latest.version}`;
                    } else {
                        newTitle = `${TITLE_UPDATE} from ${res.stable.version} to ${res.latest.version}`;
                    }
                }
                if (issue.title === newTitle) {
                    console.log(`    ${issue.title} detected - issue still valid`);
                    //console.log(JSON.stringify(res));
                    result[adapter].issueId = issueId;
                    const labels = await getAllLabels(owner, `ioBroker.${adapter}`, issueId);
                    for (let i = 0; i < labels.length; i++) {
                        if (labels[i].name.toLowerCase() === 'stale') {
                            console.log(`    issue marked as stale, will try to refresh`);
                            const comment =
                                `This issue seems to be still valid. So it should not be flagged stale.\n` +
                                `Please consider processing the issue\n` +
                                `@mcm1957 for evidence`;
                            try {
                                if (!opts.dry) {
                                    await addComment(owner, `ioBroker.${adapter}`, issueId, comment);
                                    console.log(`    comment added to ${issueId}`);
                                } else {
                                    console.log(`[DRY] would add comment to ${issueId}`);
                                }
                            } catch (e) {
                                console.log(`error adding comment to ${issueId}`);
                                console.log(e.toString());
                            }
                        }
                    }
                } else {
                    console.log(`    ${issue.title} detected`);
                    // const TITLE_ADD = 'Please add adapter to stable repository -';
                    // const TITLE_UPDATE = 'Consider updating stable version in repo';
                    let matches = issue.title.match(/^Please add adapter to stable repository - (\d+\.\d+\.\d+)/);
                    if (matches && matches.length) {
                        issue.from = '0.0.0';
                        issue.to = matches[1];
                    } else {
                        matches = issue.title.match(
                            /^Consider updating stable version in repo from (\d+\.\d+\.\d+) to (\d+\.\d+\.\d+)/,
                        );
                        if (matches && matches.length) {
                            issue.from = matches[1];
                            issue.to = matches[2];
                        } else {
                            console.log(`    ###############    WARNING    ################`);
                            console.log(`    cannot parse issue title please check manually`);
                            console.log(`    >${issue.title}<`);
                            continue;
                        }
                    }

                    if (stable[adapter] && semver.gte(stable[adapter].version, issue.to)) {
                        console.log(`    adapter is already at stable version ${stable[adapter].version}`);
                        const comment =
                            `This issue seems to be outdated.\n\n` +
                            `This issue suggests to update the stable version of this adapter to ${issue.to} but the current ` +
                            `stable version is already ${stable[adapter].version}.\n\n` +
                            `So this issue should be closed.\n\n` +
                            `@mcm1957 for evidence`;
                        try {
                            if (!opts.dry) {
                                await addComment(owner, `ioBroker.${adapter}`, issueId, comment);
                                console.log(`    comment added to ${issueId}`);
                            } else {
                                console.log(`[DRY] would add comment to ${issueId}`);
                            }
                        } catch (e) {
                            console.log(`error adding comment to ${issueId}`);
                            console.log(e.toString());
                        }
                        try {
                            if (!opts.dry) {
                                await closeIssue(owner, `ioBroker.${adapter}`, issueId);
                                console.log(`    issue ${issueId} closed`);
                            } else {
                                console.log(`[DRY] would close ${issueId}`);
                            }
                        } catch (e) {
                            console.log(`error closing issue ${issueId}`);
                            console.log(e.toString());
                        }
                    } else if (
                        res &&
                        semver.gt(res.latest.version, issue.to) &&
                        res.latest.version.match(/^\d+\.\d+\.\d+$/)
                    ) {
                        // ignore -alpha.x
                        console.log(`    adapter should be updated to ${res.latest.version} now`);
                        const comment =
                            `This issue seems to be outdated.\n\n` +
                            `This issue suggests to update the stable version of this adapter to ${issue.to} but in the meantime ` +
                            `an update to version ${res.latest.version} is suggested.\n\n` +
                            `So this issue will be closed and replaced by an updated one.\n\n` +
                            `@mcm1957 for evidence`;
                        try {
                            if (!opts.dry) {
                                await addComment(owner, `ioBroker.${adapter}`, issueId, comment);
                                console.log(`    comment added to ${issueId}`);
                            } else {
                                console.log(`[DRY] would add comment to ${issueId}`);
                            }
                        } catch (e) {
                            console.log(`error adding comment to ${issueId}`);
                            console.log(e.toString());
                        }
                        try {
                            if (!opts.dry) {
                                await closeIssue(owner, `ioBroker.${adapter}`, issueId);
                                console.log(`    issue ${issueId} closed`);
                            } else {
                                console.log(`[DRY] would close ${issueId}`);
                            }
                        } catch (e) {
                            console.log(`error closing issue ${issueId}`);
                            console.log(e.toString());
                        }
                    } else {
                        console.log(
                            `    request to update to ${issue.to} no longer valid, current latest is ${latest[adapter].version}`,
                        );
                        const comment =
                            `This issue seems to be outdated.\n\n` +
                            `This issue suggests to update the stable version of this adapter to ${issue.to} but this request is no longer valid. ` +
                            `Current latest release is ${latest[adapter].version}.\n\n` +
                            `So this issue will be closed and replaced by an updated one.\n\n` +
                            `@mcm1957 for evidence`;
                        try {
                            if (!opts.dry) {
                                await addComment(owner, `ioBroker.${adapter}`, issueId, comment);
                                console.log(`    comment added to ${issueId}`);
                            } else {
                                console.log(`[DRY] would add comment to ${issueId}`);
                            }
                        } catch (e) {
                            console.log(`error adding comment to ${issueId}`);
                            console.log(e.toString());
                        }
                        try {
                            if (!opts.dry) {
                                await closeIssue(owner, `ioBroker.${adapter}`, issueId);
                                console.log(`    issue ${issueId} closed`);
                            } else {
                                console.log(`[DRY] would close ${issueId}`);
                            }
                        } catch (e) {
                            console.log(`error closing issue ${issueId}`);
                            console.log(e.toString());
                        }
                    }
                }
            }
        }
    }
}

async function cleanIssues(latest) {
    for (const adapter in latest) {
        if (!adapter.startsWith('_')) {
            console.log(`checking ${adapter} ...\n`);
            debug(`    ${latest[adapter].meta}\n`);
            const parts = latest[adapter].meta.split('/');
            const owner = parts[3];
            let issues = await getAllIssues(owner, `ioBroker.${adapter}`);
            issues = issues.filter(
                i => i.state === 'open' && (i.title.startsWith(TITLE_ADD) || i.title.startsWith(TITLE_UPDATE)),
            );
            for (const issue of issues) {
                const issueId = issue.number;
                console.log(`\n${adapter}: [ https://www.github.com/${owner}/iobroker.${adapter} ]`);
                console.log(`  Issue ${issueId} will be closed`);
                const comment = `This issue will be closed due to recreate request.\n\n@mcm1957 for evidence`;
                try {
                    if (!opts.dry) {
                        await addComment(owner, `ioBroker.${adapter}`, issueId, comment);
                        console.log(`    comment added to ${issueId}`);
                    } else {
                        console.log(`[DRY] would add comment to ${issueId}`);
                    }
                } catch (e) {
                    console.log(`error adding comment to ${issueId}`);
                    console.log(e.toString());
                }
                try {
                    if (!opts.dry) {
                        await closeIssue(owner, `ioBroker.${adapter}`, issueId);
                        console.log(`    issue ${issueId} closed`);
                    } else {
                        console.log(`[DRY] would close ${issueId}`);
                    }
                } catch (e) {
                    console.log(`error closing issue ${issueId}`);
                    console.log(e.toString());
                }
            }
        }
    }
}

async function createIssues(latest, stableFile, result) {
    for (const adapter in latest) {
        if (!adapter.startsWith('_')) {
            debug(`processing ${latest[adapter].meta}\n`);

            const res = result[adapter];
            if (!res) {
                debug(`Skipping ${adapter} - no request to update found`);
                continue;
            }

            if (res.issueId) {
                console.log(`Skipping ${adapter} - issue ${result[adapter].issueId} already exists`);
                continue;
            }

            debug(`will create issue for adapter ${adapter}`);

            //console.log (JSON.stringify(result));
            //return;

            // find line count
            const lines = stableFile.split('\n');

            // find line number
            let num;
            for (let i = 0; i < lines.length; i++) {
                const reg = new RegExp(`^\\s*"${adapter}":\\s{$`);
                if (reg.test(lines[i])) {
                    num = i + 1;
                    break;
                }
            }

            let body = '';

            if (res.stable.version === '0.0.0') {
                body += `# Think about adding version ${res.latest.version} to stable repository.\n`;
                body += `**Version**: stable=**${res.stable.version}** (${res.stable.old} days old) => latest=**${res.latest.version}** (${res.latest.old} days old)\n`;
                body += `**Installs**: stable=**${res.stable.installs}** (${res.stable.percent}%), latest=**${res.latest.installs}** (${res.latest.percent}%), total=**${res.installs}**\n\n`;
                body += `Click to use [developer portal](https://www.iobroker.dev/adapter/${res.owner}/ioBroker.${res.adapter}/releases)\n`;

                body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json)\n`;

                body += '\n';
                body +=
                    '**Do not close this issue manually as a new issue will be created if condition for update still exists.**\n';
                body += '\n';
                body += `Please drop a comment if any reason exists which blocks adding adapter version ${res.latest.version} to stable at this time.\n`;
                body += '\n\n';
            } else {
                body += `# Think about update stable version to ${res.latest.version}\n`;

                body += `**Version**: stable=**${res.stable.version}** (${res.stable.old} days old) => latest=**${res.latest.version}** (${res.latest.old} days old)\n`;
                body += `**Installs**: stable=**${res.stable.installs}** (${res.stable.percent}%), latest=**${res.latest.installs}** (${res.latest.percent}%), total=**${res.installs}**\n\n`;

                body += `Click to use [developer portal](https://www.iobroker.dev/adapter/${res.owner}/ioBroker.${res.adapter}/releases)\n`;
                if (num !== undefined) {
                    body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json#L${num})\n`;
                } else {
                    body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json)\n`;
                }
                body += '\n';
                body +=
                    '**Do not close this issue manually as a new issue will be created if condition for update still exists.**\n';
                body += '\n';
                body += `Please drop a comment if any reason exists which blocks updating to version ${res.latest.version} at this time.\n`;
                body += '\n\n';
            }

            body +=
                'Note: This is an automatically generated message. Feel free to contact me (@iobroker-bot) if anything seems to be incorrect!\n';
            body += '      @mcm1957 for evidence';

            console.log(
                `CREATE ISSUE for ioBroker.${adapter} [ https://www.github.com/${res.owner}/ioBroker.${res.adapter} ]:`,
            );
            let title;
            if (res.stable.version === '0.0.0') {
                title = `${TITLE_ADD} ${res.latest.version}`;
            } else {
                title = `${TITLE_UPDATE} from ${res.stable.version} to ${res.latest.version}`;
            }
            console.log(`${title}\n\n ${body}`);
            console.log(``);

            try {
                if (!opts.dry) {
                    await createIssue(res.owner, `ioBroker.${res.adapter}`, {
                        title: `${title}`,
                        body,
                    });
                    console.log(`new issue has been created`);
                } else {
                    console.log(`[DRY] would create new issue`);
                }
            } catch (e) {
                console.error(`Cannot create issue for "${res.adapter}": ${e}`);
            }
        }
    }
}

async function evaluateReleases(latest, stable, statistics) {
    const result = {};

    console.log(`checking for adapters to ADD to stable repository ...`);
    Object.keys(latest).forEach(adapter => {
        debug(`processing ioBroker.${adapter} ...`);
        if (!adapter.startsWith('_') && !stable[adapter]) {
            if (!statistics.versions[adapter]) {
                console.log(`\nWARNING: Adapter ${adapter} not yet provides statistics`);
                return;
            }

            const now = new Date();
            const latestTime = new Date(latest[adapter].versionDate);
            //const stableTime = new Date(stable[adapter].versionDate);
            //const daysDiff = Math.floor((latestTime.getTime() - stableTime.getTime()) / ONE_DAY);

            const parts = latest[adapter].meta.split('/');
            const item = {
                adapter: adapter,
                installs: statistics.adapters[adapter],
                owner: parts[3],
                latest: {
                    installs: statistics.versions[adapter][latest[adapter].version],
                    percent:
                        // eslint-disable-next-line prettier/prettier
                        Math.round( (statistics.versions[adapter][latest[adapter].version] / statistics.adapters[adapter]) * 10000 ) / 100,
                    time: latestTime,
                    version: latest[adapter].version,
                    old: Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY),
                },
                stable: {
                    installs: 0,
                    percent: 0,
                    time: null,
                    version: '0.0.0',
                    old: 0,
                },
                daysDiff: null,
                issueId: null,
            };
            //console.log(JSON.stringify(item));
            console.log(
                `\nchecking ioBroker.${adapter} [ https://github.com/${item.owner}/ioBroker.${item.adapter} ] ...`,
            );
            console.log(`    Adapter not yet listed at stable repository`);
            console.log(
                `    Version:  stable=${item.stable.version} (${item.stable.old} days old) => latest=${item.latest.version} (${item.latest.old} days old)`,
            );
            console.log(
                `    Installs: stable=${item.stable.installs} (${item.stable.percent}%), latest=${item.latest.installs} (${item.latest.percent}%), total=${item.installs}`,
            );

            // ---- CONDITIONS for stable 1-3
            if (
                // 1. if the latest version is older than 30 days
                now.getTime() - latestTime.getTime() >
                30 * ONE_DAY
            ) {
                console.log('  + should be published');
                result[adapter] = item;
            } else {
                console.log('  - too young for publishing');
            }
        }
    });

    console.log(`checking for adapters to UPDATE at stable repository ...`);
    Object.keys(stable).forEach(adapter => {
        debug(`processing ioBroker.${adapter} ...`);
        if (!adapter.startsWith('_') && stable[adapter].version !== latest[adapter].version) {
            if (!statistics.versions[adapter]) {
                console.log(`\nWARNING: Adapter ${adapter} not provide statistics`);
                return;
            }

            const now = new Date();
            const latestTime = new Date(latest[adapter].versionDate);
            const stableTime = new Date(stable[adapter].versionDate);
            const daysDiff = Math.floor((latestTime.getTime() - stableTime.getTime()) / ONE_DAY);

            const parts = latest[adapter].meta.split('/');
            const item = {
                adapter: adapter,
                installs: statistics.adapters[adapter],
                owner: parts[3],
                latest: {
                    installs: statistics.versions[adapter][latest[adapter].version],
                    percent:
                        Math.round(
                            (statistics.versions[adapter][latest[adapter].version] / statistics.adapters[adapter]) *
                                10000,
                        ) / 100,
                    time: latestTime,
                    version: latest[adapter].version,
                    old: Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY),
                },
                stable: {
                    installs: statistics.versions[adapter][stable[adapter].version],
                    percent:
                        Math.round(
                            (statistics.versions[adapter][stable[adapter].version] / statistics.adapters[adapter]) *
                                10000,
                        ) / 100,
                    time: stableTime,
                    version: stable[adapter].version,
                    old: Math.floor((now.getTime() - stableTime.getTime()) / ONE_DAY),
                },
                daysDiff,
                issueId: null,
            };

            console.log(
                `\nchecking ioBroker.${adapter} [ https://github.com/${item.owner}/ioBroker.${item.adapter} ] ...`,
            );
            console.log(
                `    Version:  stable=${item.stable.version} (${item.stable.old} days old) => latest=${item.latest.version} (${item.latest.old} days old)`,
            );
            console.log(
                `    Installs: stable=${item.stable.installs} (${item.stable.percent}%), latest=${item.latest.installs} (${item.latest.percent}%), total=${item.installs}`,
            );

            // ---- CONDITIONS for stable 1-3
            if (
                // 1. if the latest version is older than two weeks
                now.getTime() - latestTime.getTime() > 15 * ONE_DAY &&
                // 2a. If difference between the latest and the stable version is more than 1 month
                // 2b. or if the latest version is older than one month
                (daysDiff > 30 || now.getTime() - latestTime.getTime() > 30 * ONE_DAY)
            ) {
                // 3a. if the latest version is used by more than 5 percent of the users
                // 3b. or if the latest version is older 30 days
                if (item.latest.percent > 5 || now.getTime() - latestTime.getTime() > 30 * ONE_DAY) {
                    console.log('  + should be updated');
                    result[adapter] = item;
                } else {
                    console.log('  - too few users (percent limit missed)');
                }
            } else {
                console.log('  - too young for update');
            }
        }
    });
    //console.log(JSON.stringify(result));
    return result;
}

// function generateIssue(adapter, stableFile) {
//     // get open issues
//     return getGithub(`https://api.github.com/repos/${adapter.owner}/ioBroker.${adapter.adapter}/issues`)
//         .then(json => json.filter(i => i.state === 'open' && i.title.includes(TITLE)))
//         .then(issues => {
//             if (issues.length) {
//                 console.log(`Skipping ${adapter.adapter} - issue already exists`);
//             } else if (!adapter.latest.version.match(/^\d+\.\d+\.\d+$/)) {
//                 console.log(`Skipping ${adapter.adapter} - release ${adapter.latest.version} is no stable release`);
//             } else {
//                 // find line count
//                 const lines = stableFile.split('\n');
//                 // find line number
//                 let num;
//                 for (let i = 0; i < lines.length; i++) {
//                     const reg = new RegExp(`^\\s*"${adapter.adapter}":\\s{$`);
//                     if (reg.test(lines[i])) {
//                         num = i + 1;
//                         break;
//                     }
//                 }

//                 let body = '';
//                 if (adapter.stable.version === '0.0.0') {
//                     body += `# Think about adding version ${adapter.latest.version} to stable repository.\n`;
//                 } else {
//                     body += `# Think about update stable version to ${adapter.latest.version}\n`;
//                 }
//                 body += `**Version**: stable=**${adapter.stable.version}** (${adapter.stable.old} days old) => latest=**${adapter.latest.version}** (${adapter.latest.old} days old)\n`;
//                 body += `**Installs**: stable=**${adapter.stable.installs}** (${adapter.stable.percent}%), latest=**${adapter.latest.installs}** (${adapter.latest.percent}%), total=**${adapter.installs}**\n\n`;
//                 body += `Click to use [developer portal](https://www.iobroker.dev/adapter/${adapter.owner}/ioBroker.${adapter.adapter}/releases)\n`;
//                 if (num !== undefined) {
//                     body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json#L${num})\n`;
//                 } else {
//                     body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json)\n`;
//                 }
//                 body += '\n';
//                 body +=
//                     '**Do not close this issue manually as a new issue will be created if condition for update still exists.**\n';
//                 body += '\n';
//                 body += `Please drop a comment if any reason exists which blocks updating to version ${adapter.latest.version} at this time.\n`;
//                 body += '\n\n';
//                 body += 'Note: This is an automatically generated message and not personally authored by bluefox!\n';
//                 body += '      @mcm1957 for evidence';
//                 console.log(
//                     `CREATE ISSUE for ioBroker.${adapter.adapter} [ https://www.github.com/${adapter.owner}/ioBroker.${adapter.adapter} ]:`,
//                 );
//                 console.log(`${TITLE} from ${adapter.stable.version} to ${adapter.latest.version}\n\n ${body}`);
//                 console.log(``);

//                 return createIssue(adapter.owner, `ioBroker.${adapter.adapter}`, {
//                     title: `${TITLE} from ${adapter.stable.version} to ${adapter.latest.version}`,
//                     body,
//                 }).catch(e => console.error(`Cannot create issue for "${adapter.adapter}": ${e}`));
//             }
//         });
// }

// async function doIt() {
//     const latest = await getLatestRepoLive();
//     const stable = await getStableRepoLive();
//     const statistics = await getstatistics();
//     // const master = await getMasterStableAsTextFile();
//     const result = await getDiff(latest, stable, statistics);

//     // console.log(`\nchecking issues...`);
//     // await checkIssues(latest, stable, statistics, result);

//     // console.log(`\ncreating issues...`);
//     // for (const adapter of result) {
//     //     await generateIssue(adapter, master);
//     // }

//     // console.log(`\ntrigger repository checks...`);
//     // for (const adapter of result) {
//     //     await triggerRepoCheck(adapter);
//     //     console.log('waiting 60s ...');
//     //     await sleep(60000); // limit to 1 call per minute
//     // }

//     return 'done';
// }

async function main() {
    const options = {
        debug: {
            type: 'boolean',
            short: 'd',
        },
        dry: {
            type: 'boolean',
        },
        nocheck: {
            type: 'boolean',
        },
        recreate: {
            type: 'boolean',
        },
    };

    const { values, positionals } = parseArgs({ options, strict: true, allowPositionals: true });

    //console.log(JSON.stringify(values), positionals);

    opts.createIssue = values['create-issue'];
    opts.debug = values['debug'];
    opts.dry = values['dry'];
    opts.nocheck = values['nocheck'];
    opts.recreate = values['recreate'];

    if (positionals.length) {
        console.log('[ERROR] no parameters supported');
        process.exit(1);
    }

    console.log('[INFO] processing started');

    const latest = await getLatestRepoLive();
    const stable = await getStableRepoLive();
    const statistics = await getStatistics();
    const master = await getStableRepoFile();

    if (opts.recreate) {
        console.log(`\n[INFO]removing old issues...`);
        await cleanIssues(latest);
    }

    console.log(`\n[INFO]evaluate releases...`);
    const result = await evaluateReleases(latest, stable, statistics);

    console.log(`\n[INFO]checking issues...`);
    await checkIssues(latest, stable, statistics, result);

    console.log(`\n[INFO]creating new issues...`);
    await createIssues(latest, master, result);

    if (!opts.nocheck) {
        console.log(`\n[INFO]trigger repository checks...`);
        for (const adapter in result) {
            await triggerRepoCheck(adapter);
            console.log('waiting 60s ...');
            await sleep(60000); // limit to 1 call per minute
        }
    }

    console.log('[INFO] processing completed');
}

process.env.OWN_GITHUB_TOKEN = process.env.IOBBOT_GITHUB_TOKEN;
main();
