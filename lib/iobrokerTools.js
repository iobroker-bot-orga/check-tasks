#!/usr/bin/env node

const axios = require('axios');

// disable axios caching
axios.defaults.headers = {
    'Authorization': process.env.IOBBOT_GITHUB_TOKEN ? `token ${process.env.IOBBOT_GITHUB_TOKEN}` : 'none',
    'user-agent': 'Action script',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0'
};

const context = {};

function getAdapterName(url) {
    /*`https://www.github.com/${user}/ioBroker.${adapter}`*/
    return url.split('/')[4].split('.')[1];
}

function getOwner(url) {
    /*`https://www.github.com/${user}/ioBroker.${adapter}`*/
    return url.split('/')[3];
}

async function getAdapters() {
    if (! context.adapters ) {
        await getLatestRepoLive();
        const adapters = {};
        for (const adapter in context.latestRepoLive) {
            if (adapter === '_repoInfo') continue;
            //"meta": "https://raw.githubusercontent.com/ioBroker/ioBroker.js-controller/master/packages/controller/io-package.json
            const meta = context.latestRepoLive[adapter].meta;
            if (!meta) {
                console.log (`warning: adapter ${adapter} does not specify 'meta' attribute`);
                continue;
            }
            const user = meta.split('/')[3];
            adapters[adapter] = {};
            adapters[adapter].githubUrl = `https://www.github.com/${user}/ioBroker.${adapter}`;
            adapters[adapter].user = user;
        }
        context.adapters = adapters;
    }
    return context.adapters;
};

async function getAdapterUrls() {
    if (! context.adapterUrls ) {
        const adapterUrls = [];
        adapters = await getAdapters();
        for (adapter in adapters) {
            console.log (`adding ${adapters[adapter].githubUrl}`)
            adapterUrls.push(adapters[adapter].githubUrl);
        }
        context.adapterUrls = adapterUrls;
    }
    return context.adapterUrls;
};

async function getLatestRepoLive() {
    if ( !context.latestRepoLive ) {
        try {
            const url = 'http://repo.iobroker.live/sources-dist-latest.json';
            console.log(`retrieving "${url}"`)
            const _response = await axios(url);
            const body = _response.data;
            if (body) {
                context.latestRepoLive = body;
            } else {
                console.log('Error: cannot download "${url}"')
                throw( 'Cannot download "${url}"' );
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"')
            throw e;
        }
    }
    return context.latestRepoLive;
};

async function getStableRepoLive() {
    if ( !context.stableRepoLive ) {
        try {
            const url = 'http://repo.iobroker.live/sources-dist.json';
            console.log(`retrieving "${url}"`)
            const _response = await axios(url);
            const body = _response.data;
            if (body) {
                context.stableRepoLive = body;
            } else {
                console.log('Error: cannot download "${url}"')
                throw( 'Cannot download "${url}"' );
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"')
            throw e;
        }
    }

    return context.stableRepoLive;
};

exports.getAdapterName = getAdapterName;
exports.getAdapters = getAdapters;
exports.getAdapterUrls = getAdapterUrls;
exports.getLatestRepoLive = getLatestRepoLive;
exports.getOwner = getOwner;
exports.getStableRepoLive = getStableRepoLive;

