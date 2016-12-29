//"Epoch Streambot" 20161225 Redslash

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
var streamChecker = new StreamChecker()
var statusChan
var testChan

function WikiTeamList(){
tlog("wikiTeamList")
	teams = []
	for (var [key, chan] of client.channels){
		if (chan.type == "text"){
			TryPushTeam(chan.topic, chan.id)
		}
	}
}

function TryPushTeam(t, id){
	streamChecker.Pause()
	let topic = t || ""
	let delim = [topic.indexOf("("),topic.indexOf(")[http://"),topic.indexOf("]")]
	if (delim[0] != -1 && delim[0] < delim[1] && delim[1] < delim[2]){
		let tag = topic.split("(")[1].split(")[http://")[0]
		let url = "http://" + topic.split(")[http://")[1].split("]")[0]
		
		let foundmatch = false
		for (var y = 0; y < teams.length; y++){
			try {
				if (teams[y].chans.startsWith(id)){
					teams[y] = new Team(url, tag, id)
					foundmatch = true
					break
				}
			} catch (e){}
		}
		if (!foundmatch){
			teams.push(new Team(url, tag, id))
		}
	} else { // wipe team if existed before
		for (var y = 0; y < teams.length; y++){
			try {
				if (teams[y].chans.startsWith(id)){
					teams[y] = new Team("","","")
					break
				}
			} catch (e){}
		}
	}
	streamChecker.Unpause()
}

function Team(url, tagstring, chanstring){
	this.tags = tagstring.trim() 	//split and trimmed in Stream object
tlog(this.tags)
	this.chans = chanstring.trim()
tlog(this.chans)
	this.url = url.trim()
	this.streams = []
	this.wikiTeam = []
	this.fileTeam = []

	this.wikiStreamList = () => {
tlog("wikistreamlist")
		this.wikiTeam = []
		htmltable.convertUrl(this.url, (htable)=> {
			let chancol = -1
			let nickcol = -1
			for (var subt = 0; subt < htable.length; subt++){
				for (var c = 0; htable[subt][0][c] != undefined; c++){
					if (htable[subt][0][c].toLowerCase().indexOf("nick") != -1){
						nickcol = c
					} else if (htable[subt][0][c].toLowerCase().indexOf("chan") != -1){
						chancol = c
					} else if (htable[subt][0][c].toLowerCase().indexOf("stream") != -1){
						chancol = c
					} else if (htable[subt][0][c].toLowerCase().indexOf("url") != -1){
						chancol = c
					}
				}
				if (chancol != -1){
					for (var r = 0; r < htable[subt].length; r++){
						this.wikiTeam[r] = []
						this.wikiTeam[r][1] = htable[subt][r][chancol]
						if (nickcol != -1){
							if (htable[subt][r][nickcol] != ""){
								this.wikiTeam[r][0] = htable[subt][r][nickcol]
							} else {this.wikiTeam[r][0] = htable[subt][r][chancol]}		// nick = channel if nick is empty
						} else {this.wikiTeam[r][0] = htable[subt][r][chancol]} 		// nick = channel if no nick column
					}							
				}
			}
			if (this.wikiTeam.length < 1){
				this.streams = []
			}
			
			try {
				this.fileTeam = jfs.readFileSync(this.chans+".txt", "utf8")
			} catch (e){
				jfs.writeFileSync(this.chans+".txt", this.wikiTeam)
			}
			
			if (this.streams.length < 1){
				jfs.writeFileSync(this.chans+".txt", this.wikiTeam)
				for (var ii = 1; ii < this.wikiTeam.length; ii++){ 	// index start at 1 to skip header row
					this.streams.push(new Stream(this.wikiTeam[ii][0], this.wikiTeam[ii][1], this.tags, this.chans))
				}
tlog("new streams len: " +this.streams.length)
			} else if (JSON.stringify(this.wikiTeam) != JSON.stringify(this.fileTeam)){	// cache file just saves work.. gotta check EVERY for additions/deletions
				jfs.writeFileSync(this.chans+".txt", this.wikiTeam)
				
				let wikimatch = new Array(this.wikiTeam.length)
				for (var w = 0; w < wikimatch.length; w++){
					wikimatch[w] = false
				}
				for (var s = 0; s < this.streams.length; s++){
					let streampersist = false
					try {
						for (var r = 1; r < this.wikiTeam.length; r++){
							if (this.streams[s].nick == this.wikiTeam[r][0] && this.streams[s].url == this.wikiTeam[r][1].toLowerCase()){
								streampersist = true
								wikimatch[r] = true
								break
							}
						}
					} catch (e){}
					if (!streampersist){
						this.streams[s] = null
					}
				}
				for (var r = 1; r < this.wikiTeam.length; r++){
					try {
						if (!wikimatch[r]){
							this.streams.push(new Stream(this.wikiTeam[r][0], this.wikiTeam[r][1], this.tags, this.chans))
						}
					} catch (e){}
				}
				statusChan.sendMessage(this.url + " updated")
			}
		})
	}
	this.wikiStreamList()
}

function Stream(nick, url, tagstr, chanstr){
	this.nick = nick
clog("new stream: " + this.nick)
	this.tags = tagstr.split(",")
		for (var t = 0; t < this.tags.length; t++) this.tags[t] = this.tags[t].trim()
	this.chans = chanstr.split(",")
		for (var c = 0; c < this.chans.length; c++) this.chans[c] = this.chans[c].trim()

	this.url = url.toLowerCase()  // "URL" can be in the form "twitch/bjw" or "hitbox/cfb" etc
	this.handle = (-1 == this.url.indexOf("/") ? this.url : this.url.slice(this.url.lastIndexOf("/") + 1))
	if (this.url.indexOf("hitbox") != -1){
		this.site = "hitbox.tv"
	} else if (this.url.indexOf("beam") != -1){
		this.site = "beam.pro"
	} else {this.site = "twitch.tv"}
	this.formal_url = "http://" + this.site + "/" + this.handle

	this.stat = {"online":"","game":"","title":"","fps":"","error":"","changed":"","upMin":""}
	this.newstat = this.stat  //copy of above
	this.lastonline = 0
	this.message

	this.checkStatus = () => {
//		this.newstat = {"online":"","game":"","title":"","fps":"","error":"","changed":""}
		switch (this.site)
		{
		case "twitch.tv":
			request(`https://api.twitch.tv/kraken/streams/${this.handle}?client_id=67w6z9i09xv2uoojdm9l0wsyph4hxo6`, (err, response, body) => {
				if (!err && 200 == response.statusCode){
					try {
						body = JSON.parse(body)
					} catch(e){}
					if (body.stream != null){
						this.newstat = {
							online : true,
							title : body.stream.channel.status || "[no title]",
							game : body.stream.game || "[no game]",
							fps : `at ${Number(body.stream.average_fps).toPrecision(4)}fps`,
							error : false
						}
						this.announce()
//tlog(this.nick+" is online")
					} //else if (this.stat.online) {this.offAnnounce()} 
					else {this.newstat.online = false}
					this.copyStat()
				} 
			})
			break
		case "hitbox.tv":
			request(`https://api.hitbox.tv/media/live/${this.handle}`, (err, response, body) => {
				if (!err && 200 == response.statusCode){
					try {
						body = JSON.parse(body)
					} catch(e){}
					if (body.livestream != undefined && body.livestream[0].media_is_live != "0"){
						this.newstat = {
							online : true,
							title : body.livestream[0].media_status || "[no title]",
							game : body.livestream[0].category_name || "[no game]",
							fps : "",
							error : false
						}
						this.announce()
					} //else if (this.stat.online) {this.offAnnounce()} 
					else {this.newstat.online = false}
					this.copyStat()	
				} 
			})
			break
		case "beam.pro":
			request(`https://beam.pro/api/v1/channels/${this.handle}`, (err, response, body) => {
				if (!err && 200 == response.statusCode){
					try {
						body = JSON.parse(body)
					} catch(e){}
					if (body.online != false){
						this.newstat = {
							online : true,
							title : body.name || "[no title]",
							game : body.type.name || "[no game]",
							fps: "",
							error: false
						}
						this.announce()
					} //else if (this.stat.online) {this.offAnnounce()} 
					else {this.newstat.online = false}
					this.copyStat()	
				} 
			})
			break
		default: 
			this.newstat.error = true
		}
	}
	
	this.announce = () => {
		let tagMatch = this.TagEval()
		if (tagMatch != 0){
			let now = Date.now() / 60000
			this.newstat.changed = (
				this.stat.game != this.newstat.game || 
				this.stat.title != this.newstat.title ||
				now - this.lastonline > 5  // account for small connection-drops (and I guess prevent "abuse")
			)
			this.lastonline = now
				
//			this.newstat.upMin = Math.floor((now - this.uptime)/60)
//			let upHr = Math.floor(this.newstat.upMin/60)
//			let upM = this.newstat.upMin-60*upHr
//				if (upM < 10){upM = "0" + upM}	
//			let upstring = (this.uptime != 0 ? `(${upHr} : ${upM})` : "( NEW )")
				
			let newmsg = `**${this.nick}**  ${this.IconEval()} ${this.newstat.game}` + 
					"\n" + `\`${this.newstat.title}\` \n<${this.formal_url}>`
			let destChannel = (DEBUG != 1 ? client.channels.get(this.chans[0]) : testChan)

			if (this.newstat.changed && !this.stat.changed){	//if changed (and not immediately after another change)
//				this.uptime = now
				try {
					destChannel.sendMessage(newmsg)
						.then(message => {this.message = message}).catch(console.error)
				} catch (e){}
			} else if (this.newstat.changed && this.stat.changed){	// update a new announcement if another change is made quickly
				try {
					this.message.edit(newmsg).catch(console.error)
				} catch (e){}
			}
		} else if (this.newstat.changed && this.stat.changed){		// if secondary change results in a NON-match, delete the new post
			try {
				this.message.delete().catch(console.error)
			} catch (e){}
		}
	}
/*
	this.offAnnounce = () => {
		let tagMatch = this.TagEval()
		if (tagMatch != 0){
			let upHr = Math.floor(this.stat.upMin/60)
			let newmsg = ` ${this.nick} was streaming \`${this.newstat.game}\` (${upHr} : ${this.stat.upMin-60*upHr}) ` + 
					"\n" + `\`${this.newstat.title}\` <${this.url}> `

			let destChannel = (DEBUG != 1 ? client.channels.get(this.chans[0]) : testChan)

			try {
				this.message.edit(`**ended:** ${newmsg}`).catch(console.error)
				this.message = ""
			} catch (e){}
		}
	}
//*/
	this.copyStat = () => {this.stat = this.newstat}

	this.TagEval = () => {
		let tmatch = false
		for (var tt = 0; tt < this.tags.length; tt++){
			if ( this.newstat.title.toLowerCase().indexOf(this.tags[tt].toLowerCase()) != -1	// find a match
			  || this.newstat.game.toLowerCase().indexOf(this.tags[tt].toLowerCase()) != -1){
				if (this.tags[tt].startsWith("-")){
					return 0
					break
				} else {
					tmatch = true
				}
			}
		}
		return tmatch
	}
	this.IconEval = () => {
		let icon = "▶" // :arrow_forward:
		if ( this.newstat.title.toLowerCase().indexOf("rando") != -1){
			icon = "🎲" // :game_die:
		}
		return icon
	}
}

var T_index = 0
var st_index = 0
function StreamChecker(){
	this.stopped = true

	this.Pause = () => {
		this.stopped = true
	}
	this.Unpause = () => {
		T_index = 0
		st_index = 0
		this.stopped = false
	}
	this.intervalset = () => {
		setInterval(() => {
			if (!this.stopped && teams[T_index] != null){
				try {
					teams[T_index].streams[st_index].checkStatus()
//clog(teams[T_index].streams[st_index])
					st_index++
					if (st_index >= teams[T_index].streams.length){
						st_index = 0
						T_index++
						if (T_index >= teams.length){
							T_index = 0
						}
					}
				} catch(e) {}
				T_index++
				if (T_index >= teams.length){
					T_index = 0
				}
			}
		}, 200 )
	}
	this.intervalset()
}
function WikiChangeWatcher(){
	setInterval(() => {
		for (var x = 0; x < teams.length; x++){
			try {
				teams[x].wikiStreamList()
			} catch (e){}
		}
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
	statusChan = client.channels.get(settings.statuschan)
	testChan = client.channels.get(settings.testchan)
	statusChan.sendMessage("Bot restarted.")
})
client.on("channelUpdate", (oldchan,newchan) => {
	if (oldchan.topic != newchan.topic){
		TryPushTeam(newchan.topic, newchan.id)
	}
})
client.on("message", m => {

	if (m.content.startsWith("!")){
		if (m.content === "!ping"){
			m.channel.sendMessage("pong!");
		} 
		else if (m.content.startsWith("!help")){
			m.channel.sendMessage(
				"Add  `(games and titles,-optouts)[http://yourstreams.page]`  to a channel's Topic.  " +
				"Add an HTML table to your page, with columns labeled \"stream\" (required), " +
				"and \"nick\" (nick is optional).  Streams are Twitch by default; \"hitbox/user\" & \"beam/user\" are also accepted."
			)
		}
		else if (m.content.startsWith("!/")){
			let args = m.content.split(" ")[0].split("!/")
			if (ValidPage(args[1])){
				htmltable.convertUrl("http://bs1.wikidot.com/"+args[1], (htable)=> {
					htable = htable[htable.length-1]
					let row = htable[Math.floor( Math.random()*(htable.length-1) )+1]
					let newmsg = row[0]
					for (var i = 1; row[i] != undefined; i++){
						newmsg += (" : " + row[i])
					}
					m.channel.sendMessage(newmsg)
				})
			}
		}
	}
	else if (m.content.startsWith("?")){
		let page = m.content.split(" ")[0].split("?")[1]
		if (ValidPage(page)){
			m.channel.sendMessage("http://bs1.wikidot.com/"+page)
		}
	}
});
client.login(settings.token)


function ValidPage(s){
	let charCode = (s.charCodeAt(0) < 64 ? 0 : s.charCodeAt(0)%32)
	return (charCode> 0 && charCode < 27)
}
function clog(s){console.log(s)}
function tlog(s){
	console.log(tform(new Date(), "HH:MM:ss"))
	console.log(s)
}