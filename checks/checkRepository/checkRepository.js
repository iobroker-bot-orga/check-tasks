#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
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

function decorateText(text, link, owner, adapter) {
    debug(`decorateText('${text}', ${link}', '*${owner}','${adapter}')`);

    let m = text.match(/"npm owner add bluefox iobroker\.([-_a-z\d]+)"/);
    if (m) {
        text = text.replace(`"npm owner add bluefox iobroker.${m[1]}"`, '`npm owner add bluefox iobroker.' + m[1] + '`');
    }

    m = text.match(/"Manage topics"/);
    if (m) {
        text = text.replace(`"Manage topics"`, '`Manage topics`');
    }

    m = text.match(/"## License"/);
    if (m) {
        text = text.replace(`"## License"`, '`## License`');
    }

    m = text.match(/travis/);
    if (m) {
        text = text.replace(/travis/g, `[travis](https://travis-ci.com/)`);
    }

    m = text.match(/Travis-ci\.org/);
    if (m) {
        text = text.replace(`Travis-ci.org`, `[Travis-ci.com](https://travis-ci.com/${owner}/${adapter})`);
    }

    m = text.match(/ README.md/);
    if (m) {
        text = text.replace(/ README.md/g, ` [README.md](${link}/blob/master/README.md)`);
    }

    m = text.match(/ io-package\.json/);
    if (m) {
        text = text.replace(/ io-package.json/g, ` [io-package.json](${link}/blob/master/io-package.json)`);
    }

    m = text.match(/ package\.json/);
    if (m) {
        text = text.replace(/ package.json/g, ` [package.json](${link}/blob/master/package.json)`);
    }

    m = text.match(/ node_modules/);
    if (m) {
        text = text.replace(/ node_modules/g, ` [node_modules](${link}/tree/master/node_modules)`);
    }

    m = text.match(/ NPM/);
    if (m) {
        text = text.replace(/ NPM/g, ` [NPM](https://www.npmjs.com/package/${adapter.toLowerCase()})`);
    }

    m = text.match(/"iob_npm.done"/);
    if (m) {
        text = text.replace(`"iob_npm.done"`, `"[iob_npm.done](${link}/blob/master/iob_npm.done)"`);
    }

    m = text.match(/ admin\/words\.js/);
    if (m) {
        text = text.replace(` admin/words.js`, ` [admin/words.js](${link}/blob/master/admin/words.js)`);
    }

    m = text.match(/ main\.js/);
    if (m) {
        text = text.replace(` main.js`, ` [main.js](${link}/blob/master/main.js)`);
    }

//    // line.adapter = 'ioBroker.adapter'
//    if (line.adapter) {
//        const shortName = line.adapter.replace('ioBroker.', '');
//        if (text.includes(` ${shortName}.js`)) {
//            text = text.replace(` ${shortName}.js`, ` [${shortName}.js](${link}/blob/master/${shortName}.js)`);
//        }
//    }

    return text;
}

function decorateData(data) {
    debug(`decorateData('data')`);

    const parts = data.repoUrl.split('/');
    const adapter = parts.pop().replace('iobroker.', 'ioBroker.');
    const adapterName = adapter.split('.')[1];
    const owner = parts.pop();
    const link = `https://github.com/${owner}/${adapter}`;

    if (data.context) {
        for ( let ii=0; data.context.errors && (ii < data.context.errors.length); ii++) {
            data.context.errors[ii] = decorateText(data.context.errors[ii], link, owner, adapter);
        }

        for ( let ii=0; data.context.warnings && (ii < data.context.warnings.length); ii++) {
            data.context.warnings[ii] = decorateText(data.context.warnings[ii], link, owner, adapter);
        };

        for ( let ii=0; data.context.suggestions && (ii < data.context.suggestions.length); ii++) {
            data.context.suggestions[ii] = decorateText(data.context.suggestions[ii], link, owner, adapter);
        };
    }
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
                    context.suggestions = context.warnings.sort().filter(msg=>msg.startsWith('[S'));
                    context.warnings = context.warnings.sort().filter(msg=>!msg.startsWith('[S'));

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
                    if (context.suggestions.length) {
                        console.log('\nSuggestions:');
                        context.warnings.forEach(suggestion => {
                            console.log(suggestion);
                        });
                    } else {
                        console.log('\n\nNO suggestions encountered.');
                    }
                    console.log('');

                    resolve({repoUrl, context});
                }
            });
    });
}

async function createStatistics(data, issueTable) {
    debug( `createStatistics('data', 'issueTable')`);

    const parts = data.repoUrl.split('/');
    const adapter = parts.pop().replace('iobroker.', 'ioBroker.');
    const adapterName = adapter.split('.')[1];
    const owner = parts.pop();
    const link = `https://github.com/${owner}/${adapter}`;
 
    const statistics = {};
    for ( let issue of Object.keys(issueTable).sort()) {
        const m = issue.match(/\[[EWS](\d\d\d)\]/);
        if (m) {
            debug(`register issue ${m[1]}`);
            const num = m[1];
            statistics[num]={};
            statistics[num].issue=issue;
            statistics[num].adapter=`${owner}/${adapter}`; 
            const now = new Date(Date.now());           
            statistics[num].timestamp=`${now.toUTCString()}`;            
        } else {
            console.log (`could not parse issue ${issue}`);
        }
    }

    const filename = `statistics/${adapter}.json`;
    console.log(`[INFO] saving statistics to ${filename}`);
    fs.writeFile(filename, JSON.stringify(statistics), err => {
        if (err) {
            console.error(err);
        }
    });

    return;
}
async function prepareIssue(data, issueTable, oldIssueId) {
    debug( `prepareIssue('issueTable',${oldIssueId})`);

    let errorsFound = false;
    let warningsFound = false;
    let suggestionsFound = false;
    
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

    const lines = ['## Notification from ioBroker Check and Service Bot'];
    lines.push(`Dear adapter developer,`);
    lines.push(``);
    lines.push(`I\'m the ioBroker Check and Service Bot. I\'m an automated tool processing routine tasks for the ioBroker infrastructure. ` +
        `I have recently checked the repository for your adapter _**${adapterName}**_ for common errors and appropiate suggestions to keep this adapter up to date.`);
    lines.push(``);
    lines.push('### This check is based on the current head revisions (master / main  branch) of the adapter repository');
    lines.push('');
    lines.push(`Please see the result of the check below.`);

    lines.push( `\n### [${adapter}](${link})`);

    let badges = `[![Downloads](https://img.shields.io/npm/dm/${adapter.toLowerCase()}.svg)](https://www.npmjs.com/package/${adapter.toLowerCase()}) `;
    if (data.badgeLatest) {
        badges += `![Number of Installations (latest)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg) `;
    }
    if (data.badgeStable) {
        badges += `![Number of Installations (stable)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg)`;
    }

    badges += ` - [![Test and Release](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml)`;

    lines.push(badges);
    // lines.push( `[![NPM](https://nodei.co/npm/${adapter.toLowerCase()}.png?downloads=true)](https://nodei.co/npm/${adapter.toLowerCase()}/)\n`);
    lines.push('');
 
    for ( let issue of Object.keys(issueTable).sort()) {
        if (opts.cleanup && (issueTable[issue].state === '?' || issueTable[issue].state === 'D')) continue;         
        if (issue.match(/\[(E\d\d\d)\]/)) {
            if (!errorsFound) {
                lines.push('**ERRORS:**');
                errorsFound = true;
            }            
            const flag = (issueTable[issue].state === '?' || issueTable[issue].state === 'D') ?'X':' ';         
            lines.push(`- [${flag}] :heavy_exclamation_mark: ${issue}`);
        }
    }
    if (!errorsFound) {
        lines.push(':thumbsup: No errors found');
    }
    lines.push('');

    for ( let issue of Object.keys(issueTable).sort()) {
        if (opts.cleanup && (issueTable[issue].state === '?' || issueTable[issue].state === 'D')) continue;         
        if (issue.match(/\[(W\d\d\d)\]/)) {
            if (!warningsFound) {
                lines.push('**WARNINGS:**');
                warningsFound = true;
            }
            const flag = (issueTable[issue].state === '?' || issueTable[issue].state === 'D') ?'X':' ';         
            lines.push(`- [${flag}] :eyes: ${issue}`);
        }
    }
    if (!warningsFound) {
        lines.push(':thumbsup: No warnings found');
    }
    lines.push('');
    
    for ( let issue of Object.keys(issueTable).sort()) {
        if (opts.cleanup && (issueTable[issue].state === '?' || issueTable[issue].state === 'D')) continue;         
        if (issue.match(/\[(S\d\d\d)\]/)) {
            if (!suggestionsFound) {
                lines.push('**SUGGESTIONS:**');
                suggestionsFound = true;
            } 
            const flag = (issueTable[issue].state === '?' || issueTable[issue].state === 'D') ?'X':' ';         
            lines.push(`- [${flag}] :pushpin: ${issue}`);
        }
    }
    if (!suggestionsFound) {
        lines.push(':thumbsup: No suggestions found');
    }
    lines.push('');
    
    lines.push(``);
    lines.push(`Please review issues reported and consider fixing them as soon as appropiate.`);

    if (errorsFound) {
        lines.push(``);
        lines.push(`**Errors** reported by repository checker should be fixed as soon as possible. `+ 
            `Some of them require a new release to be considered as fixed. `+
            `**Please note that errors reported by checker might be considered as blocking point for future updates at stable repository.**`);
    }
    if (warningsFound) {
        lines.push(``);
        lines.push(`**Warnings** reported by repository checker should be reviewed. `+ 
            `While some warnings can be ignored due to good reasons or a dedicated decision of the developer, `+
            `most warnings should be fixed as soon as appropiate.`);
    }
    if (suggestionsFound) {
        lines.push(``);
        lines.push(`**Suggestions** reported by repository checker should be reviewed. `+ 
            `Suggestions can be ignored due to a decision of the developer but they are reported as a hint to use a configuration ` +
            `which might get required in future or at least is used be most adapters. Suggestions are always optional to follow.`);
    }

    lines.push(``);
    lines.push(`You may start a new check or force the creation of a new issue at any time by adding the following comment to this issue:`);
    lines.push(``);
    lines.push(`\`@iobroker-bot recheck\``);
    lines.push(`or`);
    lines.push(`\`@iobroker-bot recreate\``);
    lines.push(``);
    lines.push(`Please note that I (and the server at GitHub) have always plenty of work to do. So it may last up to 30 minutes until you see a reaction. I will drop a comment here as soon as I start processing.`);
    lines.push(``);
    lines.push(`Feel free to contact me (@iobroker-bot) if you have any questions or feel that an issue is incorrectly flagged.`);
    lines.push(``);
    lines.push(`And **THANKS A LOT** for maintaining this adapter from me and all users.`);
    lines.push(`_Let's work together for the best user experience._`);
    lines.push(``);
    lines.push(`your`);
    lines.push(`_ioBroker Check and Service Bot_`);
    if (oldIssueId) {
        lines.push(``);
        lines.push(`Note: This issue replaces issue #${oldIssueId}`);
    }
    lines.push(``);
    lines.push(`@mcm1957 for evidence`);

    lines.push(``);
    const now = new Date(Date.now());
    lines.push(`Last update at ${now.toUTCString()} based on commit ${data.context.lastCommitSha}`);
    lines.push(`ioBroker.repochecker ${data.context.version}`);

    let bodyText = lines.join('\n');

    debug('');
    debug('Issue Body');
    debug(bodyText);

    return (bodyText);
}

async function prepareIssueComment(data, issueTable) {
    debug( `prepareIssueComment(data, 'issueTable')`);

    const lines = ['### This issue has been updated by ioBroker Check and Service Bot'];

    let changes = false;
    let flag = false;
    for ( const issue in issueTable) {
        if (issueTable[issue].state === '?') {
            if (!flag) {
                lines.push('**The following issues have been fixed**');
                flag = true;
                changes = true;
            }
            lines.push(`${issue}`);
        };
    }
    if (flag) {
        lines.push('');
        lines.push(':thumbsup:Thanks for fixing the issues.');
        lines.push('');
    }

    flag = false;
    for ( const issue in issueTable) {
        if (issueTable[issue].state === 'R') {
            if (!flag) {
                lines.push('**The following issues are not fixed and have been reopened**');
                flag = true;
                changes = true;
            }
            lines.push(`${issue}`)
        }        
    }
    if (flag) {
        lines.push('');
    }

    flag = false;
    for ( const issue in issueTable) {
        if (issueTable[issue].state === 'N') {
            if (!flag) {
                lines.push('**The following issues are new and have been added**');
                flag = true;
                changes = true;
            }
            lines.push(`${issue}`)
        }
    }
    if (flag) {
        lines.push('');
    }

    if (opts.recheck) {
        lines.push('RECHECK has been performed as requested.');
        if (!changes) {
            lines.push('No changes detected.');
        }
    }

    let bodyText = lines.join('\n');

    if (!changes && !opts.recheck) {
        bodyText='';
    }

    debug('');
    debug('Issue Comment');
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
            `This issue will be closed.  \n  \n` +
            `your  \n` +
            `_ioBroker Check and Service Bot_\n`;

        if (!opts.dry) {
            await github.addComment(owner, repo, id, comment);
        } else {
            console.log (`[DRY] would add comment "${comment}"`)
        }
    };

    if (!opts.dry) {
        await github.closeIssue(owner, repo, id);
        debug(`issue ${id} has been closed`);
    } else {
        console.log (`[DRY] would close issue #${id}`)
    }
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

async function createNewIssue(owner, repo, body ) {
    debug(`createNewIssues('${owner}', '${repo}', 'body')`);

    if (opts.dry) {
        console.log (`[DRY] would create new issue`)
        console.log (body);
        return 0;
    };

    const response = await github.createIssue( owner, repo, { 
        title: ISSUE_TITLE,
        body: body});
        
    const id = response.url.split('/').pop();
    debug(`new issue  created with id ${id}`);
    return id;
}

async function parseOldIssues(issueTable, owner, repo, id) {
    debug(`parseOldIssue('issuetable', '${owner}', '${repo}', ${id})`);

    const issue = await github.getIssue(owner, repo, id);

    const lines = issue.body.replace(/(\r)/gm,'').split('\n');
    lines.forEach(line => {
        let m = line.match(/^\-\s\[(.)\].+(\[[EWS]\d\d\d\].*)$/);
        if (m) {
            issueTable[m[2]]={};
            issueTable[m[2]].state=m[1]===' '?'?':'D';
        } else {
            debug(`ignored: '${line}'`)
        }
    });
    if (opts.debug) {
        for ( const issue in issueTable ) {
            console.log (`    ${issueTable[issue].state} ${issue}`); 
        }
    }

    return;
}

async function mergeNewIssues(issueTable, data) {
    debug(`mergeNewIssues('issueTable, 'data')`);

    if (data.context) {
        if (data.context.errors && data.context.errors.length) {
            data.context.errors.forEach(err => {
                if (!issueTable[err] ) {
                    issueTable[err] = {};
                    issueTable[err].state = 'N';
                } else {
                    if (issueTable[err].state === 'D') {
                        issueTable[err].state = 'R'
                    } else {
                        issueTable[err].state = 'O'
                    }
                }
            });
        };

        if (data.context.warnings && data.context.warnings.length) {
            data.context.warnings.forEach(warn => {
                if (!issueTable[warn] ) {
                    issueTable[warn] = {};
                    issueTable[warn].state = 'N';
                } else {
                    if (issueTable[warn].state === 'D') {
                        issueTable[warn].state = 'R'
                    } else {
                        issueTable[warn].state = 'O'
                    }
                }
            });
        };

        if (data.context.suggestions && data.context.suggestions.length) {
            data.context.suggestions.forEach(suggestion => {
                if (!issueTable[suggestion] ) {
                    issueTable[suggestion] = {};
                    issueTable[suggestion].state = 'N';
                } else {
                    if (issueTable[suggestion].state === 'D') {
                        issueTable[suggestion].state = 'R'
                    } else {
                        issueTable[suggestion].state = 'O'
                    }
                }
            });
        };
    }
    

    if (opts.debug) {
        for ( const issue in issueTable ) {
            console.log (`    ${issueTable[issue].state} ${issue}`); 
        }
    }

    return;
}

function checkFatalError(data) {
    debug(`checkFatalError('data')`);

    let flag = false;
    if (data.context && data.context.errors && data.context.errors.length) {
        data.context.errors.forEach(err => {
            debug(`checking ${err}`);
            if ( err.startsWith('[E000]')) flag = true;
            if ( err.startsWith('[E999]')) flag = true;
        });
    }
    debug(`${(flag?'':'no ')}fatal error detected`);
    return flag;
}

async function main() {
    const options = {
        'cleanup': {
            type: 'boolean',
        },
        'create-issue': {
            type: 'boolean',
        },
        'debug': {
            type: 'boolean',
            short: 'd',
        },
        'dry': {
            type: 'boolean',
        },
        'erroronly': {
            type: 'boolean',
            short: 'f',
        },
        // 'force': {
        //     type: 'boolean',
        //     short: 'f',
        // },
        'recheck': {
            type: 'boolean',
            short: 'f',
        },
        'recreate': {
            type: 'boolean',
            short: 'f',
        },
        'suggestions': {
            type: 'boolean',
            short: 'f',
        },
    };

    const {
        values,
        positionals,
            } = parseArgs({ options, strict:true, allowPositionals:true,  });

    //console.log(values, positionals);

    opts.cleanup = values['cleanup'];
    opts.createIssue = values['create-issue'];
    opts.debug = values['debug'];
    opts.dry = values['dry'];
    //opts.force = values['force'];
    opts.erroronly = values['erroronly'];
    opts.recheck = values['recheck'];
    opts.recreate = values['recreate'];
    opts.suggestions = values['suggestions'];

    if (positionals.length != 1) {
        console.log ('[ERROR] Please specify exactly one repository');
        process.exit (1);
    }
    if (opts.recheck && opts.recreate) {
        console.log ('[ERROR] --recheck and --recreate must not be used together');
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
    const fatalError = checkFatalError(data);
    if (fatalError) {
        console.log(`[ERROR] some serious error occured during checking - no issue processing possible`);
        process.exit (1);
    }
    decorateData(data);

    // check if older issues exists
    let issues = await getOldIssues(owner, repo);
    const oldIssueId = issues[0]?.number || 0;
    debug(`detected existing issue ${oldIssueId}`);

    // if more than one issue exists close older ones
    await cleanupOldIssues( owner, repo, issues);

    // parse existing issues and merge new ones
    const issueTable = {};
    if (!opts.recreate && oldIssueId) {
        await parseOldIssues(issueTable, owner, repo, oldIssueId);
    }
    await mergeNewIssues(issueTable, data);
    
    const haveErrors = data.context.errors && data.context.errors.length;
    const haveWarnings = data.context.warnings && data.context.warnings.length;
    const haveSuggestions = data.context.suggestions && data.context.suggestions.length;

    // prepare issue body
    const issueBody = await prepareIssue(data, issueTable, opts.recreate?oldIssueId:0);
    const issueComment = await prepareIssueComment(data, issueTable);

    // if no issue exists, create a new one, else update old one
    if (!oldIssueId) {
        if (haveErrors || (haveWarnings && !opts.erroronly) || opts.suggestions ) { 
            await createNewIssue(owner, repo, issueBody);
        } else {
            console.log(`[INFO] no issues detected`);
        }
    } else if (opts.recreate) {
        if (haveErrors || haveWarnings || haveSuggestions) {
            const newIssueId = await createNewIssue(owner, repo, issueBody);
            closeIssue(owner, repo, oldIssueId, `Issue outdated due to RECREATE request. Follow up issue #${newIssueId} has been created.`);
            console.log(`[INFO] old issue ${oldIssueId} closed due to --recreate request`);    
        } else {
            console.log(`[INFO] no issues detected`);
        }
    } else {
        if (opts.dry) {
            console.log (`[DRY] would add update issue "${oldIssueId}"`)
        } else {
            // update issue
            console.log (`[INFO] update issue ${oldIssueId}`);
            await github.updateIssue( owner, repo, oldIssueId, { 
                title: ISSUE_TITLE,
                body: issueBody});
            }

            // add comment
            if (issueComment !== '') {
                console.log (`[INFO] add comment to issue ${oldIssueId}`);
                await github.addComment(owner, repo, oldIssueId, issueComment);
            }
    }

    await createStatistics(data, issueTable);

    // if no errors, warnings or suggestions exist close old Issue
    if ( !(haveErrors || haveWarnings || haveSuggestions) && oldIssueId) {
        closeIssue(owner, repo, oldIssueId, 'All issues reported earlier seem to be fixed now. \nTHANKS for your support.');
        console.log(`[INFO] old issue ${oldIssueId} closed`);
    }
    console.log('[INFO] processing completed');
}

process.env.OWN_GITHUB_TOKEN = process.env.IOBBOT_GITHUB_TOKEN;
main();
