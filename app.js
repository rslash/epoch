//"Epoch Streambot II" 20170726 Redslash

"use strict";
const DEBUG = 1
function p(s){console.log(s)}

const Discord = require("discord.js")
const settings = require("./settings.json")
const client = new Discord.Client();
var request = require("request")
var fs = require("fs")
var jfs = require("jsonfile")
var tform = require("dateformat")

var statusChan = "338402080869842945"
var testChan = "338402321518166016"
var debugChan = "339995355389362177"
var TAGDELIM = ["epoch{","}"]
var PASSIVETAGDELIM = ["manual{","}"]
var new_status
var saved_status = {}
	try {saved_status = jfs.readFileSync("saved_status.txt", "utf8")} catch(e){}

var register_msg = []
var reg_list = {}
	try {reg_list = jfs.readFileSync("reg_list.txt", "utf8")} catch(e){}
var reg_sort = {}

var base_url = "https://api.twitch.tv/kraken/streams?client_id=67w6z9i09xv2uoojdm9l0wsyph4hxo6&channel="
var MAX_URL_NAMES = 90
var MAX_URL_LENGTH = 1000
var MAX_MSG_LENGTH = 2000

function DetailRegister(prev_id){
	let next = false
	if (prev_id == 0){next = true}
	for (var id in reg_list){
		if (next){
			client.fetchInvite(reg_list[id]).then( inv => {
				let g = client.guilds.get(inv.guild.id)
				let motd = (g == undefined ? "N/A" : client.channels.get(inv.channel.id).topic)
				let ct = (g == undefined ? 0 : g.memberCount)
				let msg = "("+ct+")  **"+inv.guild.name+"**\n#"+inv.channel.name+" : `"+motd+"`"
				reg_sort[id] = {"ct":ct,"msg":msg,"order":-1}
			}).then(DetailRegister(id))
			break
		} else if (id == prev_id){
			next = true
		}
	}
}
function SortRegister(){
	register_msg = []
	let c = 0
	for (var cc in reg_list){
		let next = ""
		for (var id in reg_list){	//go thru whole Register to find the next highest count...
			if (reg_sort[id].order == -1){
				if (next == ""){
					next = id
					break
				} else if (reg_sort[id].ct > reg_sort[next].ct){
					next = id
				}
			}
		}
		reg_sort[next].order = c	//...then assign number to that Register entry
		register_msg[c] = reg_sort[next].msg
		c++
	}
}

function UpdateTwitchStatus(){
	new_status = {}
	let req_url = ""
	let namecount = 0
	let last_req = false
	for (var s in saved_status){
		if (namecount == 0){
			req_url = base_url + s
			namecount++
		} else if (namecount < MAX_URL_NAMES && ((req_url + "," + s).length < MAX_URL_LENGTH)){
			req_url += "," + s
			namecount++
		} else {
			Request(req_url,last_req)
			namecount = 0
		}
	}
	last_req = true
	Request(req_url, last_req)
}

function Request(req_url,last_req){
	request(req_url, (err, response, body) => {
		let now = Date.now()
		if (!err && 200 == response.statusCode){
			try {
				body = JSON.parse(body)
			} catch(e){}
			if (body.streams != null){
				for (var b in body.streams){
					let bs = body.streams[b]
					new_status[bs.channel.name] = {
						"online" : true,
						"game" : bs.game || "no game",
						"title" : bs.channel.status || "no title",
						"lastonline" : now
					}
p("ONLINE: "+bs.channel.name)
				}
			}
		}
		if (last_req){
			for (var [key, chan] of client.channels){ //check every Discord channel
				if (chan.type == "text"){
					if (chan.topic != null){
						if (chan.topic.indexOf(TAGDELIM[0]) != -1){
p(chan.topic)
							let tagstring = chan.topic.split(TAGDELIM[0])[1].split(TAGDELIM[1])[0]	
							let resp = ""
							if (DEBUG){chan = testChan}
							
							for (var s in new_status){
								if (saved_status[s].online == "false" || saved_status[s].game != new_status[s].game){
									if (now - saved_status[s].lastonline > 5*60*1000){
p("CHECK MATCH "+s)
										let ann = Announce(s,new_status[s],tagstring)
p("ANN "+ann)
										if (ann != ""){
											if (resp == ""){
												resp = ann
p("RESP START")
											} else if ((resp+ann).length > MAX_MSG_LENGTH){
												chan.sendMessage(resp)
p("MET MAX")
												resp = ann
											} else {
												resp += "\n" + ann
p("RESP ADD")
											}
										}
									}
								}
							}
							if (resp != ""){
p("SEND LAST")

								chan.sendMessage(resp)
							}
						}
					}
				}
			}
			for (var s in saved_status){
				if (new_status[s] == undefined){
if (saved_status[s].online == "true"){p(s+" OFFLINE")}
					saved_status[s].online = "false"
				} else {
					saved_status[s] = new_status[s]
				}				
			}
			jfs.writeFileSync("saved_status.txt",saved_status)
		}
	})
}

function Announce(twitch,status,tagstring){
	let tags = tagstring.split(",")
	let announce = true
	for (var t in tags){	//first: find TITLE optouts
		if (tags[t].startsWith("-") && (status.title.toLowerCase().indexOf(tags[t].toLowerCase()) != -1)){
			announce = false
			break
		}
	}
	let resp = ""
	if (announce != false && status.online != "false"){
		for (var t in tags){	//if NO optouts, then find GAME matches
			if (announce != false && tags[t].startsWith("-") == false){	
				let gametag = tags[t].split("=")[0].trim()
				let abbrtag = tags[t].split("=")[1] || status.game

				if (status.game.toLowerCase().indexOf(gametag.toLowerCase()) != -1){
					resp = "**"+abbrtag.trim()+"** "+IconEval(status.title)+" **<http://twitch.tv/"+twitch+">**"+
					"\n"+status.title+""
					break
				}
			}
		}
	}
	return resp
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

let alt = false
setInterval(() => {
	if (alt){
		DetailRegister(0)
		alt = false
	} else {
		SortRegister()
		alt = true
	}
}, 10*1000 )
setInterval(() => {
	UpdateTwitchStatus()
}, 15*1000 )

client.on("ready", () => {
	p("Bot online");
	statusChan = client.channels.get(statusChan)
	debugChan = client.channels.get(debugChan)
	testChan = client.channels.get(testChan)
	debugChan.sendMessage("Bot restarted")
	UpdateTwitchStatus()
	DetailRegister(0)
})

client.on("message", m => {
	let c = m.channel

	if (m.content === "!ping" || m.content === "!ep-ping"){
		c.sendMessage("pong, dude!")
	} else if (m.content === "!invite"){
		c.sendMessage("Add Epoch to your server: https://goo.gl/WQeWzF")
	} else if (m.content === "!help" || m.content === "!ep" || m.content === "!ep-help"){
		c.sendMessage(
			  "**(1)** Put this in a Channel Topic:  `epoch{ Game Tags,Game Tags=abbrevs,-Title Optouts}`" +
			"\nExample:  `epoch{ Mario RPG = SMRPG, -[nosrl] }`" +
			"\nUse  `!ep-live any,tags,-here`  for list of live streams  (you may DM @Epoch#4428 )"+
			"\n**(2)** To enable the Add command (`!ep-add Twitch1,Twitch2,`),  please Register your server (`!ep-reg invitecode`)"+
			"\nUse  `!ep-servers`  to see list of reg'd servers."+
			"\n**(3)** Epoch's bot-invite is <https://goo.gl/WQeWzF>  Questions/comments -> <https://discord.gg/vbFwyP5>"
		)
	} else if (m.content.startsWith("!ep")){
		if (m.content.startsWith("!ep-add") && m.guild != null){
			debugChan.sendMessage("`"+m.content+"` - "+m.author.username+"#"+m.author.discriminator+" (from `"+m.guild.name+"`)")
			let reg_exists = false
			client.fetchInvite(reg_list[m.guild.id]).then( inv => {
				reg_exists = inv

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
					statusChan.sendMessage("`"+alladded+"` added by "+m.author.username+"#"+m.author.discriminator+" (from `"+m.guild.name+"`)")
				}
				if (allmatched != ""){response += " (Already added "+allmatched+")"}
				if (response != ""){
					c.sendMessage(response)
				}
			}).then( i => {
				if (reg_exists == false){
					c.sendMessage("`"+m.guild.name+"`'s owner must register this server:  `!reg invitecode`")
				}
			}).catch()
		} else if (m.content.startsWith("!ep-reg") && m.guild != null){
			debugChan.sendMessage("`"+m.content+"` - "+m.author.username+"#"+m.author.discriminator+" (from `"+m.guild.name+"`)")
			let code = m.content.split(" ")[1]
			if (code.indexOf("discord.gg/") != -1){
				code = code.split("discord.gg/")[1]
			}
			client.fetchInvite(code).then( inv => {
				if (m.author.id == m.guild.ownerID){
					try {
						if (inv.max_age != null){
							c.sendMessage("Oh dear. Please set Expiry to None, then click Regen for a new invite.")
						} else if (inv.max_uses != null){
							c.sendMessage("Oh dear. Please set Max Uses to Unlimited, then click Regen for a new invite.")
						} else {
							reg_list[inv.guild.id] = inv.code
							reg_sort[inv.guild.id] = {"ct":0,"msg":"","order":-1}
							let response = "Your invite to `"+inv.guild.name+" #"+inv.channel.name+"` has been registered!"
							if (client.guilds.get(inv.guild.id) == null){
								response += "\n(Now invite Epoch to your server! <https://goo.gl/WQeWzF>)"
							} else {response += "\n(Thanks!)"}
							c.sendMessage(response)
							statusChan.sendMessage("`"+inv.guild.name+"` registered by "+m.author.username+"#"+m.author.discriminator)
							jfs.writeFileSync("reg_list.txt",reg_list)
						}
					} catch(e) {c.sendMessage("Oh my. Not a valid invite code?")}
				} else {
					m.guild.fetchMember(m.guild.ownerID).then( owner => {
						c.sendMessage("Oh dear. Only server owner ("+owner.username+") can register.")
					}).catch()
				}
			}).catch()
		} else if (m.content.startsWith("!ep-live")){
			debugChan.sendMessage("`"+m.content+"` - "+m.author.username+"#"+m.author.discriminator+"")
			let tags = m.content.split("!ep-live ")[1]
			if (tags == undefined && c.topic != null){
				if (c.topic.indexOf(TAGDELIM[0]) != -1){
					tags = c.topic.split(TAGDELIM[0])[1].split(TAGDELIM[1])[0]
				} else if (c.topic.indexOf(PASSIVETAGDELIM[0]) != -1){
					tags = c.topic.split(PASSIVETAGDELIM[0])[1].split(PASSIVETAGDELIM[1])[0]
				}
			}
			if (tags != undefined){
				let resp = ""
				for (var s in saved_status){
					let ann = Announce(s,saved_status[s],tags)
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
				c.sendMessage("No tags provided.  (You may put  `manual{gametags,-titleoptout}`  in the Topic, for use with the  `!ep-live`  command)")
			}
		} else if (m.content.startsWith("!ep-servers")){
			debugChan.sendMessage("`"+m.content+"` - "+m.author.username+"#"+m.author.discriminator+"")
			let msg = ""
			for (var i in register_msg){
				if (register_msg[i].length + msg.length > MAX_MSG_LENGTH){
					c.sendMessage(msg)
					msg = "" + register_msg[i]
				} else {
					msg += "\n" + register_msg[i]
				}
			}
			c.sendMessage(msg)
		} else if (m.content.startsWith("!ep-reset") && c.id == debugChan.id){
			for (var i in saved_status){
				saved_status[i].lastonline = 0
				saved_status[i].online = "false"
p("RESET")
			}

		} else if (m.content.startsWith("!ep-setavi") && c.id == debugChan.id){
			client.user.setAvatar("avi.jpg")
		}
	}
});

client.login(settings.token)