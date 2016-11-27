"use strict";
const Discord = require("discord.js")
const settings = require("./settings.json")
const client = new Discord.Client();
var htmltable = require("tabletojson")
var request = require("request")
var fs = require("fs")
var jfs = require("jsonfile")
var tform = require("dateformat")

var invite = "https://discordapp.com/oauth2/authorize?permissions=1341643841&scope=bot&client_id=252137764638818305"
var destChanID = "252133971570327552"
var tags = ["Chrono", "Xeno", "speedrun", "race"]
var streams = []
var ip = 0
//try { streams = jfs.readFileSync("streams.txt")
//} catch (e) {
	wikiStreamList()
//}

//*
var cycle = 1
setInterval(() => {
//	tlog(streams[cycle % streams.length])
	try {
		streams[cycle % streams.length].checkStatus()
	} catch(e){	
		tlog("checkStreams failed")	
	}
	if (!(cycle % 100)) {
		jfs.writeFileSync("streams.txt",streams)
	}
	cycle++
}, 500)
//*/


function wikiStreamList(){
tlog("wikiStreamList")
	streams = []
//	request("http://bs1.wikidot.com/ct:streams", (err, response, body)=> {
//		if (!err && response.statusCode == 200){
//			var htable = htmltable.convert(body)
	htmltable.convertUrl("http://bs1.wikidot.com/ct:streams", (htable)=> {

		htable = htable[htable.length-1]
		tlog(htable.length)
		tlog(htable)

		var ii = htable.length
		for (var ip = 0; ip < ii; ip++){ 
			streams.push(new Stream(htable[ip]["0"], htable[ip]["1"]))
		}
//		} else {}
		jfs.writeFileSync("streams.txt",streams)
	})
}

function Stream(nick, url){
	this.nick = nick
	this.url = url.toLowerCase()
	this.stat = {"online":"","game":"","title":"","fps":"","error":""}
	this.newstat = {"online":"","game":"","title":"","fps":"","error":""}

	this.handle = this.url.slice(this.url.lastIndexOf("/") + 1)
	if (this.url.indexOf("twitch.tv") != -1){
		this.site = "twitch"
	} else {
		this.site = ((this.url.indexOf("hitbox.tv") != -1) ? "hitbox" : "beam")
	}
	
	this.checkStatus = () => {
//		tlog(this.nick+": checking "+this.url)
		this.newstat = {"online":false,"game":"","title":"","fps":"","error":true}

		switch (this.site)
		{
		case "twitch":
			request(`https://api.twitch.tv/kraken/streams/${this.handle}?client_id=67w6z9i09xv2uoojdm9l0wsyph4hxo6`, (err, response, body) => {
				if (!err && response.statusCode == 200){
					body = JSON.parse(body)
					if (body.stream != null){
						this.newstat = {
							online : true,
							title : body.stream.channel.status,
							game : body.stream.game,
							fps : `at ${Number(body.stream.average_fps).toPrecision(3)}fps`,
							error : false
						}
						this.announce()
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
							title : body.livestream[0].media_status,
							game : body.livestream[0].category_name,
							fps : "",
							error : false
						}
					}
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
							title : body.name,
							game : body.type.name,
							fps: "",
							error: false
						}
					}
				} 
			})
			break
		default: 
			tlog("CASE: def")
			this.newstat.error = true
		}
	}
	
	this.announce = () => {
		tlog(this.nick)
		tlog(this.newstat)
		for (var jp = 0; jp < tags.length; jp++){
			if (this.newstat.title.toLowerCase().indexOf(tags[jp].trim().toLowerCase()) != -1 || 
			  this.newstat.game.toLowerCase().indexOf(tags[jp].trim().toLowerCase()) != -1){
				if (this.stat.online != true ||  //post if channel newly online, 
				  this.stat.game != this.newstat.game || this.stat.title != this.newstat.title){
					tlog("**"+tags[jp]+"**: "+this.nick+" is streaming "+this.newstat.game+this.newstat.fps)
					tlog("```"+this.newstat.title+" "+this.url+"```")

					client.channels.get(destChanID).sendMessage(` **${tags[jp]}:**  ` +
						`${this.nick} is streaming \`${this.newstat.game}\` ${this.newstat.fps} ` + "\n" +
						`\`${this.newstat.title}\`  <${this.url}>`)
					break
				}
			}
		}
	}

	this.copyStat = () => {this.stat = this.newstat}
}


client.on("ready", () => {
	tlog("I'm Online?");
//	client.channels.get(destChanID).sendMessage("Streambot online.")
//	getLogs()
})

client.on("message", message => {
	if (message.content === "!ping"){
		message.reply("pong!");
	} 
	else if (message.content.startsWith("!streams")){
		wikiStreamList()
		client.channels.get(destChanID).sendMessage("Cleared cache and re-loaded <http://bs1.wikidot.com/ct:streams>")
	} 
	else if (message.content.startsWith("!help")){
		client.channels.get(destChanID).sendMessage("Clear cache: `!streams`")
	} 
	else if (message.content.startsWith("//")){
	} 
	else if (message.content.startsWith("??")){
	} 
});

client.login(settings.token);

/*
function getLogs(){
	var log = client.getChannelMessages(destChanID, 10)
	var str = ""
	for (var msg in log){
		str += `[${msg.createdTimeStamp}] ${msg.author}: ${msg.content}`
		var attach = msg.attachments
		for (var att in attach){
			str += ` ${att.url} (${att.filename},${att.filesize})` //proxy_url??
		}
		if (msg.editedTimeStamp) str += ` ${msg.editedTimeStamp}`
		str += "\n"
	}	
	tlog(str)
}
//*/

function tlog(s){
	console.log(tform(new Date(), "HH:MM:ss"))
	console.log(s)
}