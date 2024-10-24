// index.js
import dotenv from 'dotenv';
dotenv.config();
import { Octokit } from "octokit";


// GitHubでmainブランチにマージされたときにRelaseNoteを自動で作りたい
// RelaseNoteを作るときに、mainブランチにマージされたコミットのコミッターとそのPullRequestがRelaseNote一覧にほしい
// イメージ
// Changes
// - fix: sort by disc/track not working if only one disc (#1854)
// - refactor: rename Extra Drawer to Side Sheet (#1853)
// これを出力するスクリプト
// GitHubActionsで使う想定 mainブランチへのpushで実行される

// 想定しているブランチ戦略
// mainブランチにはdevelopブランチからマージされる
// developブランチには各featブランチが切られてdevelopにマージされている
// マージコミットには、PullRequestへのリンクがタイトルに有るとする

const OWNER = 'koel'
const REPO = 'koel'
const BASE_BRANCH = 'master'
const GITHUB_API_VERSION = '2022-11-28'
const USER_AGENT = 'my-app/v1.2.3'

function getToken() {
    return process.env.GITHUB_ACCESS_TOKEN;
}

async function getOctokitInstance(token) {
    const octokit = new Octokit({ auth: token, userAgent: USER_AGENT, });
    // for debug
    const {
        data: { login },
    } = await octokit.rest.users.getAuthenticated();
    console.log("Hello, %s", login);
    return octokit
}


async function getPullRequests(octokit) {
    const recent_pulls = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
        owner: OWNER,
        repo: REPO,
        base: BASE_BRANCH,
        state: 'closed',
        headers: {
            'X-GitHub-Api-Version': GITHUB_API_VERSION
        }
    })
    return recent_pulls.data
}

async function checkIsMergedPullRequest(pullRequest) {
    if (pullRequest && pullRequest.merge_commit_sha) {
        return true
    }
    return false
}

async function getLatestMergedPullRequest(octokit) {
    const pulls = await getPullRequests(octokit)
    // closedでも棄却された可能性があるためマージされたかチェック
    for (const pull of pulls) {
        const isMerged = await checkIsMergedPullRequest(pull);
        if (isMerged) {
            return pull;
        }
    }

    return null; // マージされたプルリクエストが見つからなかった
}

async function getCommitsOnAPullRequest(octokit, pullRequestNumber) {
    const commits = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
        owner: OWNER,
        repo: REPO,
        pull_number: pullRequestNumber,
        headers: {
            'X-GitHub-Api-Version': GITHUB_API_VERSION
        }
    })
    return commits.data
}

async function getPullRequestsOnACommit(octokit, commit, ignorePullNumber) {
    const pulls = await octokit.request('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
        owner: OWNER,
        repo: REPO,
        commit_sha: commit.sha,
        headers: {
            'X-GitHub-Api-Version': GITHUB_API_VERSION
        }
    })
    for (const pull of pulls.data) {
        // BASEで定義しているブランチへのPRではない
        if (pull.number != ignorePullNumber) {
            return pull
        }
    }
    // 暫定でとりあえず返す
    return pulls.data[0]
}

async function run() {

    const token = await getToken()
    const octokit = await getOctokitInstance(token)

    const mergedPullRequest = await getLatestMergedPullRequest(octokit)
    const mergedCommits = await getCommitsOnAPullRequest(octokit, mergedPullRequest.number)
    const relatedPullRequest = await getPullRequestsOnACommit(octokit, mergedCommits[0], mergedPullRequest.number)
    // console.log(relatedPullRequest)
    const contents = mergedCommits.map(commit => `[${commit.author.login}](${commit.author.html_url}) commits ${commit.commit.message} in ${relatedPullRequest.html_url}`);
    console.log(contents)
}
run()
