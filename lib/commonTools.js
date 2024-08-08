#!/usr/bin/env node

const axios = require('axios');

axios.defaults.headers = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Authorization': process.env.IOBBOT_GITHUB_TOKEN ? `token ${process.env.IOBBOT_GITHUB_TOKEN}` : 'none',
    'user-agent': 'Action script'
};

async function getUrl(url, asText, noError) {
    console.log(`Read ${url}`);
    try {
        const response = await axios(url, asText ? {transformResponse: x => x} : {})
        return response.data;
    } catch (e) {
        !noError && console.error(`Cannot get ${url}`);
        throw e;
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
  
exports.getUrl = getUrl;
exports.sleep = sleep;

