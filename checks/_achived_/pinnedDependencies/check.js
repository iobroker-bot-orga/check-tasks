#!/usr/bin/env node

const github = require('../../../lib/githubTools.js');
const iobroker = require('../../../lib/iobrokerTools.js');

const context = {};

async function doCheck(repoUrl) {

    await github.init( repoUrl );
    context.package = await github.downloadFile('/package.json', false, false);    
    //console.log( JSON.stringify(context.package));

    console.log('starting check');

    const pinnedDependencies = [];
    for (const dependency in context.package.dependencies) {
        const versString = context.package.dependencies[dependency];
        if ( dependency != '@iobroker/adapter-core') continue ;
        if ( versString.startsWith('^') || versString.startsWith('~') ) continue;
        if ( versString.startsWith('>') ) continue;
        if ( versString === '*') continue;
        
        console.log(`pinned dependency "${dependency}":"${context.package.dependencies[dependency]}"`)
        pinnedDependencies.push(`"${dependency}":"${context.package.dependencies[dependency]}"`);
    }
    
    for (const dependency in context.package.devDependencies) {
        const versString = context.package.devDependencies[dependency];
        if ( dependency != '@iobroker/adapter-core') continue ;
        if ( versString.startsWith('^') || versString.startsWith('~') ) continue;
        if ( versString.startsWith('>') ) continue;
        if ( versString === '*') continue;
        
        console.log(`pinned dependency "${dependency}":"${context.package.devDependencies[dependency]}"`)
        pinnedDependencies.push(`"${dependency}":"${context.package.devDependencies[dependency]}"`);
    }

    if (pinnedDependencies.length) {
        console.log( 'check FAILED, pinned dependencies detected')
    } else {
        console.log( 'check PASSED, no pinned dependencies detected')
    }

    return pinnedDependencies;

}

async function exec() {
    let repoUrls = [];

    // Get url from parameters if possible
    if (process.argv.length > 2) {
        repoUrls = [ process.argv[2] ];
    } else {
        repoUrls = await iobroker.getAdapterUrls();
    }

    const report = [];
    for (let repoUrl of repoUrls) {
        console.log( `Checking repository ${repoUrl}` );
        const pinnedDependencies = await doCheck(repoUrl);
        if (pinnedDependencies.length) {
            const adapterName=iobroker.getAdapterName(repoUrl);
            report.push(`${adapterName}`);
            for (let pinnedDependency of pinnedDependencies) {
                report.push('    ' + pinnedDependency);
            }
            report.push ('');
        }
    }

    for (const line of report) {
        console.log(line);
    }
    return;
};

exec();

