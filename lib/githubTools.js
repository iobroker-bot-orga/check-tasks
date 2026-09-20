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

function deleteComment(owner, repository, commentID) {
    //repos/:owner/:repo/issues/comments/:comment_id
    return axios
        .delete(`https://api.github.com/repos/${owner}/${repository}/issues/comments/${commentID}`, {
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

async function closeIssue(owner, adapter, id, stateReason) {
    try {
        const body = { state: 'closed' };
        if (stateReason) {
            body.state_reason = stateReason;
        }
        const _response = await axios.patch(`https://api.github.com/repos/${owner}/${adapter}/issues/${id}`, body, {
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

// Determine the date (ISO string) at which a top level property `key` first
// appeared in the JSON file `path` of repository `owner/repository`.
// Returns null if the date cannot be determined (e.g. the key is not present
// in the current version of the file). Uses a binary search over the commit
// history of the file so only a handful of api.github.com calls are required
// (the raw.githubusercontent.com content fetches do not count against the api
// rate limit).
async function getFileEntryAddedDate(owner, repository, path, key) {
    const apiBase = `https://api.github.com/repos/${owner}/${repository}/commits`;
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repository}`;

    // Explicitly set Authorization (null removes the module wide default 'none'
    // header which would otherwise be rejected by github when no token is present).
    const token = process.env.OWN_GITHUB_TOKEN || process.env.IOBBOT_GITHUB_TOKEN;
    const reqHeaders = {
        'user-agent': 'Action script',
        Authorization: token ? `token ${token}` : null,
    };

    // latest commit touching `path` at or before `untilIso` (or overall if omitted)
    async function latestCommitBefore(untilIso) {
        let url = `${apiBase}?path=${encodeURIComponent(path)}&per_page=1`;
        if (untilIso) {
            url += `&until=${encodeURIComponent(untilIso)}`;
        }
        const response = await axios(url, { headers: reqHeaders });
        if (Array.isArray(response.data) && response.data.length) {
            return {
                sha: response.data[0].sha,
                date: response.data[0].commit.committer.date,
            };
        }
        return null;
    }

    // is `key` present as a top level property of the file at commit `sha`?
    async function keyPresentAt(sha) {
        const response = await axios(`${rawBase}/${sha}/${path}`, {
            headers: reqHeaders,
            transformResponse: [],
        });
        try {
            const json = JSON.parse(response.data);
            return Object.prototype.hasOwnProperty.call(json, key);
        } catch {
            return response.data.includes(`"${key}":`);
        }
    }

    // the key must be present in the current file, otherwise no add date exists
    const head = await latestCommitBefore(null);
    if (!head || !(await keyPresentAt(head.sha))) {
        return null;
    }

    const ONE_DAY_MS = 24 * 3600 * 1000;
    let loMs = Date.parse('2014-01-01T00:00:00Z'); // before the repository existed => key absent
    let hiDate = head.date; // key known to be present here
    let hiMs = Date.parse(hiDate);

    let guard = 0;
    while (hiMs - loMs > ONE_DAY_MS && guard < 25) {
        guard++;
        const midMs = loMs + Math.floor((hiMs - loMs) / 2);
        const commit = await latestCommitBefore(new Date(midMs).toISOString());
        if (!commit) {
            // no commit touching the file before the midpoint => added later
            loMs = midMs;
            continue;
        }
        if (await keyPresentAt(commit.sha)) {
            hiDate = commit.date;
            hiMs = Date.parse(commit.date);
        } else {
            loMs = Date.parse(commit.date);
        }
    }

    return hiDate;
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
exports.getFileEntryAddedDate = getFileEntryAddedDate;
