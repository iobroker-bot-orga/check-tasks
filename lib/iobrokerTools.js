#!/usr/bin/env node

const axios = require('axios');

// disable axios caching
axios.defaults.headers = {
    Authorization: process.env.IOBBOT_GITHUB_TOKEN ? `token ${process.env.IOBBOT_GITHUB_TOKEN}` : 'none',
    'user-agent': 'Action script',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
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
    if (!context.adapters) {
        await getLatestRepoLive();
        const adapters = {};
        for (const adapter in context.latestRepoLive) {
            if (adapter === '_repoInfo') {
                continue;
            }
            //"meta": "https://raw.githubusercontent.com/ioBroker/ioBroker.js-controller/master/packages/controller/io-package.json
            const meta = context.latestRepoLive[adapter].meta;
            if (!meta) {
                console.log(`warning: adapter ${adapter} does not specify 'meta' attribute`);
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
}

async function getAdapterUrls() {
    if (!context.adapterUrls) {
        const adapterUrls = [];
        const adapters = await getAdapters();
        for (const adapter in adapters) {
            console.log(`adding ${adapters[adapter].githubUrl}`);
            adapterUrls.push(adapters[adapter].githubUrl);
        }
        context.adapterUrls = adapterUrls;
    }
    return context.adapterUrls;
}

async function getLatestRepoLive() {
    if (!context.latestRepoLive) {
        try {
            const url = 'http://repo.iobroker.live/sources-dist-latest.json';
            console.log(`retrieving "${url}"`);
            const _response = await axios(url);
            const body = _response.data;
            if (body) {
                context.latestRepoLive = body;
            } else {
                console.log('Error: cannot download "${url}"');
                throw 'Cannot download "${url}"';
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"');
            throw e;
        }
    }
    return context.latestRepoLive;
}

async function getLatestRepoFile() {
    if (!context.LatestRepoFile) {
        try {
            const url = 'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json';
            console.log(`retrieving "${url}"`);
            const _response = await axios(url, { transformResponse: x => x });
            const body = _response.data;
            if (body) {
                context.latestRepoFile = body;
            } else {
                console.log('Error: cannot download "${url}"');
                throw 'Cannot download "${url}"';
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"');
            throw e;
        }
    }

    return context.latestRepoFile;
}

async function getStableRepoLive() {
    if (!context.stableRepoLive) {
        try {
            const url = 'http://repo.iobroker.live/sources-dist.json';
            console.log(`retrieving "${url}"`);
            const _response = await axios(url);
            const body = _response.data;
            if (body) {
                context.stableRepoLive = body;
            } else {
                console.log('Error: cannot download "${url}"');
                throw 'Cannot download "${url}"';
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"');
            throw e;
        }
    }

    return context.stableRepoLive;
}

async function getStableRepoFile() {
    if (!context.stableRepoFile) {
        try {
            const url =
                'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json';
            console.log(`retrieving "${url}"`);
            const _response = await axios(url, { transformResponse: x => x });
            const body = _response.data;
            if (body) {
                context.stableRepoFile = body;
            } else {
                console.log('Error: cannot download "${url}"');
                throw 'Cannot download "${url}"';
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"');
            throw e;
        }
    }

    return context.stableRepoFile;
}

async function getStatistics() {
    if (!context.statisics) {
        try {
            const url = 'https://www.iobroker.net/data/statistics.json';
            console.log(`retrieving "${url}"`);
            const _response = await axios(url);
            const body = _response.data;
            if (body) {
                context.statistics = body;
            } else {
                console.log('Error: cannot download "${url}"');
                throw 'Cannot download "${url}"';
            }
        } catch (e) {
            console.log('Error: cannot download "${url}"');
            throw e;
        }
    }

    return context.statistics;
}

exports.getAdapterName = getAdapterName;
exports.getAdapters = getAdapters;
exports.getAdapterUrls = getAdapterUrls;
exports.getLatestRepoFile = getLatestRepoFile;
exports.getLatestRepoLive = getLatestRepoLive;
exports.getOwner = getOwner;
exports.getStableRepoFile = getStableRepoFile;
exports.getStableRepoLive = getStableRepoLive;
exports.getStatistics = getStatistics;
