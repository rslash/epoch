//"Epoch Streambot II" 20170914 Redslash
//http://chrono.wikidot.com/bot

"use strict";
const DEBUG = 1
const REQ_SECONDS = 25
function p(s){console.log(s)}

const Discord = require("discord.js")
const settings = require("./settings.json")
const client = new Discord.Client();
var request = require("request")
var fs = require("fs")
var jfs = require("jsonfile")
var tform = require("dateformat")

var logChanID = "338402080869842945"
var testChanID = "338402321518166016"
var debugChanID = "339995355389362177"
var logChan
var testChan
var debugChan

var TAGDELIM = ["epoch{","}"]
var PASSIVETAGDELIM = ["manual{","}"]
var new_status = {}
var saved_status = {}
	try {saved_status = jfs.readFileSync("saved_status.txt", "utf8")} catch(e){}

var base_url = "https://api.twitch.tv/kraken/streams?client_id=67w6z9i09xv2uoojdm9l0wsyph4hxo6&channel="
var MAX_URL_NAMES = 90
var MAX_URL_LENGTH = 1000
var MAX_MSG_LENGTH = 2000-200

function UpdateTwitchStatus(s_index){
	let req_url = ""
	let url_namecount = 0
	let final_req = true
	for (var s in saved_status){
		if (url_namecount < s_index){
			url_namecount++
		}
		else if (url_namecount == s_index){
			req_url = base_url + s
			url_namecount++
		} else if (url_namecount - s_index > MAX_URL_NAMES || ((req_url + "," + s).length > MAX_URL_LENGTH)){
			final_req = false
			Request(req_url,final_req,url_namecount)
			break
		} else {
			req_url += "," + s
			url_namecount++
		}
	}
	if (final_req == true){
		Request(req_url,final_req,url_namecount)
	}
}

function Request(req_url,final_req,s_index){
	request(req_url, (err, response, body) => {
		let now = Date.now()
		if (!err && 200 == response.statusCode){
			try {
				body = JSON.parse(body)
			} catch(e){}
			if (body.streams != null){
p("GOT STREAMS: "+s_index)
				for (var b in body.streams){
					let bs = body.streams[b]
					let bc = bs.channel
					new_status[bc.name] = {
						"online" : "true",
						"game" : bs.game || "no game",
						"title" : bc.status || "no title",
						"lastonline" : now
					}
if (saved_status[bc.name].online == "false") {p("NEW: "+bc.name) }
				}
			}
		}
		if (final_req == false){
			UpdateTwitchStatus(s_index)
		} else {
			for (var [key, chan] of client.channels){ //check every Discord channel
				if (chan.type == "text"){
					if (chan.topic != null){
						if (chan.topic.indexOf(TAGDELIM[0]) != -1){
							let tagstring = chan.topic.split(TAGDELIM[0])[1].split(TAGDELIM[1])[0]	
							let resp = ""
							if (DEBUG){chan = testChan}
							
							for (var s in new_status){
								if (saved_status[s].online == "false" && saved_status[s].ban != "true"){
									if (now - saved_status[s].lastonline > 5*60*1000 || saved_status[s].game != new_status[s].game){
										let ann = Announce(s,new_status[s],tagstring,chan.guild)
										if (ann != ""){
											if (resp == ""){
												resp = ann
											} else if ((resp+ann).length > MAX_MSG_LENGTH){
												chan.sendMessage(resp)
												resp = ann
											} else {
												resp += "\n" + ann
											}
										}
									}
								}
							}
							if (resp != ""){
								chan.sendMessage(resp)
							}
						}
					}
				}
			}
			for (var s in saved_status){
				if (new_status[s] == undefined){
					saved_status[s].online = "false"
				} else {
					saved_status[s] = new_status[s]
				}				
			}
			jfs.writeFileSync("saved_status.txt",saved_status)
		}
	})
}

function Announce(twitch,status,tagstring,guild){
	let tags = tagstring.split(",")
	if (tagstring == "") tags[0] = ""
	let announce = (status.ban != "true")
	if (status.title.toLowerCase().indexOf("[nosrl]") != -1){ //the global TITLE optout
			announce = false
	} else {
		for (var t in tags){	//first: find TITLE optouts
			if (tags[t].startsWith("-")){
				let opt = tags[t].split("-")[1].trim().toLowerCase()
				if (status.title.toLowerCase().indexOf(opt) != -1){
					announce = false
				}
			}
		}
	}
	let ann = ""
	if (announce != false && status.online != "false"){
		for (var t in tags){	//if NO optouts, then find GAME matches
			if (announce != false && tags[t].startsWith("-") == false){	
				let gametag = tags[t].split("=")[0].trim()
				let abbrtag = tags[t].split("=")[1] || status.game
				let icontag = abbrtag.split(">")[1] || ""
				let icon = IconEval(status.title)
				if (icontag != ""){
					icontag = icontag.trim()
					for (var [key, emoji] of guild.emojis){
						if (icontag == emoji.name){
							icon = emoji.toString()
							break
						}
					}
					abbrtag = abbrtag.split(">")[0]
					if (abbrtag.length == 0) abbrtag = status.game
				}

				if (status.game.toLowerCase().indexOf(gametag.toLowerCase()) != -1){
					ann = "**"+abbrtag.trim()+"** "+icon+" **<http://twitch.tv/"+twitch+">**"+
					"\n"+status.title+""
					break
				}
			}
		}
	}
	return ann
}

function IconEval(title){
	let icon = "▶" // :arrow_forward:
	if ( title.toLowerCase().indexOf("rando") != -1){
		icon = "🎲" // :game_die:
	}
	if ( title.toLowerCase().indexOf("[nosrl]") != -1){
		icon = "🚶" // :casual-walker:
	}
	return icon
}

setInterval(() => {
	new_status = {}
	UpdateTwitchStatus(0)
}, REQ_SECONDS*1000 )

client.on("ready", () => {
	p("Bot online");
	logChan = client.channels.get(logChanID)
	debugChan = client.channels.get(debugChanID)
	testChan = client.channels.get(testChanID)
	debugChan.sendMessage("bot restarted")
	UpdateTwitchStatus(0)
})

client.on("message", m => {
	let c = m.channel

	if (m.content === "!ping" || m.content === "!ep-ping"){
		c.sendMessage("pong, dude!")
	} else if (m.content === "!invite" || m.content === "!ep-invite"){
		c.sendMessage("Add Epoch to your server: https://goo.gl/WQeWzF")
	} else if (m.content === "!help" || m.content === "!ep" || m.content === "!ep-help"){
		c.sendMessage("http://chrono.wikidot.com/epoch")
	} else if (m.content.startsWith("!ep")){
		if (m.content.startsWith("!ep-add") && m.guild != null){
			let args = m.content.split("!ep-add")[1]
			args = args.split(",")
			let alladded = ""
			let allmatched = ""
			for (var a in args){
				args[a] = args[a].trim().toLowerCase()
				let match = false
				for (var s in saved_status){
					if (args[a] == s){
						match = true
						allmatched += s + ","
					}
				}
				if (match == false && args[a] != ""){
					alladded += args[a]+","
					saved_status[args[a]] = {"online":"false","game":"","title":"","lastonline":0}
				}
			}
			let response = ""
			if (alladded != ""){
				response += "Added "+alladded+" "
				logChan.sendMessage("`"+alladded+"` added by "+m.author.username+"#"+m.author.discriminator+" (from `"+m.guild.name+"`)")
			}
			if (allmatched != ""){response += " (Already added "+allmatched+")"}
			if (response != ""){
				c.sendMessage(response)
			}
		} else if (m.content.startsWith("!ep-live")){
			let tags = m.content.split("!ep-live ")[1]
			if (tags == undefined){
				if (c.topic != null){
					if (c.topic.indexOf(TAGDELIM[0]) != -1){
						tags = c.topic.split(TAGDELIM[0])[1].split(TAGDELIM[1])[0]
					} else if (c.topic.indexOf(PASSIVETAGDELIM[0]) != -1){
						tags = c.topic.split(PASSIVETAGDELIM[0])[1].split(PASSIVETAGDELIM[1])[0]
					}
				} else {
					tags = ""
				}
			}
			if (tags != undefined){
				let resp = ""
				for (var s in saved_status){
					let ann = Announce(s,saved_status[s],tags,m.guild)
					if (ann != ""){
						if (resp == ""){
							resp = ann
						} else if ((resp+ann).length > MAX_MSG_LENGTH){
							c.sendMessage(resp)
							resp = ann
						} else {
							resp += "\n" + ann
						}
					}
				}
				if (resp != ""){
					c.sendMessage(resp)
				}
			} else {
				c.sendMessage("No tags provided. (Hint: you can use \",\" to match \"no-game\" streams)")
			}
		} else if (m.content.startsWith("!ep-all")){
			let resp = ""
			for (var s in saved_status){
				let status = saved_status[s]
				let ann = ""
				if (status.online != "false"){
					ann = "**"+status.game+"** ▶ **<http://twitch.tv/"+s+">**"+
					"\n"+status.title+""
				}
				if (ann != ""){
					if (resp == ""){
						resp = ann
					} else if ((resp+ann).length > MAX_MSG_LENGTH){
						c.sendMessage(resp)
						resp = ann
					} else {
						resp += "\n" + ann
					}
				}
			}
			if (resp != ""){
				c.sendMessage(resp)
			}
		}
	} else if (c.id == debugChan.id){
			if (m.content.startsWith("!reset")){
				for (var i in saved_status){
					saved_status[i].lastonline = 0
					saved_status[i].online = "false"
				}
			} else if (m.content.startsWith("!servers")){
				let msg = ""
				for (var [key, g] of client.guilds){
					msg += g.name+ " (" +g.owner.user.username+"#"+g.owner.user.discriminator+ ")\n"
				}
				debugChan.sendMessage(msg)
			} else if (m.content.startsWith("!ban")){
				let name = m.content.split("!ban ")[1]
				if (saved_status[name] != undefined){
					saved_status[name].ban = "true"
					logChan.sendMessage("`"+name+"` de-listed by "+m.author.username+"#"+m.author.discriminator)
				}
			} else if (m.content.startsWith("!unban")){
				let name = m.content.split("!unban ")[1]
				if (saved_status[name] != undefined){
					saved_status[name].ban = "false"
					logChan.sendMessage("`"+name+"` restored by "+m.author.username+"#"+m.author.discriminator)				
				}
			} else if (m.content.startsWith("!setavi")){
				client.user.setAvatar("avi.jpg")
			}
	}

});
client.login(settings.token)