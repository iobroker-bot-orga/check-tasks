#!/usr/bin/env node

const axios = require('axios');

axios.defaults.headers = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
    Authorization: process.env.IOBBOT_GITHUB_TOKEN ? `token ${process.env.IOBBOT_GITHUB_TOKEN}` : 'none',
    'user-agent': 'Action script',
};

const context = {};

async function init(url, branch) {
    console.log(`Init github to use ${url} / branch ${branch}`);
    context.githubUrlOriginal = url
        .replace('http://', 'https://')
        .replace('https://www.github.com', 'https://github.com')
        .replace('https://raw.githubusercontent.com/', 'https://github.com/');
    context.githubUrlApi = context.githubUrlOriginal.replace('https://github.com/', 'https://api.github.com/repos/');
    context.githubBranch = branch || null;

    try {
        const _response = await axios.get(context.githubUrlApi, { cache: false });
        context.githubApiData = _response.data;
        if (!context.githubBranch) {
            context.githubBranch = context.githubApiData.default_branch; // main vs. master
            console.log(`Branch was not defined by user - using branch: ${context.githubBranch}`);
        }

        context.githubUrl = `${context.githubUrlOriginal.replace('https://github.com', 'https://raw.githubusercontent.com')}/${context.githubBranch}`;

        console.log(`Original URL: ${context.githubUrlOriginal}`);
        console.log(`api:          ${context.githubUrlApi}`);
        console.log(`raw:          ${context.githubUrl}`);

        context.init = true;
    } catch (e) {
        console.log(`FATAL: cannot access repository ${context.githubUrlApi}`);
        throw e;
    }
}

async function getGithub(githubUrl, raw, noError) {
    const options = {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script',
        },
    };
    if (!process.env.OWN_GITHUB_TOKEN) {
        delete options.headers.Authorization;
    }
    if (raw) {
        options.transformResponse = [];
    }

    try {
        const response = await axios(githubUrl, options);
        return response.data;
    } catch (e) {
        !noError && console.error(`Cannot get ${githubUrl}`);
        throw e;
    }
}

async function downloadFile(path, binary, noError) {
    console.log(`Download ${context.githubUrl}${path || ''}`);

    if (!context.init) {
        throw 'Github tools not yet initialized';
    }

    const options = {};
    if (binary) {
        options.responseType = 'arraybuffer';
    }

    try {
        const response = await axios(context.githubUrl + (path || ''), options);
        return response.data;
    } catch (e) {
        !noError && console.error(`Cannot download ${context.githubUrl}${path || ''}`);
        throw e;
    }
}

async function addComment(owner, repository, id, body) {
    try {
        const _response = await axios.post(
            `https://api.github.com/repos/${owner}/${repository}/issues/${id}/comments`,
            { body },
            {
                headers: {
                    Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                    'user-agent': 'Action script',
                },
            },
        );
        return _response.data;
    } catch (e) {
        console.error(`error adding comment`);
        throw e;
    }
}

async function getAllComments(owner, repository, id) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    try {
        const _response = await axios(
            `https://api.github.com/repos/${owner}/${repository}/issues/${id}/comments?per_page=100`,
            {
                headers: {
                    Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                    'user-agent': 'Action script',
                },
            },
        );
        return _response.data;
    } catch (e) {
        console.error(`error adding comment`);
        throw e;
    }
}

function deleteComment(prID, commentID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios
        .delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`, {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script',
            },
        })
        .then(response => response.data);
}

function createIssue(owner, repository, json) {
    /*
    {
      "title": "Found a bug",
      "body": "I'm having a problem with this.",
      "assignees": [
        "octocat"
      ],
      "milestone": 1,
      "labels": [
        "bug"
      ]
    }
*/
    return axios
        .post(`https://api.github.com/repos/${owner}/${repository}/issues`, json, {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script',
            },
        })
        .then(response => response.data);
}

function updateIssue(owner, repository, id, json) {
    /*
    {
      "title": "Found a bug",
      "body": "I'm having a problem with this.",
      "assignees": [
        "octocat"
      ],
      "milestone": 1,
      "labels": [
        "bug"
      ]
    }
*/
    return axios
        .patch(`https://api.github.com/repos/${owner}/${repository}/issues/${id}`, json, {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script',
            },
        })
        .then(response => response.data);
}

async function getAllIssues(owner, repository) {
    let issues = await getGithub(`https://api.github.com/repos/${owner}/${repository}/issues`);
    return issues;
}

async function closeIssue(owner, adapter, id) {
    try {
        const _response = await axios.patch(
            `https://api.github.com/repos/${owner}/${adapter}/issues/${id}`,
            {
                state: 'close',
            },
            {
                headers: {
                    Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                    'user-agent': 'Action script',
                },
            },
        );
        return _response.data;
    } catch (e) {
        console.error(`error closing issue`);
        throw e;
    }
}

async function getIssue(owner, adapter, id) {
    try {
        const _response = await axios(`https://api.github.com/repos/${owner}/${adapter}/issues/${id}`, {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script',
            },
        });
        return _response.data;
    } catch (e) {
        console.error(`error closing issue`);
        throw e;
    }
}

async function getAllLabels(owner, repository, issueId) {
    let labels = await getGithub(`https://api.github.com/repos/${owner}/${repository}/issues/${issueId}/labels`);
    return labels;
}

exports.downloadFile = downloadFile;
exports.init = init;
exports.addComment = addComment;
exports.deleteComment = deleteComment;
exports.getAllComments = getAllComments;
exports.createIssue = createIssue;
exports.updateIssue = updateIssue;
exports.closeIssue = closeIssue;
exports.getIssue = getIssue;
exports.getAllIssues = getAllIssues;
exports.getAllLabels = getAllLabels;
