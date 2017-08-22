const Eris = require('eris')
const path = require('path')
const fs = require('fs')

const configValidator = require('./src/utils/ConfigValidator.js')
const constants = require('./src/utils/Constants.js')
const log = require('./src/plugins/Logger.js')

const config = require('./config/config.json')
const games = require('./config/games.json')

const Command = require('./src/Command.js')

configValidator.check(config, log)

const self = new Eris(config.token)
let isReady = false

self.constants = constants
self.config = config

const counts = {
  msgsGot: 0,
  msgsSent: 0,
  mentionsGot: 0,
  keywordsGot: 0
}

const commands = {
  main: {},
  aliases: {}
}

self.registerCommand = function (name, generator, options) {
  if (!name) {
    throw new Error('Kell név')
  }
  if (name.includes(' ')) {
    throw new Error('Ne legyen benne space')
  }
  if (commands.main[name]) {
    throw new Error('Már van command: ' + name)
  }
  options = options || {}
  name = name.toLowerCase()
  commands.main[name] = new Command(self, name, generator, options)
  if (options.aliases && options.aliases.length > 0) {
    options.aliases.forEach((alias) => {
      commands.aliases[alias] = name
    })
  }
  return commands.main[name]
}

self.on('messageCreate', (msg) => {
  counts.msgsGot = counts.msgsGot + 1
  if (!isReady || !msg.author) return
  if (msg.author.id !== self.user.id) return
  const prefix = self.config.prefix.replace(/@mention/g, self.user.mention)
  if (msg.content.replace(/<@!/g, '<@').startsWith(prefix)) {
    if (msg.content.length === prefix.length) return

    const args = msg.content.replace(/<@!/g, '<@').substring(prefix.length).split(' ')
    let trigger = args.shift().toLowerCase()
    trigger = commands.aliases[trigger] || trigger

    const command = commands.main[trigger]
    if (command !== undefined) {
      log.cmd(msg, self)
      setTimeout(() => self.deleteMessage(msg.channel.id, msg.id), 750)
      command.process(msg, args)
    }
    return
  }
  return
})

self.on('warn', (msg) => { if (msg.includes('Bejelentkezés')) { log.warn(msg) } })
self.on('error', (err) => log.err(err, 'Bot'))
self.on('disconnect', () => log.log('Lecsatlakozva a Discordról :3', 'HIBA'))

let avatars = []
if (config.rotateAvatarImage) {
  const dir = path.join(__dirname, 'config/avatars/')
  fs.readdir(dir, (err, files) => {
    log.fs(`Betöltés ${files.length} fájlok...`, 'Avatarok')
    if (err) return log.err(err, 'Avatar könyvtár olvasása...')
    if (!files) { return log.err('Kép nem található', 'Avatar könyvtár olvasása...') } else {
      for (let avatar of files) {
        let ext = path.extname(avatar).match(/\.png|\.jpeg|\.gif|\.jpg/)
        if (!ext) continue
        try {
          let data = fs.readFileSync(path.join(dir, avatar))
          log.fs(`Betöltve: ${avatar}`, 'Avatarok')
          avatars.push(`data:image/${ext[0].replace('.', '')};base64,` + new Buffer(data).toString('base64'))
        } catch (err) { log.err(err, 'Avatar könyvtár olvasása...') }
      }
      if (avatars.length === 0) return log.fs('Kép nem található', 'Avatarok')
      log.fs('Kész', 'Avatarok')
    }
  })
}

let cmds = {}
fs.readdir(path.join(__dirname, 'commands/'), (err, files) => {
  log.fs(`Parancs fájlok betöltése: ${files.length}...`, 'PARANCSOK')
  if (err) return log.err(err, 'Parancs-könyvtár olvasása...')
  if (!files) { log.err('Nincs parancs fájl WHAT?!', 'Parancs-könyvtár olvasása...') } else {
    for (let command of files) {
      if (path.extname(command) !== '.js') continue
      cmds = require(`./commands/${command}`)(self)
    }
    log.fs('Kész', 'Cmds')
  }
})

self.on('ready', () => {
  isReady = true
  self.commands = commands
  self.counts = counts
  log.ready(self, config)
  if (config.rotatePlayingGame && games.length > 0) {
    const stream = config.rotatePlayingGameInStreamingStatus
    log.log(`Playing tag állítása ${stream ? 'stream státusz ' : ''}every ` + (config.rotatePlayingGameTime / 1000) / 60 + ' minutes.', 'CONFIG')
    setInterval(() => {
      const game = games[~~(Math.random() * games.length)]
      self.editStatus(config.defaultStatus.toLowerCase(), stream ? {name: game, type: 1, url: 'https://www.twitch.tv/twitch'} : {name: game})
    }, config.rotatePlayingGameTime)
  }
  if (config.rotateAvatarImage && avatars.length > 0) {
    log.log('Avatár váltása minden ' + (config.rotateAvatarImageTime / 1000) / 60 + ' percben.', 'CONFIG')
    setInterval(() => {
      log.log('Avatar váltása')
      self.editSelf({avatar: avatars[Math.floor(Math.random() * avatars.length)]}).catch(err => log.err(err, 'Avatar Forgató'))
    }, config.rotateAvatarImageTime)
  }
})

require('./src/plugins/MentionStalker.js')(self, log, config)

require('./src/plugins/KeywordLogger.js')(self, log, config)

self.connect().catch(err => log.err(err, 'Login'))

process.on('SIGINT', () => { self.disconnect({reconnect: false}); setTimeout(() => process.exit(0), 1000) })

process.on('unhandledRejection', (err) => log.err(err, 'Kijelentkezve, de nincs hibakód'))
