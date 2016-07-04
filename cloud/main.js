// ---------------------- requires ------------------
var jQuery;
var request = require("request"); // used by platform API
var deferred = require('deferred'); // used by platform API

// used for xml from XMLSOCCER
require("jsdom").env("", function(err, window) {
	if (err) {
		console.error(err);
		return;
	}
 
	jQuery = require("jquery")(window);
	global.DOMParser = require('xmldom').DOMParser;
});

var xml2js = require('xml2js');
var parseString = require('xml2js').parseString;
var fs = require('fs');



// ---------------------- global variables ------------------

//For not calling XMLSOCCER too many times, change to TRUE:
var shouldUseXmlExamples = false;


var layerPlatformApiInfo = {
    config: {
        serverUrl: "https://api.layer.com/apps/" + process.env.LAYER_APP_UUID
    },
    headers: {
        Accept: "application/vnd.layer+json; version=1.0",
        Authorization: "Bearer " + process.env.LAYER_PLATFORM_API_TOKEN,
        "Content-type": "application/json"
    },
    patchHeaders: {
        Accept: "application/vnd.layer+json; version=1.0",
        Authorization: "Bearer " + process.env.LAYER_PLATFORM_API_TOKEN,
        "Content-type": "application/vnd.layer-patch+json"
    },
    cache: {
        newConversation: null,
        newMessage: null
    }
}

var leaguesId = ["1","4","5","7","8","16","56"];
var leaguesDic = {
	"English Premier League":1,
	"Bundesliga":4,
	"Serie A":5,
	"Ligue 1":7,
	"La Liga":8,
	"Champions League":16,
	"EURO 2016":56
};


// ---------------------- background operations ------------------


var liveUpdateMinutes = 0.5; //30 seconds, to be on the safe side
if (shouldUseXmlExamples == true){
	liveUpdateMinutes = 10000;
}
var liveUpdateInterval = liveUpdateMinutes * 60 * 1000;
setInterval(function() {
	updateLiveScores();
}, liveUpdateInterval);

var dbGamesUpdateHours = 72;
var dbGamesUpdateInterval = dbGamesUpdateHours * 60 * 60 * 1000; // if we want 11 mins. - 11*60*1000
setInterval(function() {
  updateComingGames();
}, dbGamesUpdateInterval);




//yyyy-mm-dd
function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}




// -------------------------sendSmsForPhoneNumber----------------------------
//Sends sms to user and saves the loginCode in Parse
Parse.Cloud.define("sendSmsForPhoneNumber", function(request, response) {
	var phoneNumber = request.params.phoneNumber;
	var code = "1"; //"" + (Math.floor(Math.random()*90000) + 10000); //TODO: change back to this random num
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("phoneNumber",phoneNumber);
	query.first({
		success: function(user) {
			//If user already exists in Parse:
			if (user != undefined && user != null) {
				user.set("loginCode",code); //TODO: change back to 'code'
				saveUserAndSendSMS(user, phoneNumber, code, response); //TODO: stopped sending SMS for now, so it returns success anyhow
			} else {
			//New user
			var user = new LBUserClass();
			user.set("phoneNumber",phoneNumber);
			user.set("loginCode",code);
			user.set("name","");
			user.set("betsWon",0);
			user.set("betsParticipated",0);
			user.set("layerIdentityToken",generateUuid());
			saveUserAndSendSMS(user, phoneNumber, code, response); //TODO: stopped sending SMS for now, so it returns success anyhow
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

//Practically send the SMS, after saving all data in Parse
function saveUserAndSendSMS(user, phoneNumber, code, response) {
	user.save(null,{
		success:function(user) { 
			//TODO: return to Twilio! now we just send success
			response.success(true);
			/**var client = require('twilio')('ACed1f17d6a82f9a922f8a10de877b79e5', '4ba18cd3ca91916e74d3dac67509bcf0');
			client.sendSms({
				to:phoneNumber, 
				from: '+972526286926', 
				body: 'Your code is: ' + code + "."  
			}, function(err, responseData) { 
				if (err) {
					response.error(err);
				} else { 
					response.success(true);
				}
			});*/
		},
		error:function(user, error) {
			response.error(error);
		}
	});
}

function generateUuid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
		.toString(16)
		.substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	s4() + '-' + s4() + s4() + s4();
}

// -------------------------authenticatePhoneNumberAndSendToken----------------------------
//Given a phone number and an entered SMS code, the client will get a Token that Layer will identify
Parse.Cloud.define("authenticatePhoneNumberAndSendToken", function(request, response) {
	var phoneNumber = request.params.phoneNumber;
	var receivedCode = request.params.code;
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("phoneNumber",phoneNumber);
	query.first({
		success: function(user) {
			//If user exists in Parse:
			if (user != undefined && user != null) {
				var dbCode = user.get("loginCode");
				//and has the right code, return the layer-token (LBuser object ID)
				if (dbCode === receivedCode){
					var layerToken = user.get("layerIdentityToken");
					response.success(layerToken);
				}
				else{
					response.error("User entered wrong SMS code");
				}
			} else {
				response.error("User doesn't exist")
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

// -------------------------changeUserNickname----------------------------
//Function for changing the nickname ma nizma.
Parse.Cloud.define("changeUserNickname", function(request, response) {
	var nickname = request.params.nickname;
	var picture = request.params.picture;
	var layerIdentityToken = request.params.layerIdentityToken;

	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("layerIdentityToken",layerIdentityToken);
	query.first({
		success: function(user) {
			//If user exists in Parse:
			if (user != undefined && user != null) {
				user.set("name",nickname);
				user.set("picture", picture);
				user.save(null,{
					success:function(user) { 
						response.success(true);
					}, error:function(user, error) {
						response.error(error);
					}
				});
			} else {
				response.error("User doesn't exist");
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

// -------------------------getUserObjectsForPhoneNumbers----------------------------
//Given an array of phone numbers (Strings), returun an equivalent array of User Objects
//Phone numbers should be in form of +972...
Parse.Cloud.define("getUserObjectsForPhoneNumbers", function(request, response) {
	var phoneNumbersArray = request.params.phoneNumbers;
	
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.containedIn("phoneNumber",phoneNumbersArray);
	query.select("name", "phoneNumber", "layerIdentityToken", "picture");
	query.find({
		success: function(users) {

			response.success(users);
		},
		error: function(error) {
			response.error(error);
		}
	});
});



// -------------------------createGroup----------------------------

//Given an array of Layer Conversation IDs, and returns statuses (name, display, etc.) per each conversations,
//in the same order it was received
Parse.Cloud.define("createGroup", function(request, response) {
	var groupLayerId = request.params.layerGroupId;
	var groupAdminLayerId = request.params.groupAdminLayerId; 
	var picture = request.params.picture; 

	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);

	query.first({
		success: function(group) {
			//group already exists:
			if (group != undefined && group != null) {
				console.log("createGroup: errorGroupAlreadyExists");
				response.error("errorGroupAlreadyExists");
			} else {
				//New Group
				console.log("gonna create a new group");
				var newGroup = new LBGroupClass();
				var stats = {};
				stats[groupAdminLayerId] = {"bullseye":0,"almost":0,"lost":0,"points":0};
				newGroup.set("statistics",stats);
				newGroup.set("layerGroupId",groupLayerId);
				newGroup.set("groupAdminLayerId",groupAdminLayerId);
				newGroup.set("lastBetId","");
				newGroup.set("lastBetType","");
				newGroup.set("picture",picture);
				
				newGroup.save(null,{
					success:function(newGroupSuccess) { 
						console.log("created new group in db");
						var LBUserClass = Parse.Object.extend("LBUser");
						var userQuery = new Parse.Query(LBUserClass);
							
						userQuery.equalTo("layerIdentityToken", groupAdminLayerId);
						userQuery.first({
							success: function(user) {
								sendAdminMsgToGroup(groupLayerId, "" + user.get("name") + " opened a new group", {});
								response.success(true);
							},
							error:function(bet, error) {
								var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
								console.log(str); // Logs output to dev tools console.
								response.error(error);
							}
						});
					},
					error:function(newGroupError, error) {
						console.log("error  creating new group in db: "+error);
						var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
						console.log(str); // Logs output to dev tools console.
						response.error(error);
					}
				});
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});



// -------------------------deleteAllGroupsFromDB----------------------------

/**Parse.Cloud.define("deleteAllGroupsFromDB", function(request, response) {
	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",layerGroupId);

	//TODO: implement...
});*/

// -------------------------createFootballGameBet----------------------------
Parse.Cloud.define("createFootballGameBet", function(request, response) {
	var groupLayerId = request.params.layerGroupId;
	var gameId = request.params.gameId;
	var betAdminLayerId = request.params.betAdminLayerId;
	var hostAdminGoalsBet = parseInt(request.params.hostAdminGoalsBet);
	var guestAdminGoalsBet = parseInt(request.params.guestAdminGoalsBet);
	var stakeType = request.params.stakeType;
	var stakeDesc = request.params.stakeDesc;
	
	
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.equalTo("gameId",gameId);

	query.first({
		success: function(query_bet) {
			//If bet for this match in this group already exists in Parse:
			if (query_bet != undefined && query_bet != null) {
				response.error("errorBetAlreadyExists");
			} else {
				//Get all the relevant data about the match from DB
				var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
				var footballQuery = new Parse.Query(LBFootballMatchClass);
				footballQuery.equalTo("matchId",gameId);
				footballQuery.first({
					success: function(match) {
						if ((match != undefined) && (match != null)) {
							var teamHostName = match.get("homeTeam");
							var teamGuestName = match.get("awayTeam");
							var teamHostId = match.get("homeTeamId");
							var teamGuestId = match.get("awayTeamId");
							
							log("Got relevant data about match from DB");

							//Create the new bet
							var bet = new LBFootballGameBetClass();
							bet.set("layerGroupId",groupLayerId);
							bet.set("gameId",gameId);
							bet.set("betAdminLayerId",betAdminLayerId);
							var usersGuesses = {};
							usersGuesses[betAdminLayerId] = {"homeGoals": hostAdminGoalsBet, "awayGoals": guestAdminGoalsBet};
							bet.set("usersGuesses",usersGuesses);
							bet.set("stakeType",stakeType);
							bet.set("stakeDesc",stakeDesc);
							//from the data we extracted earlier regarding the match
							bet.set("teamHostName",teamHostName);
							bet.set("teamHostId",teamHostId);
							bet.set("teamGuestName",teamGuestName);
							bet.set("teamGuestId",teamGuestId);
							
							bet.save(null,{
								success:function(savedBet) { 
								
								
								/**
										//Save last bet in group
										var LBGroupClass = Parse.Object.extend("LBGroup");
										var group_query = new Parse.Query(LBGroupClass);
										group_query.equalTo("layerGroupId",groupLayerId);
										group_query.first({
											success: function(group) {
												//If group doesn't exist in Parse:
												if (group == undefined || group == null) {
													response.error("errorGroupDoesntExist");
												} else {
													group.set("lastBetType","Football");
													group.set("lastBetId", savedBet.id);
													group.save(null,{
														success:function(groupSuccess) { 
															logOk("updated lastBet in group in db");
														},
														error:function(groupError, error) {
															logError("error updating last bet in group: "+error);
															var str = JSON.stringify(error, null, 4);
															logError(str);
														}
													});
												}
											},
											error:function(group, error) {
												response.error("failed fetching group for updating last bet");
											}
										});*/
								
										//send message to group that the given admin has opened a new bet
										var LBUserClass = Parse.Object.extend("LBUser");
										var userQuery = new Parse.Query(LBUserClass);
										
										userQuery.equalTo("layerIdentityToken", betAdminLayerId);
										userQuery.first({
											success: function(user) {

												var data = {
													"msgType" : "FootballBet",
													"betId" : savedBet.id,
													"gameId" : gameId,
													"betAdminLayerId" : betAdminLayerId,
													"teamHomeName" : teamHostName,
													"teamAwayName" : teamGuestName,
													"teamHomeId" : teamHostId,
													"teamAwayId" : teamGuestId,
													"date" : match.get("date")
												}

												sendAdminMsgToGroup(groupLayerId, "" + user.get("name") +  " opened a new bet!", data);
												response.success(true);
											},
											error:function(savedBet, error) {
												response.error("q");
											}
										});
								},
								error:function(bet, error) {
									response.error("W");
								}
							});
						} else {
							response.error("match wasn't found in DB: " + error);
						}
					},
					error: function(error) {
						response.error(error);
					}
				});
			}
		},
		error: function(error) {
			response.error("E");
		}
	});
});


// ------------------------- addGuessToFootballGameBet ----------------------------
Parse.Cloud.define("addGuessToFootballGameBet", function(request, response) {
	var gameApiId = request.params.gameApiId;
	var groupLayerId = request.params.groupLayerId;
	var userLayerId = request.params.userLayerId;
	var goalsTeamHost = parseInt(request.params.goalsTeamHost);
	var goalsTeamGuest = parseInt(request.params.goalsTeamGuest);
	
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.equalTo("gameId",gameApiId);
	query.first({
		success: function(bet) {
			//If bet for group exists in Parse:
			if (bet != undefined && bet != null) {	
				//Add guess to bet

				var usersGuesses = bet.get("usersGuesses");
				//Make sure guess doesn't exist yet
				if (usersGuesses[userLayerId] != undefined){
					response.error("User added guess to this bet already");
				}

				usersGuesses[userLayerId] = {"homeGoals": goalsTeamHost, "awayGoals": goalsTeamGuest};				
				bet.save(null,{
					success:function(bet) { 
							var LBUserClass = Parse.Object.extend("LBUser");
							var userQuery = new Parse.Query(LBUserClass);
							
							userQuery.equalTo("layerIdentityToken", userLayerId);
							userQuery.first({
								success: function(user) {
									if ((user == undefined) || (user == null)){
										response.error("couldn't find userId to add his guess");
									}else{
										//TODO: make sure what's the right behavior for updating etc.
										var data = {
											"msgType" : "FootballBet",
											"betId" : bet.id,
											"gameId" : gameApiId,
											"userLayerId" : userLayerId,
											"teamHomeName" : bet.get("teamHostName"),
											"teamAwayName" : bet.get("teamGuestName"),
											"teamHomeId" : bet.get("teamHostId"),
											"teamAwayId" : bet.get("teamGuestId")
											//"date" : match.get("date") TODO: add!
										}
										sendAdminMsgToGroup(groupLayerId, "" + user.get("name") + " added a guess to bet " + bet.id, data);
										response.success(true);
										//msgtype
									}
								},
								error:function(bet, error) {
									response.error(error);
								}
							});
					},
					error:function(bet, error) {
						response.error(error);
					}
				});
			} else {
				response.error("errorBetDoesntExist");
				
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});


/**
//www.xmlsoccer.com/FootballData.asmx/GetFixturesByDateInterval?ApiKey=OOYXGGEGYDPFYZQTSKQPWSSUENFSIWLCDVFBEQXDWKLCZUWKFU&startDateString=2016-04-01
&endDateString=2016-04-30

*/

// ------------------------- getGamesPerDatesRange ----------------------------
Parse.Cloud.define("getGamesPerDatesRange", function(iko, piko) {

});

// ------------------------- testRepeatinFunctions ----------------------------
Parse.Cloud.define("updateComingGames", function(request, response) {
	updateComingGames();
});


// ------------------------- testRepeatinFunctions ----------------------------
Parse.Cloud.define("updateLiveScores", function(request, response) {
	updateLiveScores();
});




function sendAdminMsgToGroup(groupLayerId, msg, dataDic) {
	log("in sendAdminMsgToGroup() with msg: '" + msg + "'. sending to " + groupLayerId);
	request({
	    uri: layerPlatformApiInfo.config.serverUrl + "/conversations/" + groupLayerId + "/messages",
	    method: "POST",
	    body: {
	        sender: {name: "Admin"},
	        parts: [{body: msg, mime_type: "text/plain"}, {body: JSON.stringify(dataDic), mime_type: "text/javascript"}],
	        notification: {text: msg, data: dataDic},
	    },
	    json: true,
	    headers: layerPlatformApiInfo.headers
	    }, function(error, response, body) {
	    	
		});
}


Parse.Cloud.define("AdminMsg", function(request, response) {
	sendAdminMsgToGroup("8dc83080-ae62-4602-b8d2-e400356096db","Fred! Ma Nish!");
});


// -------------------------getGroupOpenBets----------------------------
Parse.Cloud.define("getGroupOpenBets", function(request, response) {
	var groupLayerId = request.params.layerGroupId;
	var LBGroupClass = Parse.Object.extend("LBGroup");
	var group_query = new Parse.Query(LBGroupClass);
	group_query.equalTo("layerGroupId",groupLayerId);
	group_query.first({
		success: function(group) {
			//group exists:
			if (group != undefined && group != null) {
				//First we find group's last bet, which isn't relevant to return cause it's been closed already
				var lastBetId = group.get("lastBetId");
				
				var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
				var query = new Parse.Query(LBFootballGameBetClass);
				query.equalTo("layerGroupId",groupLayerId);
				query.notEqualTo("_id",lastBetId);
				query.find({
					success: function(footballBets) {
						
						var LBCustomBetClass = Parse.Object.extend("LBCustomBet");
						var custom_query = new Parse.Query(LBCustomBetClass);
						custom_query.equalTo("groupLayerId",groupLayerId);
						custom_query.notEqualTo("_id",lastBetId);
						custom_query.find({
							success: function(customBets) {
								var allBets = footballBets.concat(customBets);
								if (allBets.length == 0){
									response.error("GroupId not found or no bets exist"); //TODO: distinct between the two
								}
								else{
									response.success(allBets);
								}
							},
							error: function(error) {
								response.error(error);
							}
						});
					},
					error: function(error) {
						response.error(error);
					}
				});
				
				
			} else {
				logWarning("getGroupOpenBets error: group doesn't exist");
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
	
	
	
	
	
	
});


// -------------------------authenticatePhoneNumberAndSendToken----------------------------
//Given an array of Layer Conversation IDs, and returns statuses (name, display, etc.) per each conversations,
//in the same order it was received
Parse.Cloud.define("testPush", function(request, response) {
	Parse.Push.send({
		channels: [ "A2" ],
		data: {
			alert: "The Giants won against the Mets 2-3."
		}
	}, {
		success: function() {
  		  	// Push was successful
  		  	response.success("YES!");
  		  },
  		  error: function(error) {
   		 	// Handle error
   		 	response.error(error);
   		 }
   	});
});



//Called daily
function updateComingGames() {
	//If we wanna use the xml example, just use this:
	
	//if (shouldUseXmlExamples){
	if (false){

		console.log("using example xml");
		
		fs.readFile('./matches_example_xml.xml', function(err, data) {
			updateComingGamesInDB(data);
		});
	}
	else{
		var xmlSoccerApiKey = process.env.XML_SOCCER_KEY;
		var xmlSoccerUrl = "http://www.xmlsoccer.com/FootballData.asmx/";
		
		var startDate = new Date();
		var endDate = new Date();
		endDate.setDate(endDate.getDate()+14);

		var fullUrl = ""+xmlSoccerUrl + "GetFixturesByDateInterval"+"?Apikey="+xmlSoccerApiKey+"&"+"startDateString="
				+formatDate(startDate)+"&endDateString="+formatDate(endDate);
				
		//In case we ran too many XMLSOCCER calls for the upper function:
	//	var fullUrl = ""+xmlSoccerUrl + "GetFixturesByDateIntervalAndLeague"+"?league=1&"+"Apikey="+xmlSoccerApiKey+"&"+"startDateString="
	//		+formatDate(startDate)+"&endDateString="+formatDate(endDate);
		console.log(fullUrl);
		
		request({
			uri: fullUrl,
			method: "GET",
			json: true,
			}, function(error, response, body) {
				updateComingGamesInDB(body);
		});
	}
}

function updateComingGamesInDB(futureMatchesXML){
	console.log("updateComingGamesInDB");
	
	var parser = new xml2js.Parser({explicitRoot: false, normalizeTags: true}); //Without "XMLSOCCER.COM", with lowercase
		parser.parseString(futureMatchesXML, function (err, result) {
			var resultArr = [];
			if (result.match != undefined && result.match != null) {
				for(var i = 0; i < result.match.length; i++) {
					if (result.match[i] != undefined){ //In case we get the too-many-cooks problem
						var leagueName = result.match[i].league[0];
						if (leagueName in leaguesDic){
							var leagueId = leaguesDic[leagueName];
							var matchId = result.match[i].id[0];
							console.log("getting data for gameID "+ matchId + " from league "+leagueId);
							var date = result.match[i].date[0];
							var homeTeam = result.match[i].hometeam[0];
							var homeTeamId = result.match[i].hometeam_id[0];
							var awayTeam = result.match[i].awayteam[0];
							var awayTeamId = result.match[i].awayteam_id[0];
							var loc = result.match[i].location[0];
							
							var match_data_str = JSON.stringify(result.match[i], null, 4);
							//log("parsed match: "+ match_data_str);
							addLBFootballMatchToDB(matchId, date, leagueId, homeTeam, homeTeamId, awayTeam, awayTeamId, loc);
						}
					}
				}
			}
		});
	console.log("finished updateComingGamesInDB");
}

function addLBFootballMatchToDB(matchId, date, leagueId, homeTeam, homeTeamId, awayTeam, awayTeamId, loc){
	var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
	var query = new Parse.Query(LBFootballMatchClass);
	query.equalTo("matchId",matchId);
	query.first({
		success: function(match) {
			//If match doesn't exist in Parse:
			if ((match == undefined ) || (match == null)) {
				log("Creating matchId "+ matchId + " in DB");
				var match = new LBFootballMatchClass();
				match.set("matchId",matchId);
				//var d = new Date(date);
				//console.log(d);
				
				match.set("time","Not Started");
				match.set("homeGoals",0);
				match.set("awayGoals",0);
			}

			//log("updating match of "+ homeTeam + " - " + awayTeam + "(" + homeTeamId + " - " + awayTeamId + ")");
			//Updating a match
			log("Updating data of match "+ matchId);
			match.set("date", date);
			match.set("leagueId",leagueId);
			match.set("homeTeam",homeTeam);
			match.set("homeTeamId",homeTeamId);
			match.set("awayTeam",awayTeam);
			match.set("awayTeamId",awayTeamId);
			match.set("location",loc);
			
			var match_str = JSON.stringify(match, null, 4);
			log("about to save match: "+ match_str);
			
			match.save(null,{
				success:function(match_success) { 				
					logOk("Succeeded saving data of match " + match_success.get("matchId"));

				},
				error:function(match_err, error) {
					logError("Error saving data of match " + match_success.get("matchId") + ": "+ error);
					response.error(error);
				}
			});
		},
		error: function(error) {
			logError("Error querying match " + matchId + ": "+ error);
			response.error(error);
		}
	});	
}

// ------------------------- getLBFootballMatches ----------------------------
//Get all LBFootballMatches saved in the DB
Parse.Cloud.define("getLBFootballMatches", function(request, response) {
	var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
	var query = new Parse.Query(LBFootballMatchClass);
	query.limit(1000);
	query.find({
		success: function(matches) {
			//console.log(matches);
			if (matches.length == 0){
				response.error("No matches found in DB");
			}
			else{
				response.success(matches);
			}
		},
		error: function(error) {
			response.error("getLBFootballMatches error: " + error);
		}
	});
});








//Called every 30 seconds
//updates live scores from xmlsoccer, and then forwards to analyse results
function updateLiveScores() {
	//If we wanna use the xml example, just use this:
	if (shouldUseXmlExamples){
		console.log("using example xml");
		//TODO: change to real xml example
		
		fs.readFile('./live_scores_example_xml.xml', function(err, data) {
			updateLiveScoresInDBAndNotify(data);
		});
	}
	else{
		

		var xmlSoccerApiKey = process.env.XML_SOCCER_KEY;
		var xmlSoccerUrl = "http://www.xmlsoccer.com/FootballData.asmx/";
		
		var startDate = new Date();
		var endDate = new Date();
		endDate.setDate(endDate.getDate()+14);

		var fullUrl = ""+xmlSoccerUrl + "GetLiveScore"+"?Apikey="+xmlSoccerApiKey;
		
		request({
			uri: fullUrl,
			method: "GET",
			json: true,
			}, function(error, response, body) {
				updateLiveScoresInDBAndNotify(body);
		});
	}
}

//Gets liveScoreXml and calls a function that updates db and notifies relevant groups
function updateLiveScoresInDBAndNotify(liveScoresXml){
	log("Looking for score updates");
	
	var parser = new xml2js.Parser({explicitRoot: false, normalizeTags: true}); //Without "XMLSOCCER.COM", with lowercase
		parser.parseString(liveScoresXml, function (err, result) {
			var resultArr = [];
			if ((result.match != undefined) && (result.match != null)) {
				for(var i = 0; i < result.match.length; i++) {
					if (result.match[i] != undefined){ //In case we get the too-many-cooks problem
						var leagueName = result.match[i].league[0];
						if (leagueName in leaguesDic){
							var matchId = result.match[i].id[0];
							
							//TODO: change according to XML!!
							var gameStatus = result.match[i].time[0];
							var homeGoals = parseInt(result.match[i].homegoals[0]);
							var awayGoals = parseInt(result.match[i].awaygoals[0]);
							log("score of game "+ matchId + ": "+homeGoals+"-"+awayGoals);
							
							updateLiveGameIfNeeded(matchId, gameStatus, homeGoals, awayGoals);
						}
					}
				}
			}
		});
	//console.log("finished updateLiveScoresInDB()");
}


//after checking if some information is new, the function updates games in db with changes in live scores,
//and then calls another function that sends notifications to relevant groups
function updateLiveGameIfNeeded(matchId, gameStatus, homeGoals, awayGoals){
	//log("in updateLiveGameIfNeeded() with matchId "+matchId);
	var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
	var query = new Parse.Query(LBFootballMatchClass);
	query.equalTo("matchId",matchId);
	query.first({
		success: function(match) {
			//match should exist in Parse:
			if (match != undefined && match != null) {
				log("Match exists in DB");
				var dbStatus = match.get("time");
				var dbHomeGoals = match.get("homeGoals");
				var dbAwayGoals = match.get("awayGoals");
				
				if ((dbStatus != gameStatus) || (dbHomeGoals != homeGoals) || (dbAwayGoals != awayGoals)){
					log("Found different score or time in DB. Updaing DB accordingly");
					match.set("time", gameStatus);
					match.set("homeGoals", homeGoals);
					match.set("awayGoals", awayGoals);
					
					match.save(null,{
						success:function(match_success) { 
							logOk("Succeeded updating match " + match_success.get("matchId"));
							if ((dbHomeGoals != homeGoals) || (dbAwayGoals != awayGoals)){	
								//TODO: not needed!
								sendMessageToRelevantGroupsThatScoreChanged(match_success);			
							}

							if (dbStatus != gameStatus){
								//send messages
								performRelevantActionsInRelevantGroupsBecauseStatusChanged(match_success);				
							}			
						},
						error:function(match_err, error) {
							logError("Error updating match in DB: "+error);
						}
					});
				}
			} else {
				logWarning("Didn't find match " + matchId + " in DB.");
			}
		},
		error: function(error) {
			logError("Error querying DB for match " + matchId + ": "+error);
		}
	});	
}

//Find groups that opened a bet regarding given gameId, and notify them with the relevant change
function sendMessageToRelevantGroupsThatScoreChanged(match){
	var matchId = match.get("matchId");
	log("About to send a message to all relevant groups about the change in the score of match " + matchId);
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass)
	query.equalTo("gameId",matchId);
	query.find({
		success: function(bets) {

			var homeTeamName = match.get("homeTeam")
			var awayTeamName = match.get("awayTeam")
			var homeTeamGoals = match.get("homeGoals");
			var awayTeamGoals = match.get("awayGoals");
			//If bets for given game exist:
			if (bets != undefined && bets != null) {	
				for(var i = 0; i < bets.length; i++) {
					var groupLayerId = bets[i].get("layerGroupId");
					log("About to notify group "+ groupLayerId+" that the score changed");
					var message = "GOAL! "+homeTeamName+" vs "+awayTeamName+" - "+homeTeamGoals+":"+awayTeamGoals+".";
					log("specficially: " + message);
					sendAdminMsgToGroup(groupLayerId, message,{});
				}	
			} else {
				logWarning("No bets exist for match " + matchId);
			}
		},
		error: function(error) {
			logError("Error finding match: " + error);
			response.error(error);
		}
	});
}

//Find groups that opened a bet regarding given gameId, and notify them with the relevant change
function performRelevantActionsInRelevantGroupsBecauseStatusChanged(match){
	//console.log("in performRelevantActionsInRelevantGroupsBecauseStatusChanged()");
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass)
	var matchId = match.get("matchId");
	
	query.equalTo("gameId",matchId);
	query.find({
		success: function(bets) {
			//If bets for given game exist:
			if (bets != undefined && bets != null) {	
				var homeTeamName = match.get("homeTeam")
				var awayTeamName = match.get("awayTeam")
				var homeTeamGoals = match.get("homeGoals");
				var awayTeamGoals = match.get("awayGoals");
				var gameTime = match.get("time");
				
				for(var i = 0; i < bets.length; i++) {
					var groupLayerId = bets[i].get("layerGroupId");
					if (gameTime == "0'"){
						var message = homeTeamName+" vs "+awayTeamName+" - The bet has started";
						sendAdminMsgToGroup(groupLayerId, message,{});
					}
					else if (gameTime == "Halftime"){
						var message = homeTeamName+" vs "+awayTeamName+" - "+homeTeamGoals+":"+awayTeamGoals+" - Half Time";
						sendAdminMsgToGroup(groupLayerId, message,{});
					}
				}
				if ((gameTime == "Finished") || (gameTime == "Finished AET") || (gameTime == "Finished AP")){
					updateEndedMatch(match, bets);
				}
			} else {
				logWarning("No bets exist for match " + matchId);
				
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
}

//send notifications to relevant groups, delete match from db, update statistics in relevant groups
function updateEndedMatch(match, bets){
	var matchId = match.get("matchId");
	log("Match " + matchId + " ended. Updating relevant groups.");
	var homeTeamName = match.get("homeTeam");
	var awayTeamName = match.get("awayTeam");
	var homeTeamId = match.get("homeTeamId");
	var awayTeamId = match.get("awayTeamId");
	var homeTeamGoals = parseInt(match.get("homeGoals"));
	var awayTeamGoals = parseInt(match.get("awayGoals"));
	
	for(var i = 0; i < bets.length; i++) {
		var bet = bets[i];
		var groupLayerId = bet.get("layerGroupId");
		var betStakeDesc = bet.get("stakeDesc");
		var betStakeType = bet.get("stakeType");
		var LBGroupClass = Parse.Object.extend("LBGroup");
		var query = new Parse.Query(LBGroupClass);
		query.equalTo("layerGroupId",groupLayerId);
		query.first({
			success: function(group) {
				//group exists:
				if (group != undefined && group != null) {
					log("Updating group " + groupLayerId);
					var currentStatistics = group.get("statistics");
					var groupUsersGuesses = bet.get("usersGuesses");
					
					var str = JSON.stringify(groupUsersGuesses, null, 4); // (Optional) beautiful indented output.
					log("The group's guesses are: "+ str); // Logs output to dev tools console.
					
					//update statistics
					var winnersArray = [];
					for (var userId in groupUsersGuesses) {
						userGuess = groupUsersGuesses[userId];
						if ((currentStatistics[userId] == undefined) || (currentStatistics[userId] == null)){
							logWarning("Stats of user " + userId + " are undefined. Initializing them");
							currentStatistics[userId] = {"bullseye":0, "almost":0, "lost":0, "points":0};	
						}
						userStatistics = currentStatistics[userId];
						log("userStatistics of " + userId + ": "+JSON.stringify(userStatistics, null, 4));
						
						var homeGuess = userGuess["homeGoals"];
						var awayGuess = userGuess["awayGoals"];
						//bullseye:
						if ((homeGuess == homeTeamGoals) && (awayGuess == awayTeamGoals)){
							//console.log("bullseye");
							winnersArray.push(userId);
							userStatistics["bullseye"] = userStatistics["bullseye"]+1;
							userStatistics["points"] = userStatistics["points"]+2;
							updateWinStatForUser(userId); //Will update both betsWon and betsParticipated
						}
						//almost:
						else if ( ((homeTeamGoals > awayTeamGoals) && (homeGuess > awayGuess)) ||
								  ((homeTeamGoals == awayTeamGoals) && (homeGuess == awayGuess)) ||
								  ((homeTeamGoals < awayTeamGoals) && (homeGuess < awayGuess)) ){
							//console.log("almost");							
							userStatistics["almost"] = userStatistics["almost"]+1;
							userStatistics["points"] = userStatistics["points"]+1;
							updateBetsParticipatedStatForUser(userId); //Will update betsParticipated
						}
						//lost bet:
						else{
							//console.log("lost ");
							userStatistics["lost"] = userStatistics["lost"]+1;
							updateBetsParticipatedStatForUser(userId); //Will update betsParticipated
						}
						currentStatistics[userId] = userStatistics;
					}
					
					log("Group's winners of this match are: "+JSON.stringify(winnersArray, null, 4));
					group.set("statistics",currentStatistics);
					
					bet.set("winnersArray",winnersArray);
					bet.save(null,{
						success:function(saved_bet) { 						
							//Delete last group's bet
							deleteLastBetOfGroup(groupLayerId);
							
							//Update last bet in group
							group.set("lastBetId",saved_bet.id);
							group.set("lastBetType","Football");

							group.save(null,{
								//TODO: send right msg + data{}
								success:function(group) { 
									logOk("saved statistics for group " + groupLayerId);
									var message = homeTeamName + " vs " + awayTeamName + " - " + homeTeamGoals + ":" + awayTeamGoals +
										" - Final Score - ";
									if (winnersArray.length == 0){
										message = message + "no winners here... try again!";
									}else if (winnersArray.length == 1){
										message = message + "Someone won the bet";
									}else{
										message = message + "Several users won the bet";
									}
									
									var data = {
										"msgType" : "footballBetEnded",
										"teamHomeName" : homeTeamName,
										"teamAwayName" : awayTeamName,
										"teamHomeId" : homeTeamId,
										"teamAwayId" : awayTeamId,
										"teamHomeGoals" : homeTeamGoals,
										"teamAwayGoals" : awayTeamGoals,
										"stakeDesc" : betStakeDesc,
										"stakeType" : betStakeType,
										"winnersArray" : winnersArray
									}
									
									console.log("gonna send them this message: "+message);
									sendAdminMsgToGroup(groupLayerId, message, data);
								},
								error:function(group, error) {
									logError("updateEndedMatch: error saving guesses: "+error);
								}
							});
						},
						error:function(group, error) {
							logError("failed saving winnersArray in football bet: "+error);
						}
					});
					
				} else {
					logError("updateEndedMatch error: group doesn't exist");
				}
			},
			error: function(error) {
				response.error(error);
			}
		});
	}
	
	match.destroy({});
}

//delete group's last bet from DB, given a groupLayerId
function deleteLastBetOfGroup(groupLayerId){
	log("deleteLastBetOfGroup of group "+groupLayerId);
	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);
	log("test 1");
	query.first({
		success: function(group) {
			//group exists:
			log("test 2");
			if (group != undefined && group != null) {
				log("in group "+groupLayerId);

				var betId = group.get("lastBetId");
				var betType = group.get("lastBetType");
				
				var LBBetClass;
				if (betType === "Football"){
					LBBetClass = Parse.Object.extend("LBFootballGameBet");
				}else if (betType === "Custom"){
					LBBetClass = Parse.Object.extend("LBCustomBet");
				}else{
					logWarning("Unknown last bet type in group");
				}
				var betQuery = new Parse.Query(LBBetClass);
				betQuery.equalTo("_id",betId);
				betQuery.first({
					success: function(betToDel) {
						if ((betToDel != undefined) && (betToDel != null)) {
							logOk("deleted "+betType+" bet "+betId+" from DB");
							betToDel.destroy({});
						}else{
							logError(betType+" bet "+betId+" was not found in bets DB");
						}
					},
					error: function(error) {
						logError("error fetching bet: "+error);
					}
				});
				
			} else {
				logError("deleteLastBetOfGroup error: group doesn't exist");
			}
		},
		error: function(error) {
			logError("deleteLastBetOfGroup error: "+error);
		}
	});
	
	
	
	
}

//Will update betsParticipated in user stats
function updateBetsParticipatedStatForUser(userLayerId){
	console.log("updateBetsParticipatedStatForUser");
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("layerIdentityToken",userLayerId);
	query.first({
		success: function(user) {
			//If user exists in Parse:
			if (user != undefined && user != null) {
				var amountOfBetsParticipated = user.get("betsParticipated");
				amountOfBetsParticipated = amountOfBetsParticipated + 1;
				user.set("betsParticipated",amountOfBetsParticipated);
				user.save(null,{
					success:function(user) { 
						console.log("succeeded saving betsParticipated");
					}, error:function(user, error) {
						console.log("failed saving betsParticipated");
					}
				});
			} else {
				console.log("Tried to update user stat but couldn't find user");
			}
		},
		error: function(error) {
			console.log("Tried to update user stat but failed performing query");
		}
	});
} 

//Will updateboth betsWon AND betsParticipated in user stats
function updateWinStatForUser(userLayerId){
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("layerIdentityToken",userLayerId);
	query.first({
		success: function(user) {
			//If user exists in Parse:
			if (user != undefined && user != null) {
				var amountOfBetsWon = user.get("betsWon");
				amountOfBetsWon = amountOfBetsWon + 1;
				user.set("betsWon",amountOfBetsWon);
				var amountOfBetsParticipated = user.get("betsParticipated");
				amountOfBetsParticipated = amountOfBetsParticipated + 1;
				user.set("betsParticipated",amountOfBetsParticipated);
				user.save(null,{
					success:function(user) { 
						console.log("succeeded saveing betsParticipated and betsWon");
					}, error:function(user, error) {
						console.log("failed saveing betsParticipated and betsWon");
					}
				});
			} else {
				console.log("Tried to update user stat but couldn't find user");
			}
		},
		error: function(error) {
			console.log("Tried to update user stat but failed performing query");
		}
	});
} 


Parse.Cloud.define("openNewCustomBet", function(request, response) {
	var betName = request.params.betName;
	var betDesc = request.params.betDesc;
	var betAdminLayerId = request.params.betAdminLayerId;
	var groupLayerId = request.params.groupLayerId;
	var adminGuess = request.params.adminGuess;
	var stakeType = request.params.stakeType;
	var stakeDesc = request.params.stakeDesc;
	var betPic = request.params.betPic;


	//New bet
	var LBCustomBetClass = Parse.Object.extend("LBCustomBet");
	var bet = new LBCustomBetClass();
	bet.set("betName",betName);
	bet.set("betDesc",betDesc);
	bet.set("betAdminLayerId",betAdminLayerId);
	bet.set("stakeType",stakeType);
	bet.set("stakeDesc",stakeDesc);
	bet.set("groupLayerId",groupLayerId);
	bet.set("betPic",betPic);

	var usersGuesses = {};
	bet.set("usersGuesses",usersGuesses);

	bet.save(null,{
		success:function(savedBet) { 
		
		/**
			//Save last bet in group
			var LBGroupClass = Parse.Object.extend("LBGroup");
			var group_query = new Parse.Query(LBGroupClass);
			group_query.equalTo("layerGroupId",groupLayerId);
			group_query.first({
				success: function(group) {
					//If group doesn't exist in Parse:
					if (group == undefined || group == null) {
						response.error("errorGroupDoesntExist");
					} else {
						//
						group.set("lastBetType","Custom");
						group.set("lastBetId", savedBet.id);
						group.save(null,{
							success:function(groupSuccess) { 
								console.log("updated lastBet in group in db");
							},
							error:function(groupError, error) {
								console.log("error updating last bet in group: "+error);
								var str = JSON.stringify(error, null, 4);
								console.log(str);
							}
						});
					}
				},
				error:function(group, error) {
					response.error("failed fetching group for updating last bet");
				}
			});*/
		
		
		
			//send admin msg to group
			var LBUserClass = Parse.Object.extend("LBUser");
			var userQuery = new Parse.Query(LBUserClass);
			userQuery.equalTo("layerIdentityToken", betAdminLayerId);
			userQuery.first({
				success: function(user) {
					//console.log("openNewCustomBet: found user");
					var data = {
						"msgType" : "newCustomBet",
						"betType": "customBet",
						"betId" : savedBet.id,
						"betAdminLayerId" : savedBet.get("betAdminLayerId"),
						"betAdminName" : user.get("name"),
						"betName" : savedBet.get("betName")
					}
					//console.log("openNewCustomBet: succeeded with data");

					var message = "" + user.get("name") +  " opened a new bet - " + savedBet.get("betName");
					//console.log("openNewCustomBet: gonna send "+message);
					sendAdminMsgToGroup(groupLayerId, message ,data);
					//sendAdminMsgToGroup(groupLayerId,message, {});
					//console.log("openNewCustomBet: returning success");
					response.success(true);
				}, 
				error:function(userErr, error) {
					console.log("openNewCustomBet: failed getting user");
					response.error(error);
				}
			});
		}, error:function(betErr, error) {
			console.log("openNewCustomBet: failed saving bet: "+error.message);
			response.error(error);
		}
			
	});
});

Parse.Cloud.define("addGuessToCustomBet", function(request, response) {
	var betId = request.params.betId;
	var userLayerId = request.params.userLayerId;
	var userGuess = request.params.userGuess;
	log(JSON.stringify(betId, null, 4));
	log(JSON.stringify(userLayerId, null, 4));
	log(JSON.stringify(userGuess, null, 4));
	
	var LBCustomBetClass = Parse.Object.extend("LBCustomBet");
	var query = new Parse.Query(LBCustomBetClass);
	query.equalTo("_id",betId);
	query.first({
		success: function(bet) {
			//If bet doesn't exist in DB:
			if ((bet == undefined) || (bet == null)) {
				response.error("custom bet not found in db");
			}else{
				//Add guess to bet
				var usersGuesses = bet.get("usersGuesses");
				
				log("these are the guesses before trying to add anything:");
				log(JSON.stringify(usersGuesses, null, 4));
				//make sure user didn't guess already
				for (var guess in usersGuesses){
					if (usersGuesses[guess].indexOf(userLayerId) > -1){
						log(usersGuesses[guess].indexOf(userLayerId));
						logWarning("user already placed a guess");
						response.error("user already placed a guess");
						return;
					}
				}
				
				if (userGuess in usersGuesses){
					logOk("pushed guess to userGuesses");
					usersGuesses[userGuess].push(userLayerId);
				}else{
					logOk("created new guess");
					usersGuesses[userGuess] = [userLayerId];
				}
				bet.save(null,{
					success:function(bet_success) { 

						logOk("succeeded adding guess to custom bet "+betId)
						
						var newUsersGuesses = bet_success.get("usersGuesses");
						log("these are the guesses after adding new guess:");
						log(JSON.stringify(newUsersGuesses, null, 4));
						
						sendAdminMsgToGroup(bet.get("groupLayerId"), "guess was added to custom bet", {});
						response.success(true);
					},
					error:function(bet, error) {

						logError("failed adding guess to custom bet "+betId)
						response.error(error);
					}
				});
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

Parse.Cloud.define("getAllCustomBetsForGroup", function(request, response) {
	var groupLayerId = request.params.groupLayerId;

	var LBCustomBetClass = Parse.Object.extend("LBCustomBet");
	var query = new Parse.Query(LBCustomBetClass);
	query.equalTo("groupLayerId",groupLayerId);
	query.find({
		success: function(bets) {
			//If bet doesn't exist in DB:
			if ((bets == undefined) || (bets == null)) {
				response.error("no custom bets for group");
			}else{
				response.success(bets);
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

Parse.Cloud.define("closeCustomBet", function(request, response) {
	
	//TODO: finish admin msg
	
	
	var betId = request.params.betId;
	var userLayerId = request.params.userLayerId;
	var winningGuess = request.params.winningGuess;

	var LBCustomBetClass = Parse.Object.extend("LBCustomBet");
	var query = new Parse.Query(LBCustomBetClass);
	query.equalTo("_id",betId);
	query.first({
		success: function(bet) {
			//If bet doesn't exist in DB:
			if ((bet == undefined) || (bet == null)) {
				logError("custom bet wasn't found");
				response.error("bet wasn't found");
			}else{
				if (bet.get("betAdminLayerId") != userLayerId){
					logError(userLayerId+" isn't an admin, thus can't close the bet");
					response.error("this user isn't an admin, thus can't close the bet");
				}else{
					//Update stats according to guesses
					var bullseyeArray = [];
					var lostArray = [];
					usersGuesses = bet.get("usersGuesses");
					if (!(winningGuess in usersGuesses)){
						logWarning("winning guess wasn't even a possibility");
						response.error("winning guess wasn't even a possibility");
						return;
					}
					for (var guess in usersGuesses) {
						if (usersGuesses.hasOwnProperty(guess)) {
							var usersArray = usersGuesses[guess];
							//Someone guessed right
							if (winningGuess === guess){
								for (var i = 0; i < usersArray.length; i++) {
									var userId = usersArray[i];
									log("user " + userId + " guessed right");
									updateWinStatForUser(userId);
									bullseyeArray.push(userId);
								}
							}else{
								for (var i = 0; i < usersArray.length; i++) {
									var userId = usersArray[i];
									log("user " + usersArray[i] + " guessed wrong");
									updateBetsParticipatedStatForUser(usersArray[i]);
									lostArray.push(userId);
								}
							}
						}
					}
					
					var winnersArray = usersGuesses[winningGuess];
					bet.set("winnersArray",winnersArray);
					bet.save(null,{
						success:function(saved_bet) { 
							var groupLayerId = saved_bet.get("groupLayerId");
					
							//Delete last bet
							log("trying to delete last bet in group (for custom bet)");
							deleteLastBetOfGroup(groupLayerId);
							//Update last bet
							log("trying to update last bet in group (for custom bet)");
							var LBGroupClass = Parse.Object.extend("LBGroup");
							var query_group = new Parse.Query(LBGroupClass);
							query_group.equalTo("layerGroupId",groupLayerId);
							query_group.first({
								success: function(group) {
									//If group doesn't exist in DB:
									if ((group == undefined) || (group == null)) {
										response.error("trying to update last bet: group wasn't found");
									}else{
										//Updating last bet
										group.set("lastBetId",saved_bet.id);
										group.set("lastBetType","Custom");
										//Updating stats:
										var newStatistics = group.get("statistics");
										var newStatisticsStr = JSON.stringify(newStatistics, null, 4);
										log("current statistics of group: "+ newStatisticsStr);
										for (var j = 0; j < winnersArray.length; j++) {
											var userId = winnersArray[j];
											if (!(userId in newStatistics)){
												log("user "+userId+ " doesn't exist in group stats, so adding it with bullseye points already");
												newStatistics[userId] = {"bullseye":1, "almost":0, "lost":0, "points":3};	
											}else{
												log("updating a bullseye for user "+userId);
												var bullseyes = (newStatistics[userId])["bullseye"];
												var pnts = (newStatistics[userId])["points"];
												bullseyes = bullseyes + 1;
												pnts = pnts + 3;
												(newStatistics[userId])["bullseye"] = bullseyes;
												//newStatistics[userId].push({key:"bullseye", value:bullseyes});
												(newStatistics[userId])["points"] = pnts;
												//newStatistics[userId].push({key:"points", value:pnts});
											}
										}
										for (var k = 0; k < lostArray.length; k++) {
											var userId = lostArray[k];
											if (!(userId in newStatistics)){
												log("user "+userId+ " doesn't exist in group stats, so adding it with bullseye points already");
												newStatistics[userId] = {"bullseye":0, "almost":0, "lost":1, "points":0};	
											}else{
												log("updating a bullseye for user "+userId);
												var losts = (newStatistics[userId])["lost"];
												losts = losts + 1;
												(newStatistics[userId])["lost"] = losts;
												//newStatistics[userId].push({key:"lost", value:losts});
											}
										}
										
										var newStatisticsStr = JSON.stringify(newStatistics, null, 4);
										log("new statistics of group: "+ newStatisticsStr);
										
										group.set("statistics",newStatistics);
										
										log("trying to save last bet details");
										group.save(null,{
											success:function(group) { 
												logOk("succeeded saving last bet details");
												var message = "Custom bet finished";
												var data = {
														"msgType" : "CustomBetFinished",
														"winners" : winnersArray,
														"winnersArray" : winnersArray,
														"betName" : saved_bet.get("betName"),
														"stakeDesc" : saved_bet.get("stakeDesc"),
														"stakeType" : saved_bet.get("stakeType")
													}			
												sendAdminMsgToGroup(groupLayerId,message, data);
												//updateLastCustomBetOfGroup(betId, groupLayerId);
												response.success();
											},
											error:function(group, error) {
												logError("failed saving last bet: "+error);
											}
										});
									}
								},
								error: function(error) {
									logError("closeCustomBet baa: "+error);
									response.error(error);
								}
							});							
						},
						error:function(group, error) {
							logError("failed saving winnersArray in last bet: "+error);
						}
					});



					
					
				}
			}
		},
		error: function(error) {
			logError("closeCustomBet baaaaa: "+error);
			response.error(error);
		}
	});
});


/**
function updateLastCustomBetOfGroup(betId, groupLayerId){
	//var s4s

	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.first({
		success: function(group) {
			if (group != undefined && group != null) {
				//delete previous last bet and update to current bet
				var previousLastBetID = group.get("lastBetId");
				log("previous lastBetId: "+previousLastBetID);
				var previousLastBetType = group.get("lastBetType");
				console.log(previousLastBetType);
				if (previousLastBetType == "Custom"){	
					var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
					var queryBet = new Parse.Query(LBFootballGameBetClass);
					queryBet.equalTo("_id", previousLastBetID);
					queryBet.first({
						success: function(betToDel) {
							if ((betToDel != undefined) && (betToDel != null)) {
								betToDel.destroy({});
							}
							else{
								console.log("last bet not found in bets DB");
							}
						},error:function(bet, error) {
							console.log("updateEndedMatch: error finding bet: "+error.message);
						}
					});
				}
				else if (previousLastBetType == "Custom"){
					logWarning("got custom bet for some reason");
					return;
					
				}else{
					logWarning("Unknown last bet type");
					return;
				}
				
				
				
				
				var str = JSON.stringify(groupUsersGuesses, null, 4); // (Optional) beautiful indented output.
				console.log("userGuesses: "+str); // Logs output to dev tools console.
				
				//update statistics
				var winnersArray = [];
				for (var userId in groupUsersGuesses) {
					userGuess = groupUsersGuesses[userId];
					if ((currentStatistics[userId] == undefined) || (currentStatistics[userId] == null)){
						console.log("stats undefined");
						currentStatistics[userId] = {"bullseye":0, "almost":0, "lost":0, "points":0};	
					}
					userStatistics = currentStatistics[userId];
					console.log("userStatistics: "+JSON.stringify(userStatistics, null, 4));
					
					var homeGuess = userGuess["homeGoals"];
					var awayGuess = userGuess["awayGoals"];
					//bullseye:
					if ((homeGuess == homeTeamGoals) && (awayGuess == awayTeamGoals)){
						//console.log("bullseye");
						winnersArray.push(userId);
						userStatistics["bullseye"] = userStatistics["bullseye"]+1;
						userStatistics["points"] = userStatistics["points"]+2;
						updateWinStatForUser(userId); //Will update both betsWon and betsParticipated
					}
					//almost:
					else if ( ((homeTeamGoals > awayTeamGoals) && (homeGuess > awayGuess)) ||
							  ((homeTeamGoals == awayTeamGoals) && (homeGuess == awayGuess)) ||
							  ((homeTeamGoals < awayTeamGoals) && (homeGuess < awayGuess)) ){
						//console.log("almost");							
						userStatistics["almost"] = userStatistics["almost"]+1;
						userStatistics["points"] = userStatistics["points"]+1;
						updateBetsParticipatedStatForUser(userId); //Will update betsParticipated
					}
					//lost bet:
					else{
						//console.log("lost ");
						userStatistics["lost"] = userStatistics["lost"]+1;
						updateBetsParticipatedStatForUser(userId); //Will update betsParticipated
					}
					currentStatistics[userId] = userStatistics;
				}
				
				console.log("winners: "+JSON.stringify(winnersArray, null, 4));
				
				group.set("statistics",currentStatistics);
				
				group.set("lastBetId",bet.id);
				group.set("lastBetType","Football");

				group.save(null,{
					
					
					//TODO: send right msg + data{}
					
					
					success:function(group) { 
						console.log("saved statistics for group "+groupLayerId);
						var message = homeTeamName+" vs "+awayTeamName+" - "+homeTeamGoals+":"+awayTeamGoals+". ";
						if (winnersArray.length > 0){
							message = message + "Someone won the bet!";
						}else{
							message = message + "No one won the bet =(";
						}
						
						console.log("gonna send them this message: "+message);
						sendAdminMsgToGroup(groupLayerId, message,{});
					},
					error:function(group, error) {
						console.log("updateEndedMatch: error saving guesses: "+error);
					}
				});
			} else {
				console.log("updateEndedMatch error: group doesn't exist");
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
}*/

Parse.Cloud.define("getStatisticsForGroup", function(request, response) {
	var groupLayerId = request.params.groupLayerId;

	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.first({
		success: function(group) {
			//If group doesn't exist in DB:
			if ((group == undefined) || (group == null)) {
				response.error("group wasn't found");
			}else{
				var stats = group.get("statistics");
				//console.log("stats: "+JSON.stringify(stats, null, 4));
				var result = [];
				//Sorting, bitch:
				var len = Object.keys(stats).length;
				for (var i = 0; i < len; i++) {
					var bestUserIdSoFar = "";
					var bestPointsSoFar = -1;
					for (var userId in stats) {
						if ((stats.hasOwnProperty(userId)) && (stats[userId] != undefined)) {
							var userStats = stats[userId];
							var userPoints = userStats["points"]; 
							if (userPoints > bestPointsSoFar){
								bestUserIdSoFar = userId;
								bestPointsSoFar = userPoints;
							}
							
						}
					}
					stats[bestUserIdSoFar]["userId"] = bestUserIdSoFar;
					result.push(stats[bestUserIdSoFar]);
					stats[bestUserIdSoFar] = undefined;
				}		
				// -- boom
				
				//console.log("returning: "+JSON.stringify(result, null, 4));
				response.success(result);
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

//WinStats and Percentages
Parse.Cloud.define("getStatsForUser", function(request, response) {
	var userLayerId = request.params.userLayerId;
	
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("layerIdentityToken", userLayerId);
	query.select("betsWon", "betsParticipated");
	query.first({
		success: function(userStats) {
			//If user exists in Parse:
			if (userStats != undefined && userStats != null) {
				response.success(userStats);
			} else {
				response.error("getStatsForUser: User doesn't exist");
			}
		},
		error: function(error) {
			response.error(error);
		}
	});

});



//Get last bet (whether it's football or custom bet)
Parse.Cloud.define("getLastBetForGroup", function(request, response) {
	var groupLayerId = request.params.groupLayerId;
	
	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.first({
		success: function(group) {
			//If group doesn't exist in DB:
			if ((group == undefined) || (group == null)) {
				response.error("group wasn't found");
			}else{
				var lastBetId = group.get("lastBetId");
				var lastBetType = group.get("lastBetType");
				var LBBetClass;
				if (lastBetType === "Football"){
					LBBetClass = Parse.Object.extend("LBFootballGameBet");
				}else if (lastBetType === "Custom"){
					LBBetClass = Parse.Object.extend("LBCustomBet");
				}else if (lastBetType === ""){
					logW("no last bet exist");
					response.error("No last bet exist (probably first bet just ended)");
				}else{
					response.error("Unknown last bet type in group");
				}
				var betQuery = new Parse.Query(LBBetClass);
				betQuery.equalTo("_id",lastBetId);
				betQuery.first({
					success: function(lastBet) {
						if ((group != undefined) && (group != null)) {
							response.success(lastBet);
						}else{
							response.error("last bet wasn't found");
						}
					},
					error: function(error) {
						response.error("error fetching last bet: "+error);
					}
				});
			}
		},
		error: function(error) {
			response.error(error);
		}
	});

});

//for given array of userLayerId, get objects (nickname & picture)
//every time app is opened
Parse.Cloud.define("getUserObjectsForUserLayerIds", function(request, response) {
	var userLayerIdsArray = request.params.userLayerIdsArray;
	
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.containedIn("layerIdentityToken",userLayerIdsArray);
	query.select("name", "phoneNumber", "layerIdentityToken", "picture");
	query.find({
		success: function(users) {
			response.success(users);
		},
		error: function(error) {
			response.error(error);
		}
	});
	
	
});

//for given array of groupLayerId, get pictures
//every time app is opened
Parse.Cloud.define("getGroupPicturesForGroupLayerIds", function(request, response) {
	var groupLayerIdsArray = request.params.groupLayerIdsArray;


	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.containedIn("layerGroupId",groupLayerIdsArray);
	query.select("layerGroupId", "picture");
	query.find({
		success: function(results) {
			response.success(results);
		},
		error: function(error) {
			response.error(error);
		}
	});
});


Parse.Cloud.define("updateGroupPictureForGroupLayerId", function(request, response) {
	
		var groupLayerId = request.params.groupLayerId;
		var picture = request.params.picture;

		var LBGroupClass = Parse.Object.extend("LBGroup");
		var query = new Parse.Query(LBGroupClass);
		query.equalTo("layerGroupId",groupLayerId);
		query.first({
			success: function(group) {
				group.set("picture", picture);
				group.save(null,{
					success:function(groupSuccess) { 
						sendAdminMsgToGroup(groupLayerId, "Group info changed", {});
						response.success("success: picture changed");	
					},
					error:function(groupError, error) {
						response.error(error);
					}
				});
			},
			error: function(error) {
				response.error(error);
			}
		});

});

Parse.Cloud.define("sendAdminMessageToGroup", function(request, response) {
	var groupLayerId = request.params.groupLayerId;
	var senderLayerId = request.params.senderLayerId;
	var message = request.params.message;
	
	log(senderLayerId + " asked to send '" + message + "' to group " + groupLayerId);
	sendAdminMsgToGroup(groupLayerId, message, {});
});





var colors = {"Black":"\x1b[30m", "Red":"\x1b[31m", "Green":"\x1b[32m", "Yellow":"\x1b[33m", "Blue":"\x1b[34m", "Magenta":"\x1b[35m", "Cyan":"\x1b[36m", "White":"\x1b[37m"}
function logOk(msg) {
	console.log(colors["Green"], msg); 
}
function logWarning(msg) {
	console.log(colors["Yellow"], msg); 
}
function logError(msg) {
	console.log(colors["Red"], msg); 
}
function log(msg) {
	console.log(colors["Magenta"], msg); 
}
function logError(msg) {
	console.log(colors["Red"], msg); 
}

