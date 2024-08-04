#!/usr/bin/env node
'use strict';

const {parseArgs} = require('node:util');

const common = require('../../lib/commonTools.js');
const github = require('../../lib/githubTools.js');
const iobroker = require('../../lib/iobrokerTools.js');
const repoChecker = require('@iobroker/repochecker');

const opts = {
    createIssue: false,
    debug: false,
    force: false
}

const ISSUE_TITLE = 'Please consider fixing issues detected by repository checker';

function debug (text){
    if (opts.debug) {
        console.log(`[DEBUG] ${text}`);
    }
}

function decorateLine(line) {
    if (line.noDecorate) {
        return line.text;
    }
    let m = line.text.match(/"npm owner add bluefox iobroker\.([-_a-z\d]+)"/);
    if (m) {
        line.text = line.text.replace(`"npm owner add bluefox iobroker.${m[1]}"`, '`npm owner add bluefox iobroker.' + m[1] + '`');
    }

    m = line.text.match(/"Manage topics"/);
    if (m) {
        line.text = line.text.replace(`"Manage topics"`, '`Manage topics`');
    }

    m = line.text.match(/"## License"/);
    if (m) {
        line.text = line.text.replace(`"## License"`, '`## License`');
    }

    m = line.text.match(/travis/);
    if (m) {
        line.text = line.text.replace(/travis/g, `[travis](https://travis-ci.com/)`);
    }

    m = line.text.match(/Travis-ci\.org/);
    if (m) {
        line.text = line.text.replace(`Travis-ci.org`, `[Travis-ci.com](https://travis-ci.com/${line.owner}/${line.adapter})`);
    }

    m = line.text.match(/ README.md/);
    if (m) {
        line.text = line.text.replace(/ README.md/g, ` [README.md](${line.link}/blob/master/README.md)`);
    }

    m = line.text.match(/ io-package\.json/);
    if (m) {
        line.text = line.text.replace(/ io-package.json/g, ` [io-package.json](${line.link}/blob/master/io-package.json)`);
    }

    m = line.text.match(/ package\.json/);
    if (m) {
        line.text = line.text.replace(/ package.json/g, ` [package.json](${line.link}/blob/master/package.json)`);
    }

    m = line.text.match(/ node_modules/);
    if (m) {
        line.text = line.text.replace(/ node_modules/g, ` [node_modules](${line.link}/tree/master/node_modules)`);
    }

    m = line.text.match(/ NPM/);
    if (m) {
        line.text = line.text.replace(/ NPM/g, ` [NPM](https://www.npmjs.com/package/${line.adapter.toLowerCase()})`);
    }

    m = line.text.match(/"iob_npm.done"/);
    if (m) {
        line.text = line.text.replace(`"iob_npm.done"`, `"[iob_npm.done](${line.link}/blob/master/iob_npm.done)"`);
    }

    m = line.text.match(/ admin\/words\.js/);
    if (m) {
        line.text = line.text.replace(` admin/words.js`, ` [admin/words.js](${line.link}/blob/master/admin/words.js)`);
    }

    m = line.text.match(/ main\.js/);
    if (m) {
        line.text = line.text.replace(` main.js`, ` [main.js](${line.link}/blob/master/main.js)`);
    }

    // line.adapter = 'ioBroker.adapter'
    if (line.adapter) {
        const shortName = line.adapter.replace('ioBroker.', '');
        if (line.text.includes(` ${shortName}.js`)) {
            line.text = line.text.replace(` ${shortName}.js`, ` [${shortName}.js](${line.link}/blob/master/${shortName}.js)`);
        }
    }

    return line.text;
}

function executeOneAdapterCheck(repoUrl) {
    debug(`executeOneAdaptercheck('${repoUrl}')`);

    return new Promise((resolve, reject) => {
        repoChecker.handler(
            {
                queryStringParameters: {
                    url: repoUrl,
                }
            },
            null,
            (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    const context = JSON.parse(data.body);

                    context.errors = context.errors.sort();
                    context.warnings = context.warnings.sort();

                    if (context.errors.length) {
                        console.log('\n\nErrors:');
                        context.errors.forEach(err => {
                            console.log(err);
                        });
                    } else {
                        console.log('\n\nNO errors encountered.');
                    }
                    if (context.warnings.length) {
                        console.log('\nWarnings:');
                        context.warnings.forEach(warn => {
                            console.log(warn);
                        });
                    } else {
                        console.log('\n\nNO warnings encountered.');
                    }
                    console.log('');

                    resolve({repoUrl, context});
                }
            });
    });
}

async function prepareIssue(data, oldIssueId) {
    debug( `prepareIssue('data',${oldIssueId})`);

    let errorsFound = false;
    let warningsFound = false;
    
    const parts = data.repoUrl.split('/');
    const adapter = parts.pop().replace('iobroker.', 'ioBroker.');
    const adapterName = adapter.split('.')[1];
    const owner = parts.pop();
    const link = `https://github.com/${owner}/${adapter}`;

    try {
        const latestSVG = await common.getUrl(`http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg`);
        data.badgeLatest = (latestSVG || '').toString().startsWith('<svg ');
    } catch (e) {
        data.badgeLatest = false;
        console.error(`Cannot get latest badge for ${adapter}: ${e}`);
    }
    try {
        const stableSVG = await common.getUrl(`http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg`);
        data.badgeStable = (stableSVG || '').toString().startsWith('<svg ');
    } catch (e) {
        data.badgeStable = false;
        console.error(`Cannot get stable badge for ${adapter}: ${e}`);
    }

    const lines = [{text: '### Notification from ioBroker Check and Service Bot', noDecorate:true}];
    lines.push({text:`Dear adapter developer,`, noDecorate: true});
    lines.push({text:``, noDecorate: true});
    lines.push({text:`I\'m the ioBroker Check and Service Bot. I\'m an automated tool processing routine tasks for the ioBroker infrastructure. ` +
        `I have recently checked the repository for your adapter _**${adapterName}**_ for common errors and appropiate suggestions to keep this adapter up to date.`, noDecorate: true});
    lines.push({text:``, noDecorate: true});
    lines.push({text:`Please see the result of the check below.`, noDecorate: true});

    lines.push({text: `\n### [${adapter}](${link})`, link, owner, adapter, noDecorate: true});

    let badges = `[![Downloads](https://img.shields.io/npm/dm/${adapter.toLowerCase()}.svg)](https://www.npmjs.com/package/${adapter.toLowerCase()}) `;
    if (data.badgeLatest) {
        badges += `![Number of Installations (latest)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg) `;
    }
    if (data.badgeStable) {
        badges += `![Number of Installations (stable)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg)`;
    }

    badges += ` - [![Test and Release](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml)`;

    lines.push({text: badges, noDecorate: true});
    lines.push({text: `[![NPM](https://nodei.co/npm/${adapter.toLowerCase()}.png?downloads=true)](https://nodei.co/npm/${adapter.toLowerCase()}/)\n`, noDecorate: true});

    if (data.context) {
        if (data.context.errors && data.context.errors.length) {
            lines.push({text: '**ERRORS:**', noDecorate: true});
            errorsFound = true;
            data.context.errors.forEach(err => lines.push({text: `- [ ] :heavy_exclamation_mark: ${err}`, link, owner, adapter}));
        } else {
            lines.push({text: ':thumbsup: No errors found', noDecorate: true});
        }

        lines.push({text: '', noDecorate: true});

        if (data.context.warnings && data.context.warnings.length) {
            lines.push({text: '**WARNINGS:**', noDecorate: true});
            warningsFound = true;
            data.context.warnings.forEach(warn => lines.push({text: `- [ ] :eyes: ${warn}`, link, owner, adapter}));
        } else {
            lines.push({text: ':thumbsup: No warnings found', noDecorate: true});
        }
    }

    lines.push({text:``, noDecorate: true});
    lines.push({text:`Please review issues reported and consider fixing them as soon as appropiate.`, noDecorate: true});

    if (errorsFound) {
        lines.push({text:``, noDecorate: true});
        lines.push({text:`**Errors** reported by repository checker should be fixed as soon as possible. `+ 
            `Some of them require a new release to be considered as fixed. `+
            `**Please note that errors reported by checker might be considered as blocking point for future updates at stable repository.**`, noDecorate: true});
    }
    if (warningsFound) {
        lines.push({text:``, noDecorate: true});
        lines.push({text:`**Warnings** reported by repository checker should be reviewed. `+ 
            `While some warnings can be considered as a suggestion and be ignored due to good reasons or a dedicated decision of the developer, `+
            `most warnings should be fixed as soon as appropiate.`, noDecorate: true});
    }

    lines.push({text:``, noDecorate: true});
    lines.push({text:`Feel free to contact me (@iobroker-bot) if you have any questions or feel that an issue is incorrectly flagged.`, noDecorate: true});
    lines.push({text:``, noDecorate: true});
    lines.push({text:`And **THANKS A LOT** for maintaining this adapter from me and all users.`, noDecorate: true});
    lines.push({text:`_Let's work together for the best user experience._`, noDecorate: true});
    lines.push({text:``, noDecorate: true});
    lines.push({text:`your`, noDecorate: true});
    lines.push({text:`_ioBroker Check and Service Bot_`, noDecorate: true});
    if (oldIssueId) {
        lines.push({text:``, noDecorate: true});
        lines.push({text:`Note: This issue replaces issue #${oldIssueId}`, noDecorate: true});
    }
    lines.push({text:``, noDecorate: true});
    lines.push({text:`@mcm1957 for evidence`, noDecorate: true});

    // decorate
    let bodyText = lines.map(line => decorateLine(line)).join('\n');

    debug('');
    debug(bodyText);

    return (bodyText);
}

async function getOldIssues(owner, repo) {
    debug(`getOldIssues('${owner}', '${repo}')`);

    let issues = await github.getAllIssues(owner, repo);
    if (!issues) issues = [];
    issues = issues.filter(i => i.state === 'open' && i.title.includes(ISSUE_TITLE));
    return issues;
}

async function closeIssue (owner, repo, id, reason) {
    debug(`closeIssue('${owner}', '${repo}', ${id}, ${reason})`);

    const oldComments = await github.getAllComments(owner, repo, id);
    let exists = oldComments && oldComments.find(comment => comment.body.includes('This issue can be closed.'));
    if (!exists) {
        const comment = `${reason}  \n` +
            `This issue can be closed.  \n  \n` +
            `your  \n` +
            `_ioBroker Check and Service Bot_\n`;

        await github.addComment(owner, repo, id, comment);
    };

    await github.closeIssue(owner, repo, id);
    debug(`issue ${id} has been closed`);
}

async function cleanupOldIssues( owner, repo, issues ) {
    debug(`closeIssues('${owner}', '${repo}', ${issues.length})`);
    if (issues.length > 1) {
        for (const issue of issues) {
            const issueId = issue.number;
            if (issueId === issues[0].number) continue;
            await closeIssue(owner, repo, issueId, 'This issue is outdated as newer issues exist.');
        }    
    }
}

async function createNewIssue(owner, repo, data, oldIssueId ) {
    debug(`createNewIssues('${owner}', '${repo}', 'data', ${oldIssueId})`);

    const body = await prepareIssue(data, oldIssueId);

    const response = await github.createIssue( owner, repo, { 
        title: ISSUE_TITLE,
        body: body});
        
    const id = response.url.split('/').pop();
    debug(`new issue  created with id ${id}`);
    return id;
}

async function getOldErrors(owner, repo, id) {
    debug(`getOldErrors('${owner}', '${repo}', ${id})`);

    const issue = await github.getIssue(owner, repo, id);

    const lines = issue.body.split('\n');
    let remarks = [];
    lines.forEach(line => {
        let m = line.match(/\[([EW]\d\d\d)\]/);
        if (m) {
            remarks.push(m[1]);
        };
    });
    remarks = remarks.sort();
    //console.log (remarks.join(', '));

    return remarks;
}

async function getNewErrors(owner, repo, data) {
    debug(`getNewErrors('${owner}', '${repo}', 'data'')`);

    let remarks = [];
    
    if (data.context) {
        if (data.context.errors && data.context.errors.length) {
            data.context.errors.forEach(err => remarks.push(err.substring(1,5)));
        }

        if (data.context.warnings && data.context.warnings.length) {
            data.context.warnings.forEach(warn => remarks.push(warn.substring(1,5)));
        }
    }
    remarks = remarks.sort();
    //console.log (remarks.join(', '));

    return remarks;
}

async function main() {
    const options = {
        'create-issue': {
            type: 'boolean',
            short: 'c',
        },
        'debug': {
            type: 'boolean',
            short: 'd',
        },
        'force': {
            type: 'boolean',
            short: 'f',
        },
    };

    const {
        values,
        positionals,
            } = parseArgs({ options, strict:true, allowPositionals:true,  });

    //console.log(values, positionals);

    opts.createIssue = values['create-issue'];
    opts.debug = values['debug'];
    opts.force = values['force'];

    if (positionals.length != 1) {
        console.log ('[ERROR] Please specify exactly one repository');
        process.exit (1);
    }

    let repoUrl = positionals[0];
    if (!repoUrl.toLowerCase().includes('github.com')) {
        repoUrl =  `https://github.com/${repoUrl}`
    }
    const owner = iobroker.getOwner(repoUrl);
    const adapter = iobroker.getAdapterName(repoUrl);
    const repo = `ioBroker.${adapter}`;           

    console.log(`[INFO] processing ${repoUrl}`);

    const data = await executeOneAdapterCheck(repoUrl);

    // check if older issues exists
    let issues = await getOldIssues(owner, repo);
    issues = issues.filter(i => i.state === 'open' && i.title.includes(ISSUE_TITLE));
    const oldIssueId = issues[0]?.number || 0;
    debug(`detected existing issue ${oldIssueId}`);

    // if more than one issue exists close older ones
    await cleanupOldIssues( owner, repo, issues);

    // if no errors or warning exists close old Issue
    if (!data.context.errors.length && !data.context.warnings.length && oldIssueId) {
        closeIssue(owner, repo, id, 'All issues reported earlier seem to be fixed now. \nTHANKS for your support.');
    }

    // check if list of issues has been changed
    const newErrors = await getNewErrors(owner, repo, data);
    const fatalError = newErrors.includes('E000') || newErrors.includes('E999');
    let newIssueRequired = !fatalError && ((newErrors.length && !oldIssueId) || opts.force) ;

    if (oldIssueId && !fatalError) {
        const oldErrors = await getOldErrors(owner, repo, oldIssueId);
        if (oldErrors.length != newErrors.length) {
            newIssueRequired = true;
        } else {
            for (let ii = 0; ii < oldErrors.length; ii++) {
                if (oldErrors[ii] !== newErrors[ii]) {
                    newIssueRequired = true;
                }
            }
        }
    }

    // create new issue if required
    let newIssueId = 0;
    if (fatalError) {
        console.log(`[ERROR] some serious error occured during checking - no issue created`);
    } else if (newIssueRequired) {
        newIssueId = await createNewIssue( owner, repo, data, oldIssueId);
        console.log(`[INFO] new issue ${newIssueId} created`);
    } else if (!newErrors.length) {
        console.log(`[INFO] no error or warning detected - no issue created`);
    } else {
        console.log(`[INFO] existing issue ${oldIssueId} still valid`);
    }

    // close old issueId if new issue has been created
    if (newIssueId && oldIssueId ) {
        await closeIssue(owner, repo, oldIssueId, `This issue has been replaced by new isse #${newIssueId}`);
        console.log(`[INFO] outdated issue ${oldIssueId} closed`);
    }

}

process.env.OWN_GITHUB_TOKEN = process.env.IOBBOT_GITHUB_TOKEN;
main();
