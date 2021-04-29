const updateRepos = require('./updateRepos.js')
// const org = "Tiny-Foxes"
// const repo = "OutfoxPTBR"
console.log('Updating repos')
/*
const path = require('path')
const fs = require('fs')
*/
// updateRepos.main(org)
try {
    // The first argument is the repo owner, yes it supports repos from orgs.
    // the second argument is array of objects, each object having atleast an name property with string value, being the repository name
    // the third argument is a array of strings of repository names to download and not just update tinyData.json
    // the fourth argument is to confirm you want to download.
   updateRepos.udpateReposFromList(
        'Nepumi',
        [
            {
                name: 'MusicMemories'
            }
        ],
        ['MusicMemories'],
        true
    )
    // You'll need to manually remove content from temporary folder as its function as not finished to actually make it temporare and delete after downloading.
    // updateRepos.main(org)
} catch (e) {
  console.error(e)
}

updateRepos.jsonToIni()