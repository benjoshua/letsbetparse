
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

// -------------------------getUserObjectsForPhoneNumbers----------------------------

//Given an array of phone numbers (Strings), returun an equivalent array of User Objects
//Phone numbers should be in form of +972...
Parse.Cloud.define("getUserObjectsForPhoneNumbers", function(request, response) {
	var phoneNumbersArray = request.params.phoneNumbers;
	
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.containedIn("phoneNumber",phoneNumbersArray);
	query.select("name", "phoneNumber", "layerIdentityToken");
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

	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);

	query.first({
		success: function(group) {
			//group already exists:
			if (group != undefined && group != null) {
				response.error("errorGroupAlreadyExists");
			} else {
				//New Group
				var group = new LBGroupClass();
				group.set("layerGroupId",groupLayerId);
				group.set("groupAdminLayerId",groupAdminLayerId);
				group.save(null,{
					success:function(group) { 
						var LBUserClass = Parse.Object.extend("LBUser");
						var userQuery = new Parse.Query(LBUserClass);
							
						userQuery.equalTo("layerIdentityToken", groupAdminLayerId);
						userQuery.first({
							success: function(user) {
								sendAdminMsgToGroup(groupLayerId, "" + user.get("name") + " opened a new group", {});
								response.success(true);
							},
							error:function(bet, error) {
								response.error(error);
							}
						});
					},
					error:function(group, error) {
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
	var hostAdminGoalsBet = request.params.hostAdminGoalsBet;
	var guestAdminGoalsBet = request.params.guestAdminGoalsBet;
	var stakeType = request.params.stakeType;
	var stakeDesc = request.params.stakeDesc;
	
	
	//TODO: maybe delete, cause we can get this information from our API
	var teamHostName =  request.params.teamHostName;
	var teamGuestName =  request.params.teamGuestName;
	var betDueDateLong =  request.params.betDueDateLong;
	
	
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.equalTo("gameId",gameId);

	query.first({
		success: function(bet) {
			//If bet for group already exists in Parse:
			if (bet != undefined && bet != null) {
				response.error("errorBetAlreadyExists");
			} else {
				//New bet
				var bet = new LBFootballGameBetClass();
				bet.set("layerGroupId",groupLayerId);
				bet.set("gameId",gameId);
				bet.set("betAdminLayerId",betAdminLayerId);
				var usersGuesses = {};
				usersGuesses[betAdminLayerId] = {"hostGoals": hostAdminGoalsBet, "guestGoals": guestAdminGoalsBet};
				bet.set("usersGuesses",usersGuesses);
				bet.set("stakeType",stakeType);
				bet.set("stakeDesc",stakeDesc);
				
				//TODO: maybe delete, cause we can get this information from our API
				bet.set("teamHostName",teamHostName);
				bet.set("teamGuestName",teamGuestName);
				bet.set("betDueDateLong",betDueDateLong);
				
				
				
				bet.save(null,{
					success:function(savedBet) { 
							var LBUserClass = Parse.Object.extend("LBUser");
							var userQuery = new Parse.Query(LBUserClass);
							
							userQuery.equalTo("layerIdentityToken", betAdminLayerId);
							userQuery.first({
								success: function(user) {

									var data = {
										"betId" : savedBet.id
									}

									sendAdminMsgToGroup(groupLayerId, "" + user.get("name") +  " opened a new bet!",data);
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
	var goalsTeamHost = request.params.goalsTeamHost;
	var goalsTeamGuest = request.params.goalsTeamGuest;
	
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

				usersGuesses[userLayerId] = {"hostGoals": goalsTeamHost, "guestGoals": goalsTeamGuest};				
				bet.save(null,{
					success:function(bet) { 
							var LBUserClass = Parse.Object.extend("LBUser");
							var userQuery = new Parse.Query(LBUserClass);
							
							userQuery.equalTo("layerIdentityToken", userLayerId);
							userQuery.first({
								success: function(user) {
									if ((user == undefined) || (user == null)){
										response.error("couldn't find userID to add his guess");
									}else{
										//TODO: make sure what's the right behavior for updating etc.
										sendAdminMsgToGroup(groupLayerId, "" + user.get("name") + " added a guess to bet " + bet.id, {});
										response.success(true);
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
Parse.Cloud.define("testRepeatinFunctions", function(request, response) {
	/*var body = "<XMLSOCCER.COM><Match><Id>360017</Id><Date>2016-04-09T22:00:00+00:00</Date><League>Mexican Primera League</League><Round>13</Round><HomeTeam>CF America</HomeTeam><HomeTeam_Id>623</HomeTeam_Id><AwayTeam>Tijuana</AwayTeam><AwayTeam_Id>632</AwayTeam_Id><Location>Estadio Azteca</Location></Match><Match><Id>361017</Id><Date>2016-04-09T21:30:00+00:00</Date><League>Major League Soccer</League><Round>1</Round><HomeTeam>DC United</HomeTeam><HomeTeam_Id>574</HomeTeam_Id><AwayTeam>Vancouver Whitecaps</AwayTeam><AwayTeam_Id>577</AwayTeam_Id><Location>RFK Stadium</Location></Match><AccountInformation>Data requested at 3/21/2016 4:44:19 PM from 62.219.35.63, Username: Letsbet. Your current supscription runs out on 3/21/2017 2:17:33 PM.</AccountInformation></XMLSOCCER.COM>";
	parseString(body, function (err, result) {
		console.log(result);
		updateComingGames();
		//response.success(result);
	});*/
	
	
	updateComingGames();
	//updateLiveScores();
	
	//response.success();
});

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

//Called daily
function updateComingGames() {
	var bodyWithXml = "<?xml version='1.0' encoding='utf-8'?><XMLSOCCER.COM><Match><Id>360017</Id><Date>2016-04-09T22:00:00+00:00</Date><League>Mexican Primera League</League><Round>13</Round><HomeTeam>CF America</HomeTeam><HomeTeam_Id>623</HomeTeam_Id><AwayTeam>Tijuana</AwayTeam><AwayTeam_Id>632</AwayTeam_Id><Location>Estadio Azteca</Location></Match><Match><Id>361017</Id><Date>2016-04-09T21:30:00+00:00</Date><League>Major League Soccer</League><Round>1</Round><HomeTeam>DC United</HomeTeam><HomeTeam_Id>574</HomeTeam_Id><AwayTeam>Vancouver Whitecaps</AwayTeam><AwayTeam_Id>577</AwayTeam_Id><Location>RFK Stadium</Location></Match><AccountInformation>Data requested at 3/21/2016 4:44:19 PM from 62.219.35.63, Username: Letsbet. Your current supscription runs out on 3/21/2017 2:17:33 PM.</AccountInformation></XMLSOCCER.COM>";
	var body = bodyWithXml.split('>')[1];
	body = "<user>text data</user>"
	console.log(body);
	//var body = "<XMLSOCCER.COM><Match><Id>360017</Id><Date>2016-04-09T22:00:00+00:00</Date><League>Mexican Primera League</League><Round>13</Round><HomeTeam>CF America</HomeTeam><HomeTeam_Id>623</HomeTeam_Id><AwayTeam>Tijuana</AwayTeam><AwayTeam_Id>632</AwayTeam_Id><Location>Estadio Azteca</Location></Match><Match><Id>361017</Id><Date>2016-04-09T21:30:00+00:00</Date><League>Major League Soccer</League><Round>1</Round><HomeTeam>DC United</HomeTeam><HomeTeam_Id>574</HomeTeam_Id><AwayTeam>Vancouver Whitecaps</AwayTeam><AwayTeam_Id>577</AwayTeam_Id><Location>RFK Stadium</Location></Match><AccountInformation>Data requested at 3/21/2016 4:44:19 PM from 62.219.35.63, Username: Letsbet. Your current supscription runs out on 3/21/2017 2:17:33 PM.</AccountInformation></XMLSOCCER.COM>";
	parseString(body, function (err, result) {
		console.log("finished parsing");
		console.log(result);
		updateComingGamesInDB(result);
		//response.success(result);
	});
	
	/*
	var xmlSoccerApiKey = process.env.XML_SOCCER_KEY;
	var xmlSoccerUrl = "http://www.xmlsoccer.com/FootballData.asmx/";
		

	
	var startDate = new Date();
	var endDate = new Date();
	endDate.setDate(endDate.getDate()+14);

	var fullUrl = ""+xmlSoccerUrl + "GetFixturesByDateInterval"+"?Apikey="+xmlSoccerApiKey+"&"+"startDateString="
			+formatDate(startDate)+"&endDateString="+formatDate(endDate);
	console.log(fullUrl);
	
	request({
	    uri: fullUrl,
	    method: "GET",
	    json: true,
	    }, function(error, response, body) {
				//var xml = "<root>Hello xml2js!</root>";
				parseString(body, function (err, result) {
					console.log(result);
					response.success(result);
				});
			console.log("ppppppppppppppppppppppppppppppppppppppppppppppppp");
			console.log(error);
			console.log("wwwwwwwwwwwwwwwwwww");
			console.log(response);
			console.log(body);
	    	updateComingGamesInDB(body);
	});*/
}

function updateComingGamesInDB(xmlFutureMatches){
	console.log("updateComingGamesInDB");
	// get XML 
	//var xml = xhr.responseXML;
	
	
	var leaguesId = ["1","4","5","7","8","16","56"];
	var leaguesDic = {
		"English Premier League":1,
		"Bundesliga":4,
		"Serie A":5,
		"Ligue 1":7,
		"La Liga":8,
		"Champions League":16,
		"EURO 2016":56
	};
	
	var parser = new xml2js.Parser({explicitRoot: false, }); //Without "XMLSOCCER.COM"
	fs.readFile('./matches.xml', function(err, data) {
		console.log("1");
		//console.log(data);
		//console.log(err);
		parser.parseString(data, function (err, result) {
			console.log("2");
			//console.dir(result);
			
			//var bla = JSON.stringify(result);
			//console.log(bla);
			
			var resultArr = [];
			for(var i = 0; i < result.Match.length; i++) {
				var matchId = result.Match[i].Id[0];
				var date = result.Match[i].Date[0];
				var leagueName = result.Match[i].League[0];
				var homeTeam = result.Match[i].HomeTeam[0];
				var homeTeamId = result.Match[i].HomeTeam_Id[0];
				var awayTeam = result.Match[i].AwayTeam[0];
				var awayTeamId = result.Match[i].AwayTeam_Id[0];
				var loc = result.Match[i].Location[0];
				if (leagueName in leaguesDic){
					var leagueId = leaguesDic[leagueName];
					console.log("gameID "+ matchId + " is in league "+leagueId +" on "+date);
					
					/**
					var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
					var query = new Parse.Query(LBFootballMatchClass);
					query.equalTo("matchId",matchId);
					query.first({
						success: function(match) {
							//If match already exists in Parse:
							if (user != undefined && user != null) {
								//stuff
							} else {
							//New match
							var match = new LBFootballMatchClass();
							match.set("matchId",matchId);
							match.set("date",date);
							match.set("leagueId",leagueId);
							match.set("homeTeam",homeTeam);
							match.set("homeTeamId",homeTeamId);
							match.set("awayTeam",awayTeam);
							match.set("awayTeamId",awayTeamId);
							match.set("location",location);

							
							match.save(null,{
								success:function(match) { 
									//yofi
								},
								error:function(match, error) {
									response.error(error);
								}
							});
							
						},
						error: function(error) {
							response.error(error);
						}
					});
					*/
					
				}
			   
			}
			
			
			//var matches = result.getElementsByTagName("user");
			//console.log("----------------");
			//console.log(matches);
			
			console.log('Done');
		});
	});
	
	console.log("after updateComingGamesInDB");
	
	/**
	
	
	
	
	

	console.log(xmlFutureMatches);
	xmlFutureMatches = loadXMLDoc("file:///C:/Users/Popo/Dropbox/Yohapimer/xml_example.xml"); 
	console.log(xmlFutureMatches);
	// get users
	//var matches = xmlFutureMatches.getElementsByTagName("XMLSOCCER.COM");
	var matches = xmlFutureMatches.getElementsByTagName("user");;
	console.log("----------------");
	console.log(matches);
	for (var i = 0; i < matches.length; i++) {   
		console.log("***********");
		console.log(matches(i));
		var match = matches[i].firstChild.nodeValue;
		console.log("@@@@@@@@@@@@@@@@@@@@@@");
		console.log(matches[i].firstChild);
		console.log("@@@@@@@@@@@@@@@@@@@@@@");
		console.log(matches[i].firstChild.nodeValue);
		
		
	}   
	*/
}


//Called eery 30 seconds
function updateLiveScores() {
	request({
	    uri: layerPlatformApiInfo.config.serverUrl + "/conversations/" + groupLayerId + "/messages",
	    method: "POST",
	    body: {
	        sender: {name: "Admin"},
	        parts: [{body: msg, mime_type: "text/plain"}],
	        notification: {text: msg, data: dataDic},
	    },
	    json: true,
	    headers: layerPlatformApiInfo.headers
	    }, function(error, response, body) {
	    	
		});
}



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



function sendAdminMsgToGroup(groupLayerId, msg, dataDic) {
	request({
	    uri: layerPlatformApiInfo.config.serverUrl + "/conversations/" + groupLayerId + "/messages",
	    method: "POST",
	    body: {
	        sender: {name: "Admin"},
	        parts: [{body: msg, mime_type: "text/plain"}],
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
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
	query.equalTo("layerGroupId",groupLayerId);
	query.find({
		success: function(bets) {
			if (bets.length == 0){
				response.error("GroupId not found or no bets exist"); //TODO: distinct between the two
			}
			else{
				response.success(bets);
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



