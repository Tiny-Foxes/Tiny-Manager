const path = require('path')
const fs = require('fs-extra')
const ini = require('ini-parser')
// const reposCache = require("../repos.json")
const tinyData = require('../tinyData.json')
const { Octokit } = require('@octokit/rest')
const downloadGit = require('download-git-repo')
const octokit = new Octokit()
const redirects = ini.parseFileSync(path.join(__dirname, '../movedInstall.ini'))
const compare = require('dir-compare')

/**
 *
 * @param {string} repoName - The repository name
 * @returns {string|undefined} - undefined if not found
 */
exports.customPathForRepository = (repoName) => {
  const repositoriesPaths = redirects['repositories']

  /*
  Use this when you're tool lazy to enable debug.
  console.log(
    `
    reponame: ${repoName}\n
    repositoriesPaths: ${repositoriesPaths.toString()}\n
    repositoriesPathsObjectKeys: ${Object.keys(repositoriesPaths)}\n
    length: ${Object.keys(repositoriesPaths).length}\n
    grabString: ${repositoriesPaths[repoName]}
    `
    )
    */
  if (Object.keys(repositoriesPaths).length <= 0) return undefined

  return Object.keys(repositoriesPaths).includes(repoName)
    ? repositoriesPaths[repoName]
    : undefined
}

/**
 * Converts json object into valid INI content
 * @param {object} data
 * @returns {string} - an string in valid INI format
 */
exports.jsonToIni = (data = redirects) => {
  const majorKeys = Object.keys(data)
  let iniStr = ''
  for (let i = 0; i < majorKeys.length; i++) {
    if (i === 0) {
      iniStr += `[${majorKeys[i]}]`
    } else {
      iniStr += `\n\n[${majorKeys[i]}]`
    }

    const minorKeys = Object.keys(data[majorKeys[i]])

    for (let m = 0; m < minorKeys.length; m++) {
      iniStr += `\n${minorKeys[m]}=${data[majorKeys[i]][minorKeys[m]]}`
    }
  }

  return iniStr
}
/**
 * Gets repository main branch in case it isn't master, or else an empty string.
 * @param {string} reponame The repository exact name.
 * @returns {string} - empty string if not defined.
 */
exports.repositoryBranch = (reponame) => {
  const funnyRepositories = redirects['branchs']

  console.log(
    'returning',
    Object.keys(funnyRepositories).includes(reponame)
      ? `#${funnyRepositories[reponame]}`
      : ''
  )
  return Object.keys(funnyRepositories).includes(reponame)
    ? `#${funnyRepositories[reponame]}`
    : ''
}

exports.requestListFromOrg = async (org) => {
  const requested = await octokit.repos.listForOrg({
    org,
  })

  if (requested.status !== 200) return null

  return requested.data
}

/**
 *
 * @param {object} data
 * @param {'tinyData' | 'repos'} file
 */
exports.updateData = (data, file) => {
  fs.writeFileSync(
    path.join(__dirname, `../${file}.json`),
    JSON.stringify(data, null, 4)
  )
}

/**
 *
 * @param {string} owner - The repo owner.
 * @param {string} repo - The repo name
 * @param {number} per_page - the number of commits per page
 */
exports.requestCommitsFromRepo = async (owner, repo, per_page = 1) => {
  const commit = await octokit.repos.listCommits({
    repo,
    owner,
    per_page,
  })

  if (commit.status !== 200) return null

  return commit
}

/**
 *
 * @param {string} owner
 * @param {string} repoName
 * @param {string} [installAt]
 */
exports.downloadRepo = async (owner, repoName, installAt) => {
  const downloadsPath = path.join(__dirname, `../downloaded/${repoName}`)
  let requireRemoveOldFiles = true

  if (!installAt) {
    if (!fs.existsSync(downloadsPath)) {
      requireRemoveOldFiles = false
      fs.mkdirSync(downloadsPath)
    }
  }

  const temporaryFolder = path.join(__dirname, `../temporary/${repoName}`)
  if (requireRemoveOldFiles) {
    if (!fs.existsSync(temporaryFolder)) {
      await fs.emptyDir(temporaryFolder).catch((e) => console.log(e))
    }

    downloadGit(
      `${owner}/${repoName}${this.repositoryBranch(repoName)}`,
      temporaryFolder,
      (err) => {
        if (err) {
          console.log(err)
          return
        }

        const compared = compare.compareSync(installAt, temporaryFolder)

        for (let i = 0; i < compared.diffSet.length; i++) {
          const path1 = compared.diffSet[i].path1
          const path2 = compared.diffSet[i].path2
          if ((path1 && path2) || (!path1 && path2) || (!path1 && !path2)) {

            if (i === compared.diffSet.length - 1) {
              console.log('removing temporaryFolder')
              fs.removeSync(temporaryFolder)
            }

            let n = 0;
            n = (path1 && path2) ? 0 : n
            n = (!path1 && path2) ? 1 : n
            n = (!path1 && !path2) ? 2 : n
            console.log('continuing because ', ['exists both in path1 & path 2', 'missing in path1 but has path2', 'missing everywhere'][n])
            continue
          }

          if (
            path1.includes('.git') ||
            compared.diffSet[i].name1.includes('.git')
          ) {
            continue
          }
          console.log(`Removing file ${compared.diffSet[i].name1}`)
          // Missing on path2 and should be deleted on path1
          fs.unlinkSync(`${path1}\\${compared.diffSet[i].name1}`)

          if (i === compared.diffSet.length - 1) {
            fs.removeSync(temporaryFolder)
          }
        }
      }
    )
  }

  downloadGit(
    `${owner}/${repoName}${this.repositoryBranch(repoName)}`,
    installAt || downloadsPath,
    (err) => {
      if (err) {
        console.log(err)
        return
      }
    }
  )
}

/**
 *
 * @param {string} owner - The repository owner
 * @param {object[]} orgListData
 * @param {string[]} [download] - An array of repository names that should be downlaoded.
 * @param {boolean} [onlyUpdateDownloaded] - If only repos that were downloaded should have its tinyData updated.
 * @returns {boolean}
 */
exports.udpateReposFromList = async (
  owner,
  orgListData,
  download,
  onlyUpdateDownloaded
) => {
  const downloadPath = (defaultFallback, name) => {
    if (this.customPathForRepository(name)) {
      return this.customPathForRepository(name)
    }

    if (
      tinyData.dataForRepo[name] &&
      tinyData.dataForRepo[name].downloadedAt !== ''
    ) {
      return tinyData.dataForRepo[name].downloadedAt
    }

    return defaultFallback || undefined
  }

  for (let i = 0; i < orgListData.length; i++) {
    const repo = orgListData[i]
    const commit = await this.requestCommitsFromRepo(owner, repo.name)

    if (commit === null) {
      i = orgListData.length
      continue
    }

    tinyData.updateTimestamp = Date.now()
    // console.log(tinyData.dataForRepo[repo.name] ? tinyData.dataForRepo[repo.name].downloadedAt : path.join(__dirname, '../downloaded'))
    if (download && download.includes(repo.name)) {
      await this.downloadRepo(
        owner,
        repo.name,
        downloadPath(undefined, repo.name)
      )
    }

    if (onlyUpdateDownloaded) {
      if (download.includes(repo.name)) {
        tinyData.dataForRepo[repo.name] = {
          commit: commit.data[0].sha,
          downloadedAt: downloadPath(
            path.join(__dirname, `../downloaded/${repo.name}`),
            repo.name
          ),
        }
      }

      continue
    }

    tinyData.dataForRepo[repo.name] = {
      commit: commit.data[0].sha,
      downloadedAt: downloadPath(
        path.join(__dirname, `../downloaded/${repo.name}`),
        repo.name
      ),
    }
  }

  this.updateData(tinyData, 'tinyData')
  return true
}

/**
 * Updates the repo and commits date in repos.json and tinyData.json
 * @async
 * @function
 * @param {string} org - The name of the org.
 * @returns {boolean} - false if any request failed, true if all worked.
 */
exports.main = async (org) => {
  const requested = await this.requestListFromOrg(org)

  if (requested === null) return false

  for (let i = 0; i < requested.data.length; i++) {
    await this.udpateReposFromList(requested.data)
  }

  const repoKeys = Object.keys(tinyData.dataForRepo)
  for (let i = 0; i < repoKeys.length; i++) {
    if (
      requested.data.map((r) => r.name === tinyData.dataForRepo[repoKeys[i]])
        .length === 0
    ) {
      delete tinyData.dataForRepo[repoKeys[i]]
    }
  }

  // reposCache.repos = requested.data
  // this.updateData(reposCache, 'repos')
  this.updateData(tinyData, 'tinyData')

  return true
}
