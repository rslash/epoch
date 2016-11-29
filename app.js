"use strict";
const DEBUG = 1

const Discord = require("discord.js")
const settings = require("./settings.json")
const client = new Discord.Client();
var htmltable = require("tabletojson")
var request = require("request")
var fs = require("fs")
var jfs = require("jsonfile")
var tform = require("dateformat")

var teams = []
var PAUSECHECKER = true
var checkerStarted = false
var streamChecker

function WikiTeamList(){
tlog("wikiTeamList")
	teams = []
	htmltable.convertUrl("http://bs1.wikidot.com/streams", (htable)=> {
		htable = htable[htable.length-1]
		tlog(htable)
		for (var iq = 1; iq < htable.length; iq++){ 	//index start at 1 to skip header row
			if (client.channels.get(htable[iq][2].split(",")[0].trim()) != undefined){
				teams.push(new Team(htable[iq][0].trim(), htable[iq][1].trim(), htable[iq][2].trim())) //site, tags, chan
			} 
//			else if (DEBUG = 1) teams.push(new Team(htable[iq][0].trim(), htable[iq][1].trim(), settings.debugchannel))
		}
		if (!checkerStarted) {
			checkerStarted = true
			streamChecker = new StreamChecker()
		}
	})
}

function Team(url, tagstring, chanstring){
	this.tags = tagstring.trim() 	//split and trimmed in Stream object
	tlog(this.tags)
	this.chans = chanstring.trim()
	tlog(this.chans)
	this.url = url.trim()
	this.streams = []
	
	this.wikiStreamList = () => {
		this.streams = []
		htmltable.convertUrl(this.url, (htable)=> {			
			htable = htable[htable.length-1]
			let ii = htable.length
			for (var ip = 1; ip < ii; ip++){ 	//index start at 1 to skip header row
				this.streams.push(new Stream(htable[ip][0], htable[ip][1], this.tags, this.chans))
//				tlog("wikistreamlist new stream")
				
			}
		})
		PAUSECHECKER = false
	}
	this.wikiStreamList()
}

function Stream(nick, url, tagstr, chanstr){
	this.nick = nick
	this.url = url.toLowerCase()
	this.tags = tagstr.split(",")
		for (var t = 0; t < this.tags.length; t++) this.tags[t] = this.tags[t].trim()
	this.chans = chanstr.split(",")
		for (var c = 0; c < this.chans.length; c++) this.chans[c] = this.chans[c].trim()

	this.stat = {"online":"","game":"","title":"","fps":"","error":""}
	this.newstat = {"online":"","game":"","title":"","fps":"","error":""}

	this.handle = this.url.slice(this.url.lastIndexOf("/") + 1)
	if (this.url.indexOf("twitch.tv") != -1){
		this.site = "twitch"
	} else {
		this.site = ((this.url.indexOf("hitbox.tv") != -1) ? "hitbox" : "beam")
	}
	
	this.checkStatus = () => {
		switch (this.site)
		{
		case "twitch":
			request(`https://api.twitch.tv/kraken/streams/${this.handle}?client_id=67w6z9i09xv2uoojdm9l0wsyph4hxo6`, (err, response, body) => {
				if (!err && response.statusCode == 200){
					body = JSON.parse(body)
					if (body.stream != null){
						this.newstat = {
							online : true,
							title : body.stream.channel.status || "(no title)",
							game : body.stream.game || "(no game)",
							fps : `at ${Number(body.stream.average_fps).toPrecision(4)}fps`,
							error : false
						}
						this.announce()
tlog(this.nick+" is online")
					}
					this.copyStat()
				} 
			})
			break
		case "hitbox":
			request(`https://api.hitbox.tv/media/live/${this.handle}`, (err, response, body) => {
				if (!err && response.statusCode == 200){
					body = JSON.parse(body)
					if (body.livestream != undefined && body.livestream[0].media_is_live != "0"){
						this.newstat = {
							online : true,
							title : body.livestream[0].media_status || "(no title)",
							game : body.livestream[0].category_name || "(no game)",
							fps : "",
							error : false
						}
						this.announce()
					}
					this.copyStat()	
				} 
			})
			break
		case "beam":
			request(`https://beam.pro/api/v1/channels/${this.handle}`, (err, response, body) => {
				if (!err && response.statusCode == 200){
					body = JSON.parse(body)
					if (body.online != false){
						this.newstat = {
							online : true,
							title : body.name || "(no title)",
							game : body.type.name || "(no game)",
							fps: "",
							error: false
						}
						this.announce()
					}
					this.copyStat()
				} 
			})
			break
		default: 
			this.newstat.error = true
		}
	}
	
	this.announce = () => {
		for (var jp = 0; jp < this.tags.length; jp++){
			if (this.newstat.title.toLowerCase().indexOf(this.tags[jp].toLowerCase()) != -1 || 
			  this.newstat.game.toLowerCase().indexOf(this.tags[jp].toLowerCase()) != -1){
				if (this.stat.online != true ||  	//post if channel newly online, 
				  this.stat.game != this.newstat.game || this.stat.title != this.newstat.title){
					tlog("**"+this.tags[jp]+"**: "+this.nick+" is streaming "+this.newstat.game+this.newstat.fps)
					clog("```"+this.newstat.title+" "+this.url+"```")

					let mainTag = ` **${(jp != 0) ? this.tags[jp] : "LIVE"}:** `
					let riderTag = ` **${this.tags[jp]}:** `
					let newmsg = ` ${this.nick} is streaming \`${this.newstat.game}\` ${this.newstat.fps} ` + 
						  "\n" + `\`${this.newstat.title}\` <${this.url}>`

					for (var ch = 0; ch < this.chans.length; ch++){
						try {
							if (DEBUG == 0) client.channels.get(settings.debugchannel).sendMessage((ch == 0 ? mainTag : riderTag) + newmsg)
							else client.channels.get(this.chans[ch]).sendMessage((ch == 0 ? mainTag : riderTag) + newmsg)
						} catch (e){}
					}
					break
				}
			}
		}
	}
	this.copyStat = () => {this.stat = this.newstat}
}

function StreamChecker(){
	var T_index = 0
	var st_index = 0
	
	this.intervalset = () => {
		setInterval(() => {
		  if (!PAUSECHECKER) {
			try {
				teams[T_index].streams[st_index].checkStatus()
//			clog(T_index+","+st_index+","+teams[T_index].streams[st_index].tags)
					st_index++
				if (st_index >= teams[T_index].streams.length){
					st_index = 0
					T_index++
					if (T_index >= teams.length){
						T_index = 0
					}
				}
			} catch(e){	
//				tlog("checkStreams failed")	
				if (T_index != 0 || st_index != 0){
//					client.channels.get(settings.debugchannel).sendMessage("checkStreams failed")
				}
			}
		  }
		}, 200 )
	}
	this.intervalset()
}

var lastEditDate = ""
function WikiChangeWatcher(){
	setInterval(() => {
		htmltable.convertUrl("http://bs1.wikidot.com/system:recent-changes", (htable)=> {
			htable = htable[htable.length-1]
			if (htable[0][3] != lastEditDate){
				if (htable[0][4].indexOf("redslash") == -1 || lastEditDate == ""){
					client.channels.get(settings.debugchannel).sendMessage(`Last edit by ${htable[0][4]}`)
				}
				lastEditDate = htable[0][3]
tlog("WikiChangeWatcher started")
			}
		})	
	}, 60*1000 )
}

var allReady = false
client.on("ready", () => {
	tlog("Streambot online?");
	if (!allReady){
		WikiTeamList()
		WikiChangeWatcher()
		allReady = true
	}
	client.channels.get(settings.debugchannel).sendMessage("Bot restarted.")
})

client.on("message", message => {
	if (message.content === "!ping"){
		message.channel.sendMessage("pong!");
	} 
	else if (message.content === "!status"){
		let not = (PAUSECHECKER ? "not " : "")
		message.channel.sendMessage(`Stream check is ${not}active.`);
	} 
	else if (message.content.startsWith("!streams")){
		let mymsg = reloadStreams(message.channel.id)
		if (mymsg != ""){
			message.channel.sendMessage(`Loading this channel's lists: ${mymsg}`)
		} else message.channel.sendMessage(`No streams linked to this channel.`)
	}
	else if (message.content.startsWith("!teams")){
//		if (message.author.id == settings.botowner) reloadTeams()
//		message.channel.sendMessage(`Streambot reloaded.`)
	}
	else if (message.content.startsWith("!help")){
		message.channel.sendMessage("Load this channel's streams: `!streams` \n")// \nSee code: !epoch")
	} 
	else if (message.content.startsWith("!logs")){
		if (message.channel.type == "text"){
			let args = message.content.split(" ")
			let limit = 0
			if (args.length > 1) {
				if (args[1] > 0 ) limit = args[1]
			}
			if (message.author.id == settings.botowner){
				fs.writeFileSync(message.guild.name+"_"+message.channel.name+"-0.log","")
				new Log(message, 0, limit)
			} else message.channel.sendMessage("Ask Red to do this, thanks. :>")
		}
	} 
	else if (message.content.startsWith("!slap")){
		let args = message.content.split(" ")
		if (args.length > 1) {
			htmltable.convertUrl("http://bs1.wikidot.com/moves", (htable)=> {
				htable = htable[htable.length-1]
				let rand = htable[Math.floor( Math.random()*(htable.length-1) )+1][0]
				let target = (message.author.id == "89084521336541184" ? "CronoKirby" : args[1])
				message.channel.sendMessage(`Epoch uses **${rand}** on ${target}`)
			})
		}
	} 
	else if (message.content.startsWith("??")){
	} 
});

client.login(settings.token)


function reloadTeams(){
	PAUSECHECKER = true
	WikiTeamList()
}	
function reloadStreams(id){
	let mainMatch = ""
	let riderMatch = ""
	for (var y = 0; y < teams.length; y++){
		if (teams[y].chans.startsWith(id)){
			PAUSECHECKER = true
			mainMatch += "\n<" + teams[y].url + "> (" + teams[y].tags + ")"
			teams[y].wikiStreamList()
		} else if (teams[y].chans.indexOf(id) != -1) {
			riderMatch += "\n<" + teams[y].url + "> (" + teams[y].tags + ")"
		}
	}
	if (riderMatch != ""){
		mainMatch += "\nSecondary lists (not reloaded):" + riderMatch
	}
	return mainMatch
}

function Log(message, file, limit){
	this.fileNo = file
	this.lastMsg = message
	this.limit = limit

	setTimeout( () => {
		this.lastMsg.channel.fetchMessages({before: this.lastMsg.id, limit: 100})
		.then(messages => {
			tlog(`Received ${messages.size} messages`)
			let str = ""
			let earlierLine = ""
			let msgKeys = messages.keyArray()
			for (var [key, msg] of messages){
				earlierLine = `[${tform(msg.createdAt,"yyyy-mm-dd HH:MM:ss")}] ${msg.author.username}: ${msg.content}`
				for (var [key, att] of msg.attachments){
					if (att.url) earlierLine += ` ${att.url} (${att.filename}, ${Math.ceil(att.filesize/1024)}KB)` //proxy_url??
				}
				if (msg.editedTimeStamp) earlierLine += ` ${tform(msg.editedTimeStamp,"yyyy-mm-dd HH:MM:ss")}` + "\n"
				earlierLine += "\n"

				this.lastMsg = msg
				str = earlierLine + str
			}
//			clog(str)

			this.filename = this.lastMsg.guild.name+"_"+this.lastMsg.channel.name+"-"
			let continueLogging = true
			
			let filesize = fs.statSync(this.filename+this.fileNo+".log").size
			if ( filesize > 500000) {
				if (DEBUG == 0) this.lastMsg.channel.sendFile(this.filename+this.fileNo+".log")
				else this.lastMsg.channel.sendMessage(`${this.filename}`+`${this.fileNo}.log (${Math.ceil(filesize/1024)}KB)`)
				this.fileNo++
				if (this.fileNo >= this.limit) {
					continueLogging = false
				}
			} else {
				let logcontent = fs.readFileSync(this.filename+this.fileNo+".log")
				str += logcontent
			}
			
			if (continueLogging) {
				fs.writeFileSync(this.filename+this.fileNo+".log",str)
	
				if (messages.size == 100){
					new Log(this.lastMsg, this.fileNo)
				} else {
					if (DEBUG == 0) this.lastMsg.channel.sendFile(this.filename+this.fileNo+".log")
					else this.lastMsg.channel.sendMessage(`${this.filename}`+`${this.fileNo}.log (${Math.ceil(filesize/1024)}KB)`)
				}
			}
		}).catch(console.error)
	},1000)
}

function clog(s){console.log(s)}
function tlog(s){
	console.log(tform(new Date(), "HH:MM:ss"))
	console.log(s)
}