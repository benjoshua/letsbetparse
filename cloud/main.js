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


var layerAPI = require('layer-api');


// ---------------------- global variables ------------------

//For not calling XMLSOCCER too many times, change to TRUE:
var shouldUseXmlExamples = false;


var layer = new layerAPI({
  token: process.env.LAYER_PLATFORM_API_TOKEN,
  appId: process.env.LAYER_APP_UUID
});

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

var coinsConstants = {
    initialAmount: 10000, 
    periodicBonusAmount: 2000,
    periodicBonusIntervalInDays: 7 // 1 week
}


// ---------------------- boot + background operations ------------------

// live update
var liveUpdateMinutes = 0.5; //30 seconds, to be on the safe side
if (shouldUseXmlExamples == true){
	liveUpdateMinutes = 10000;
}
var liveUpdateInterval = liveUpdateMinutes * 60 * 1000;
setInterval(function() {
	updateLiveScores();
}, liveUpdateInterval);

// games update
var dbGamesUpdateHours = 24;
var dbGamesUpdateInterval = dbGamesUpdateHours * 60 * 60 * 1000; // if we want 11 mins. - 11*60*1000
//var dbGamesUpdateInterval = 1 * 60 * 1000;
setInterval(function() {
  updateComingGames();
}, dbGamesUpdateInterval);
// first time call, slightly delayed from boot
setTimeout(updateComingGames, 5000);


// coins bonus
var coinsBonusUpdateHours = 24;
var coinsBonusUpdateInterval = coinsBonusUpdateHours * 60 * 60 * 1000;
setInterval(function() {
  checkCoinsBonus();
}, coinsBonusUpdateInterval);
// first time call, slightly delayed from boot
setTimeout(checkCoinsBonus, 5000);


// migrate users to coins, slightly delayed from boot
setTimeout(migrateUsersToCoins, 5000);


setTimeout(function(){
    console.log('---------- Updating! -----------');
    updateLiveGameIfNeeded("370097", "Finished", 1, 0);
}, 30000);

// ---------------------- utils ------------------

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

function generateUuid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
		.toString(16)
		.substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	s4() + '-' + s4() + s4() + s4();
}

function sendAdminMsgToGroup(groupLayerId, msg, dataDic) {
    logMethod("[sendAdminMsgToGroup] with msg:", msg, "sending to", groupLayerId);
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

function sendAnnouncementToUser(userLayerId, msg, dataDic, dedupeId) {
    logMethod("[sendAnnouncementToUser] with msg:", msg, "sending to", userLayerId);
	// prepare payload
    var payload = {
      recipients: [userLayerId],
      sender: {
        name: 'Lets Bet'
      },
        parts: [{body: msg, mime_type: "text/plain"}, {body: JSON.stringify(dataDic), mime_type: "text/javascript"}],
        notification: {text: msg, data: dataDic},
    };
    // prepare callback
    var callback = function(err, res) {
      if (err) return console.error(err);

      // announcement data 
      // var announcement = res.body;
    };
    
    // send
    if (dedupeId)
        layer.announcements.sendDedupe(dedupeId, payload, callback);
    else 
        layer.announcements.send(payload, callback);
}

function getNowTime(){
    var now = new Date();
    now.setHours(0,0,0,0);
    return now.getTime();
}

// ---------------------- scripts ------------------

function migrateUsersToCoins(){
    logMethod('[migrateUsersToCoins] start');
    // [query class]
    var LBUserClass = Parse.Object.extend("LBUser");
    var query = new Parse.Query(LBUserClass);
    // [query conditions]
    query.doesNotExist("totalCoins");
    // [query run]
    query.find({
        success: function(users) {
            logInfo('[migrateUsersToCoins] got ' + users.length +' users');
            for (var i in users){
                var user = users[i];
                var total = user.get("totalCoins");
                var available = user.get("availableCoins");
                if (total == undefined || total == null || available == undefined || available == null) {
                    logInfo('[migrateUsersToCoins] migrating user:', user.get("layerIdentityToken"));
                    user.set("totalCoins",coinsConstants.initialAmount);
                    user.set("availableCoins",coinsConstants.initialAmount);
                    user.set("nextBonusTime", getNextPeriodicBonusTime());
                    user.save();
                }
            }
            logMethod('[migrateUsersToCoins] done');
        },
        error:function(error) {
            logError('[migrateUsersToCoins] query error:', error);
        }
    });
}



/********************************************************************
 | Users
********************************************************************/

// -------------------------sendSmsForPhoneNumber----------------------------
//Sends sms to user and saves the loginCode in Parse
Parse.Cloud.define("sendSmsForPhoneNumber", function(request, response) {
	var phoneNumber = request.params.phoneNumber;
	var code = "" + (Math.floor(Math.random()*90000) + 10000);
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
			     var user = createUser(LBUserClass, phoneNumber, code);
			     saveUserAndSendSMS(user, phoneNumber, code, response); //TODO: stopped sending SMS for now, so it returns success anyhow
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

function getNextPeriodicBonusTime(){
    var next = new Date(getNowTime() + coinsConstants.periodicBonusIntervalInDays * 24 * 60 * 60 * 1000);
    return next.getTime();
}

// creates user given class, phone number, code
function createUser(LBUserClass, phoneNumber, code) {
    var user = new LBUserClass();
    // identification
    user.set("phoneNumber",phoneNumber);
    user.set("loginCode",code);
    user.set("layerIdentityToken",generateUuid());
    
    // attributes
    user.set("name","");
    
    // bets
    user.set("betsWon",0);
    user.set("betsParticipated",0);
    
    
    // coins
    user.set("totalCoins",coinsConstants.initialAmount);
    user.set("availableCoins",coinsConstants.initialAmount);
    
    // next bonus time
    
    
    user.set("nextBonusTime", getNextPeriodicBonusTime());
    
    return user;
}

//Practically send the SMS, after saving all data in Parse
function saveUserAndSendSMS(user, phoneNumber, code, response) {
	logMethod("[saveUserAndSendSMS] started");
	user.save(null,{
		success:function(user) {
			logOk("[saveUserAndSendSMS] user saved successfully");
			//TODO: return to Twilio! now we just send success
			response.success(true);
            //  print code and return if dev env
            if (process.env.ENV === "dev"){
                logInfo("code is", code);
                return;
            }
			var client = require('twilio')(
                process.env.TWILIO_ACCOUNT_SID || 'ACed1f17d6a82f9a922f8a10de877b79e5',
                process.env.TWILIO_AUTH_TOKEN || '4ba18cd3ca91916e74d3dac67509bcf0'
            );
			client.sendSms({
				to:phoneNumber,
				from: '+972526282482',
				body: 'Your code is: ' + code + "."
			}, function(err, responseData) {
				if (err) {
					response.error(err);
					logError("saveUserAndSendSMS error: " + err.message);
				} else {
					response.success(true);
					logOk("[saveUserAndSendSMS] sms sent");
				}
			});
		},
		error:function(user, error) {
			response.error(error);
			logError("saveUserAndSendSMS user error: " + error.message);
		}
	});
}

// update coins amount for users where bonus time past, update bonus time to next
function checkCoinsBonus(){
    logMethod("[checkCoinsBonus] start");
    
    var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
    query.lessThanOrEqualTo("nextBonusTime",getNowTime());
	query.find({
		success: function(users) {
            if (users == undefined || users == null){
                logWarning("[checkCoinsBonus] no users");
                return;
            }
            
            logInfo("[checkCoinsBonus] got " + users.length + " users");
            
            // iterate over resulting users, give bonus and update next bonus time
            for (var i = 0; i < users.length; i++) {
                var user = users[i];
                // get total/available coins and update
                var newTotalCoins = (user.get("totalCoins") || 0) + coinsConstants.periodicBonusAmount;
                var newAvailableCoins = (user.get("availableCoins") || 0) + coinsConstants.periodicBonusAmount;
                user.set("totalCoins", newTotalCoins);
                user.set("availableCoins", newAvailableCoins);
                // update next bonus time
                user.set("nextBonusTime", getNextPeriodicBonusTime());
                // save
                user.save();
                
                // announce
                sendAnnouncementToUser(user.get("layerIdentityToken"),
                                       "You've just received " + coinsConstants.periodicBonusAmount + "more chips! ... Lets bet!",
                                       {
                                            msgType: "coinsBonus",
                                            bonusAmount: coinsConstants.periodicBonusAmount,
                                            totalCoins: newTotalCoins,
                                            availableCoins: newAvailableCoins
                                        },
                                       "bonus-announcement-"+user.get("layerIdentityToken"));
            }
            logMethod("[checkCoinsBonus] done");
		},
		error: function(error) {
            logError("[checkCoinsBonus] query error", error);
		}
	});
}

function testCheckCoinsBonus(){
    var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
    query.containedIn("layerIdentityToken",["64751cf6-6ea4-7648-4dbc-ddeb125824a7", "817cb5c1-ad63-ae59-dc6a-064e1ffda41b"]);
	query.find({
		success: function(users) {
            // iterate over resulting users, give bonus and update next bonus time
            for (var i = 0; i < users.length; i++) {
                var user = users[i];
                // get total/available coins and update
                var currentTotalCoins = user.get("totalCoins") || 0;
                var currentAvailableCoins = user.get("availableCoins") || 0;
                user.set("totalCoins", currentTotalCoins+coinsConstants.periodicBonusAmount);
                user.set("availableCoins", currentAvailableCoins+coinsConstants.periodicBonusAmount);
                // update next bonus time
                user.set("nextBonusTime", getNextPeriodicBonusTime());
                // save
                user.save();
                
                // announce
                /*setTimeout(function(){
                    console.log('sendAnnouncementToUser');
                sendAnnouncementToUser(user.get("layerIdentityToken"),
                                       "You've just received " + coinsConstants.periodicBonusAmount + "more chips! ... Lets bet!",
                                       {msgType: "coinsBonus",bonusAmount: coinsConstants.periodicBonusAmount});
                }, 8000);*/
            }
            
		},
		error: function(error) {

		}
	});
}

testCheckCoinsBonus();

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

Parse.Cloud.define("authenticatePhoneNumberAndSendTokenV2", function(request, response) {
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
					response.success(user);
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
	query.select("name", "phoneNumber", "layerIdentityToken", "picture", "totalCoins", "availableCoins");
	query.find({
		success: function(users) {

			response.success(users);
		},
		error: function(error) {
			response.error(error);
		}
	});
});


// ------------------------- getStatsForUser ----------------------------

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

// ------------------------- getUserObjectsForUserLayerIds ----------------------------

//for given array of userLayerId, get objects (nickname & picture)
//every time app is opened
Parse.Cloud.define("getUserObjectsForUserLayerIds", function(request, response) {
    var userLayerIdsArray = request.params.userLayerIdsArray;
    
    logMethod("[getUserObjectsForUserLayerIds] started");

	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.containedIn("layerIdentityToken",userLayerIdsArray);
	query.select("name", "phoneNumber", "layerIdentityToken", "picture", "totalCoins", "availableCoins");
	query.find({
		success: function(users) {
			response.success(users);
		},
		error: function(error) {
			response.error(error);
		}
	});


});


/********************************************************************
 | Groups
********************************************************************/

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
				logError("[createGroup] errorGroupAlreadyExists");
				response.error("errorGroupAlreadyExists");
			} else {
				var newGroup = createGroup(LBGroupClass, groupLayerId, groupAdminLayerId, picture);

				newGroup.save(null,{
					success:function(newGroupSuccess) {
						logOk("[createGroup] group created");
						var LBUserClass = Parse.Object.extend("LBUser");
						var userQuery = new Parse.Query(LBUserClass);

						userQuery.equalTo("layerIdentityToken", groupAdminLayerId);
						userQuery.first({
							success: function(user) {
								sendAdminMsgToGroup(groupLayerId, "New Group by " + user.get("name") + "... Lets Play!", {});
								response.success(true);
							},
							error:function(bet, error) {
								var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
								logError("[createGroup]", str); // Logs output to dev tools console.
								response.error(error);
							}
						});
					},
					error:function(newGroupError, error) {
						logError("[createGroup] error creating new group in db: " + error);
						var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
						logError("[createGroup]", str); // Logs output to dev tools console.
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

// creates group given class, group layer id, admin layer id, picture
function createGroup(LBGroupClass, groupLayerId, groupAdminLayerId, picture){
    var group = new LBGroupClass();
    var stats = {};
    stats[groupAdminLayerId] = {"bullseye":0,"almost":0,"lost":0,"points":0};
    group.set("statistics",stats);
    group.set("layerGroupId",groupLayerId);
    group.set("groupAdminLayerId",groupAdminLayerId);
    group.set("lastBetId","");
    group.set("lastBetType","");
    group.set("picture",picture);
    return group;
}

// -------------------------deleteAllGroupsFromDB----------------------------

Parse.Cloud.define("UNIMPLEMENTED_deleteAllGroupsFromDB", function(request, response) {
	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",layerGroupId);

	//TODO: implement...
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

// ------------------------- getLastBetForGroup ----------------------------

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

// ------------------------- getStatisticsForGroup ----------------------------

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


// ------------------------- getGroupPicturesForGroupLayerIds ----------------------------

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

// ------------------------- updateGroupPictureForGroupLayerId ----------------------------

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
						// sendAdminMsgToGroup(groupLayerId, "Group info changed", {});
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

// ------------------------- sendAdminMessageToGroup ----------------------------

Parse.Cloud.define("sendAdminMessageToGroup", function(request, response) {
	var groupLayerId = request.params.groupLayerId;
	var senderLayerId = request.params.senderLayerId;
	var message = request.params.message;

	logInfo("[sendAdminMessageToGroup]", senderLayerId + " asked to send '" + message + "' to group " + groupLayerId);
	sendAdminMsgToGroup(groupLayerId, message, {});
});

/********************************************************************
 | Game Bets
********************************************************************/

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

							logOk("[createFootballGameBet] Got relevant data about match from DB");

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
													"userLayerId" : betAdminLayerId,
													"teamHomeName" : teamHostName,
													"teamAwayName" : teamGuestName,
													"teamHomeId" : teamHostId,
													"teamAwayId" : teamGuestId,
													"date" : match.get("date")
												}

												sendAdminMsgToGroup(groupLayerId, "New Bet by " + user.get("name") +  "... Lets Bet!", data);
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

Parse.Cloud.define("createFootballGameBetV2", function(request, response) {
    logMethod('[createFootballGameBetV2] started');
	var betAdminLayerId = request.params.betAdminLayerId;
	var stakeType = request.params.stakeType;
	var stakeDesc = request.params.stakeDesc;
    
    
    
    // [query class]
    var LBUserClass = Parse.Object.extend("LBUser");
    var userQuery = new Parse.Query(LBUserClass);
    // [query conditions]
    userQuery.equalTo("layerIdentityToken", betAdminLayerId);
    // [query run]
    userQuery.first({
        success: function(user) {
            // if stake type is "Money" use coins logic 
            if (stakeType == "Money"){
                var stakeDescInt = parseInt(stakeDesc);
                
                // check sufficient coins
                var currentAvailableCoins = user.get("availableCoins");
                if (stakeDescInt > currentAvailableCoins){
                    response.error("insufficientAvailableCoins");
                    return;
                }
                
                createFootballGameBet(user, request, response, function(){                    
                    user.set("availableCoins", currentAvailableCoins - stakeDescInt);
                    user.save();
                });
                          
                return;
            }
            // otherwise create bet regularly
            else {
                createFootballGameBet(user, request, response);
                return;
            }

        },
        error:function(user, error) {
            response.error("findBetAdminUser: " + error);
        }
    });
    
    
	
});

function createFootballGameBet(adminLBUser, request, response, onSuccess){

    // extract params
    var groupLayerId = request.params.layerGroupId;
	var gameId = request.params.gameId;
	var betAdminLayerId = request.params.betAdminLayerId;
	var hostAdminGoalsBet = parseInt(request.params.hostAdminGoalsBet);
	var guestAdminGoalsBet = parseInt(request.params.guestAdminGoalsBet);
	var stakeType = request.params.stakeType;
	var stakeDesc = request.params.stakeDesc;
    
    // check if bet in this group for this match already exists
    // [query class]
    var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
    // [query conditions]
	query.equalTo("layerGroupId",groupLayerId);
	query.equalTo("gameId",gameId);
    // [query run]
	query.first({
		success: function(query_bet) {
 
			// return error if already exists
			if (query_bet != undefined && query_bet != null) {
                logError("[createFootballGameBet] BetAlreadyExists", query_bet);
				response.error("errorBetAlreadyExists");
                return;
			}
            
            // get all the relevant data about the match from DB
            // [query class]
            var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
            var footballQuery = new Parse.Query(LBFootballMatchClass);
            // [query conditions]
            footballQuery.equalTo("matchId",gameId);
            // [query run]
            footballQuery.first({
                success: function(match) {
            
                    // validate match
                    if ((match == undefined) || (match == null)){
                        response.error("match wasn't found in DB: " + error);
                        return;
                    }

                    // extract match params
                    var teamHostName = match.get("homeTeam");
                    var teamGuestName = match.get("awayTeam");
                    var teamHostId = match.get("homeTeamId");
                    var teamGuestId = match.get("awayTeamId");
                    var date = match.get("date");
                    var location = match.get("location");

                    logInfo("[createFootballGameBet] Got relevant data about match " + gameId + " from DB");

                    // create the new bet
                    // [class]
                    var bet = new LBFootballGameBetClass();
                    // [params]
                    // - general
                    bet.set("layerGroupId",groupLayerId);
                    bet.set("gameId",gameId);
                    bet.set("betAdminLayerId",betAdminLayerId);
                    // - stakes
                    bet.set("stakeType",stakeType);
                    bet.set("stakeDesc",stakeDesc);
                    // - match data
                    bet.set("teamHostName",teamHostName);
                    bet.set("teamHostId",teamHostId);
                    bet.set("teamGuestName",teamGuestName);
                    bet.set("teamGuestId",teamGuestId);
                    bet.set("date",date);
                    bet.set("location",location);
                    // - guesses with admin's guess
                    var usersGuesses = {};
                    usersGuesses[betAdminLayerId] = {"homeGoals": hostAdminGoalsBet, "awayGoals": guestAdminGoalsBet};
                    bet.set("usersGuesses",usersGuesses);

                    // [save]
                    bet.save(null,{
                        success:function(savedBet) {
  
                            // send message to group that the given admin has opened a new bet
                            var data = {
                                "msgType" : "FootballBet",
                                "betId" : savedBet.id,
                                "gameId" : gameId,
                                "betAdminLayerId" : betAdminLayerId,
                                "userLayerId" : betAdminLayerId,
                                "teamHomeName" : teamHostName,
                                "teamAwayName" : teamGuestName,
                                "teamHomeId" : teamHostId,
                                "teamAwayId" : teamGuestId,
                                "date" : date,
                                "location" : location,
                                "stakeType": stakeType,
                                "stakeDesc": stakeDesc,
                                "teamAwayGoals" : guestAdminGoalsBet,
                                "teamHomeGoals" : hostAdminGoalsBet
                            }

                            sendAdminMsgToGroup(groupLayerId, "New Bet by " + adminLBUser.get("name") +  "... Lets Bet!", data);
                            
                            // call on success callback if exists
                            if (onSuccess){
                                onSuccess();
                            }
                            
                            // respond successfully with amount of user's available coins
                            response.success(adminLBUser.get("availableCoins"));
                        },
                        error:function(bet, error) {
                            response.error("saveBetError: " + error);
                        }
                    }); // [save bet query]
                    
                },
                error: function(error) {
                    response.error("getMatchError: " + error);
                }
            }); // [get match query]
			
		},
		error: function(error) {
			response.error("checkPreExistingBetError: " + error);
		}
	}); // [check pre-existing bet query]
}


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
					logInfo("[addGuessToFootballGameBet] got bet : " + bet);
							var LBUserClass = Parse.Object.extend("LBUser");
							var userQuery = new Parse.Query(LBUserClass);

							userQuery.equalTo("layerIdentityToken", userLayerId);
							userQuery.first({
								success: function(user) {
									if ((user == undefined) || (user == null)){
										response.error("couldn't find userId to add his guess");
									}else{
										var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
										var query_match = new Parse.Query(LBFootballMatchClass);
										query_match.equalTo("matchId",gameApiId);
										query_match.first({
											success: function(success_match) {
												var data = {
													"msgType" : "FootballBet",
													"betId" : bet.id,
													"gameId" : gameApiId,
													"userLayerId" : userLayerId,
													"betAdminLayerId" : userLayerId, // not true/needed
													"teamHomeName" : bet.get("teamHostName"),
													"teamAwayName" : bet.get("teamGuestName"),
													"teamHomeId" : bet.get("teamHostId"),
													"teamAwayId" : bet.get("teamGuestId"),
													"date" : success_match.get("date")
												}
												logInfo("[addGuessToFootballGameBet] data:", data);
												var message = "" + user.get("name") + ": ";
												if (goalsTeamHost == goalsTeamGuest) {
													if (goalsTeamHost == 0) {
														message += "Boring draw";
													} else {
														message += "draw " + goalsTeamHost + ":" + goalsTeamGuest;
													}
												} else {
													if (goalsTeamHost > goalsTeamGuest) {
														message += "" + bet.get("teamHostName");
													} else {
														message += "" + bet.get("teamGuestName");
													}
													message +=  " will win " + goalsTeamHost + ":" + goalsTeamGuest;
												}
												logInfo("[addGuessToFootballGameBet] about to send: " + message);
												sendAdminMsgToGroup(groupLayerId, message, data);
												response.success(true);
											},
											error: function(error_match) {
												logError("Error querying match " + matchId + ": "+ error_match);
												response.error(error_match);
											}
										});
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

Parse.Cloud.define("addGuessToFootballGameBetV2", function(request, response) {
	var gameApiId = request.params.gameApiId;
	var groupLayerId = request.params.groupLayerId;
	var userLayerId = request.params.userLayerId;

    // get bet by group and game id
    // [query class]
	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
    // [query conditions]
	query.equalTo("layerGroupId",groupLayerId);
	query.equalTo("gameId",gameApiId);
    // [query run]
	query.first({
		success: function(bet) {
            // validate bet
            if (bet == undefined || bet == null) {
                response.error("BetDoesntExist");
                return;
            }

            // make sure guess doesn't exist yet
            if (bet.get("usersGuesses")[userLayerId] != undefined){
                response.error("GuessAlreadyExists");
                return;
            }
            
            // get guessing user
            // [query class]
            var LBUserClass = Parse.Object.extend("LBUser");
            var userQuery = new Parse.Query(LBUserClass);
            // [query conditions]
            userQuery.equalTo("layerIdentityToken", userLayerId);
            // [query run]
            userQuery.first({
                success: function(user) {
                    // validate user
                    if ((user == undefined) || (user == null)){
                        response.error("GuessingUserNotFound");
                        return;
                    }
                    
                    // if stake type is "Money" use coins logic 
                    if (bet.get("stakeType") == "Money"){
                        // check sufficient coins
                        var currentAvailableCoins = user.get("availableCoins");
                        var stakeDesc = bet.get("stakeDesc");
                        if (stakeDesc > currentAvailableCoins){
                            response.error("insufficientAvailableCoins");
                            return;
                        }

                        addGuessToFootballGameBet(user, bet, request, response, function(){
                            user.set("availableCoins", currentAvailableCoins - stakeDesc);
                            user.save();
                        });

                    }
                    // otherwise add guess regularly
                    else {
                        addGuessToFootballGameBet(user, bet, request, response);
                    }
                    
                },
                error: function(error) {
                    response.error("findGuessingUserError: " + error);
                }
            });			
		},
		error: function(error) {
			response.error("findBetError: " + error);
		}
	});
});

function addGuessToFootballGameBet(user, bet, request, response, onSuccess){
    var gameApiId = request.params.gameApiId;
    var groupLayerId = request.params.groupLayerId;
    var userLayerId = request.params.userLayerId;
    var goalsTeamHost = parseInt(request.params.goalsTeamHost);
    var goalsTeamGuest = parseInt(request.params.goalsTeamGuest);
    
    // add guess to bet
    var usersGuesses = bet.get("usersGuesses");
    usersGuesses[userLayerId] = {"homeGoals": goalsTeamHost, "awayGoals": goalsTeamGuest};

    // save bet
    bet.save(null,{
        success:function(bet) {
            
            // call on success callback if exists
            if (onSuccess){
                onSuccess();
            }
            
            logInfo("[addGuessToFootballGameBet] guess added to bet:" + bet);

            // formulate and send notification to group

            // get match
            // [query class]
            var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
            var query_match = new Parse.Query(LBFootballMatchClass);
            // [query conditions]
            query_match.equalTo("matchId",gameApiId);
            // [query run]
            query_match.first({
                success: function(success_match) {
                    // prepare notification payload data
                    var data = {
                        "msgType" : "FootballBet",
                        "betId" : bet.id,
                        "gameId" : gameApiId,
                        "userLayerId" : userLayerId,
                        "betAdminLayerId" : bet.get("betAdminLayerId"),
                        "teamHomeName" : bet.get("teamHostName"),
                        "teamAwayName" : bet.get("teamGuestName"),
                        "teamHomeId" : bet.get("teamHostId"),
                        "teamAwayId" : bet.get("teamGuestId"),
                        "date" : success_match.get("date"),
                        "stakeType" : bet.get("stakeType"),
                        "stakeDesc" : bet.get("stakeDesc"),
                        "teamAwayGoals" : goalsTeamGuest,
                        "teamHomeGoals" : goalsTeamHost
                    }

                    logInfo("[addGuessToFootballGameBet] adding bet guess with data:" + data);

                    // prepare notification message
                    // - guesser name
                    var message = "" + user.get("name") + ": ";
                    // - bet in words
                    if (goalsTeamHost == goalsTeamGuest) {
                        if (goalsTeamHost == 0) {
                            message += "Boring draw";
                        } else {
                            message += "draw " + goalsTeamHost + ":" + goalsTeamGuest;
                        }
                    } else {
                        if (goalsTeamHost > goalsTeamGuest) {
                            message += "" + bet.get("teamHostName");
                        } else {
                            message += "" + bet.get("teamGuestName");
                        }
                        message +=  " will win " + goalsTeamHost + ":" + goalsTeamGuest;
                    }

                    logInfo("[addGuessToFootballGameBet] adding bet guess with notification message: " + message);

                    // send notification
                    sendAdminMsgToGroup(groupLayerId, message, data);

                    // return with amount of user's available coins
                    response.success(user.get("availableCoins"));
                },
                error: function(error) {
                    response.error("getBetMatchError: " + error);
                }
            });
        },
        error:function(bet, error) {
            response.error("saveBetError: " + error);
        }
    });
}

/********************************************************************
 | Custom Bets
********************************************************************/

// ------------------------- openNewCustomBet ----------------------------

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

					var message = "New Bet by " + user.get("name") +  "... Lets Bet!";
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

// ------------------------- addGuessToCustomBet ----------------------------

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

// ------------------------- getAllCustomBetsForGroup ----------------------------

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

// ------------------------- closeCustomBet ----------------------------

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


/********************************************************************
 | Games
********************************************************************/

//www.xmlsoccer.com/FootballData.asmx/GetFixturesByDateInterval?ApiKey=OOYXGGEGYDPFYZQTSKQPWSSUENFSIWLCDVFBEQXDWKLCZUWKFU&startDateString=2016-04-01&endDateString=2016-04-30


// ------------------------- getGamesPerDatesRange ----------------------------
Parse.Cloud.define("getGamesPerDatesRange", function(iko, piko) {

});

// ------------------------- updateComingGames ----------------------------
Parse.Cloud.define("updateComingGames", function(request, response) {
	logMethod("[updatComingGames] started");
	updateComingGames();
});

//Called daily
function updateComingGames() {
    logMethod("[updateComingGames] starting");
	//If we wanna use the xml example, just use this:

	//if (shouldUseXmlExamples){
	if (false){

        logMethod("[updateComingGames] using example xml");

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

        logInfo("[updateComingGames] requesting data from", fullUrl);

		request({
			uri: fullUrl,
			method: "GET",
			json: true,
			}, function(error, response, body) {
            	logOk("[updateComingGames] received response");
				updateComingGamesInDB(body);
		});
	}
}

// - helper for updateComingGames
//
function updateComingGamesInDB(futureMatchesXML){
	logMethod("[updateComingGamesInDB] starting");

	var parser = new xml2js.Parser({explicitRoot: false, normalizeTags: true}); //Without "XMLSOCCER.COM", with lowercase
		parser.parseString(futureMatchesXML, function (err, result) {
            // validate result
            if (err || result == undefined || result == null || result.match == undefined || result.match == null){
                logError('[updateComingGamesInDB] parseString error:', err, result);
                return;
            }
			
            logInfo("[updateComingGamesInDB] got " + result.match.length + " results");
            
            for(var i = 0; i < result.match.length; i++) {
                if (result.match[i] == undefined){
                    //In case we get the too-many-cooks problem
                    continue;
                }
                
                var currentMatch = result.match[i];
                
                var leagueName = currentMatch.league[0];
                if (leagueName in leaguesDic){
                    var leagueId = leaguesDic[leagueName];
                    var matchId = currentMatch.id[0];
                    logInfo("[updateComingGamesInDB] getting data for gameID "+ matchId + " from league "+leagueId);
                    var date = currentMatch.date[0];
                    var homeTeam = currentMatch.hometeam[0];
                    var homeTeamId = currentMatch.hometeam_id[0];
                    var awayTeam = currentMatch.awayteam[0];
                    var awayTeamId = currentMatch.awayteam_id[0];
                    var loc = currentMatch.location[0];

                    var match_data_str = JSON.stringify(currentMatch, null, 4);
                    //log("parsed match: "+ match_data_str);
                    addLBFootballMatchToDB(matchId, date, leagueId, homeTeam, homeTeamId, awayTeam, awayTeamId, loc);
                }
                
            }
			
            logOk("[updateComingGamesInDB] done");
		});
	
}

// - helper for updateComingGamesInDB
//
function addLBFootballMatchToDB(matchId, date, leagueId, homeTeam, homeTeamId, awayTeam, awayTeamId, loc){
	var LBFootballMatchClass = Parse.Object.extend("LBFootballMatch");
	var query = new Parse.Query(LBFootballMatchClass);
	query.equalTo("matchId",matchId);
	query.first({
		success: function(match) {
			//If match doesn't exist in Parse:
			if ((match == undefined ) || (match == null)) {
				logInfo("[addLBFootballMatchToDB] Creating matchId "+ matchId + " in DB");
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
			logInfo("[addLBFootballMatchToDB] Updating data of match "+ matchId);
			match.set("date", date);
			match.set("leagueId",leagueId);
			match.set("homeTeam",homeTeam);
			match.set("homeTeamId",homeTeamId);
			match.set("awayTeam",awayTeam);
			match.set("awayTeamId",awayTeamId);
			match.set("location",loc);

			var match_str = JSON.stringify(match, null, 4);
			logInfo("[addLBFootballMatchToDB] about to save match: "+ match_str);

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


// ------------------------- updateLiveScores ----------------------------
Parse.Cloud.define("updateLiveScores", function(request, response) {
	updateLiveScores();
});


//Called every 30 seconds
//updates live scores from xmlsoccer, and then forwards to analyse results
function updateLiveScores() {
    logMethod("[updateLiveScores] started ");

	//If we wanna use the xml example, just use this:
	if (shouldUseXmlExamples){
        logInfo("[updateLiveScores] using example xml");

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

        logInfo("[updateLiveScores] requesting data from", fullUrl);

		request({
			uri: fullUrl,
			method: "GET",
			json: true,
			}, function(error, response, body) {
            	logOk("[updateLiveScores] got response");
				updateLiveScoresInDBAndNotify(body);
		});
	}
}

// - helper for updateLiveScores
//Gets liveScoreXml and calls a function that updates db and notifies relevant groups
function updateLiveScoresInDBAndNotify(liveScoresXml){
	logMethod("[updateLiveScoresInDBAndNotify] started ");

	var parser = new xml2js.Parser({explicitRoot: false, normalizeTags: true}); //Without "XMLSOCCER.COM", with lowercase
	parser.parseString(liveScoresXml, function (err, result) {
		if ((result != undefined) && (result != null) && (result.match != undefined) && (result.match != null)) {
            logInfo("[updateLiveScoresInDBAndNotify] xml parsing complete with " + result.match.length + " results");
			for(var i = 0; i < result.match.length; i++) {
				if (result.match[i] != undefined){ //In case we get the too-many-cooks problem
					var leagueName = result.match[i].league[0];
					if (leagueName in leaguesDic){
						var matchId = result.match[i].id[0];

                        logInfo("[updateLiveScoresInDBAndNotify] updating match id", matchId);

						//TODO: change according to XML!!
						var gameStatus = result.match[i].time[0];
						var homeGoals = parseInt(result.match[i].homegoals[0]);
						var awayGoals = parseInt(result.match[i].awaygoals[0]);
						logInfo("[updateLiveScoresInDBAndNotify] score of game "+ matchId + ": "+homeGoals+"-"+awayGoals);

						updateLiveGameIfNeeded(matchId, gameStatus, homeGoals, awayGoals);
					}
				} else {
                    logWarning("[updateLiveScoresInDBAndNotify] undefined match for index", i);
                    console.dir(result);
				}
			}
            logOk("[updateLiveScoresInDBAndNotify] done");
		} else {
            logError("[updateLiveScoresInDBAndNotify] error:", err, "result:", result);
		}
	});
	//console.log("finished updateLiveScoresInDB()");
}


// - helper for updateLiveScoresInDBAndNotify
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
				logInfo("[updateLiveGameIfNeeded] Match exists in DB");
				var dbStatus = match.get("time");
				var dbHomeGoals = match.get("homeGoals");
				var dbAwayGoals = match.get("awayGoals");

				if ((dbStatus != gameStatus) || (dbHomeGoals != homeGoals) || (dbAwayGoals != awayGoals)){
					logInfo("[updateLiveGameIfNeeded] Found different score or time in DB. Updaing DB accordingly");
					match.set("time", gameStatus);
					match.set("homeGoals", homeGoals);
					match.set("awayGoals", awayGoals);

					match.save(null,{
						success:function(match_success) {
							logOk("[updateLiveGameIfNeeded]  Succeeded updating match " + match_success.get("matchId"));
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
							logError("[updateLiveGameIfNeeded]  Error updating match in DB: "+error);
						}
					});
				}
			} else {
				logWarning("[updateLiveGameIfNeeded]  Didn't find match " + matchId + " in DB.");
			}
		},
		error: function(error) {
			logError("[updateLiveGameIfNeeded]  Error querying DB for match " + matchId + ": "+error);
		}
	});
}

// - helper for updateLiveGameIfNeeded
//Find groups that opened a bet regarding given gameId, and notify them with the relevant change
function sendMessageToRelevantGroupsThatScoreChanged(match){
	var matchId = match.get("matchId");
	logMethod("[sendMessageToRelevantGroupsThatScoreChanged] started for match " + matchId);
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
					logInfo("About to notify group "+ groupLayerId+" that the score changed");
					var message = "GOAL! "+homeTeamName+" vs "+awayTeamName+" - "+homeTeamGoals+":"+awayTeamGoals+".";
					logInfo("specifically: " + message);
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

// - helper for updateLiveGameIfNeeded
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
					updateEndedMatchV2(match, bets);
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

// - helper for performRelevantActionsInRelevantGroupsBecauseStatusChanged
//send notifications to relevant groups, delete match from db, update statistics in relevant groups
function updateEndedMatch(match, bets){
	var matchId = match.get("matchId");
	logMethod("[updateEndedMatch] started for match " + matchId + ". Updating relevant groups...");
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
					logInfo("[updateEndedMatch] Updating group " + groupLayerId);
					var currentStatistics = group.get("statistics");
					var groupUsersGuesses = bet.get("usersGuesses");

					var str = JSON.stringify(groupUsersGuesses, null, 4); // (Optional) beautiful indented output.
					logInfo("[updateEndedMatch] The group's guesses are: "+ str); // Logs output to dev tools console.

					//update statistics
					var winnersArray = [];
					for (var userId in groupUsersGuesses) {
						if (!groupUsersGuesses.hasOwnProperty(userId))
							continue;

						var userGuess = groupUsersGuesses[userId];
						if ((currentStatistics[userId] == undefined) || (currentStatistics[userId] == null)){
							logWarning("[updateEndedMatch] Stats of user " + userId + " are undefined. Initializing them");
							currentStatistics[userId] = {"bullseye":0, "almost":0, "lost":0, "points":0};
						}
						var userStatistics = currentStatistics[userId];
						logInfo("[updateEndedMatch] userStatistics of " + userId + ": "+JSON.stringify(userStatistics, null, 4));

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

					logInfo("[updateEndedMatch] Group's winners of this match are: "+JSON.stringify(winnersArray, null, 4));
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
									logOk("[updateEndedMatch] saved statistics for group " + groupLayerId);
									var message = homeTeamName + " vs " + awayTeamName + " - " + homeTeamGoals + ":" + awayTeamGoals +
										" - Final Score - ";
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

									if (winnersArray.length == 0){
										message = message + "no winners here... try again!";
										logInfo("[updateEndedMatch] gonna send them this message: " + message);
										sendAdminMsgToGroup(groupLayerId, message, data);
									} else {
											var LBUserClass = Parse.Object.extend("LBUser");
											var userQuery = new Parse.Query(LBUserClass);

											userQuery.containsAll("layerIdentityToken", winnersArray);
											userQuery.first({
												success: function(users) {
													message = message + (winnersArray.length == 1 ? "the winner is " : "the winners are ");
													message = message + users.map(function(u){ return u.get("name");}).join(",");
													logInfo("[updateEndedMatch] gonna send them this message: " + message);
													sendAdminMsgToGroup(groupLayerId, message, data);
													response.success(true);
												},
												error:function(bet, error) {
													var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
													logError("[updateEndedMatch]", str); // Logs output to dev tools console.
													response.error(error);
												}
											});
									}
								},
								error:function(group, error) {
									logError("[updateEndedMatch] error saving guesses: "+error);
								}
							});
						},
						error:function(group, error) {
							logError("[updateEndedMatch] failed saving winnersArray in football bet: "+error);
						}
					});

				} else {
					logError("[updateEndedMatch] error: group doesn't exist");
				}
			},
			error: function(error) {
				response.error(error);
			}
		});
	}

	match.destroy({});
}



function updateEndedMatchV2(match, bets){
	var matchId = match.get("matchId");
	var homeTeamName = match.get("homeTeam");
	var awayTeamName = match.get("awayTeam");
	var homeTeamId = match.get("homeTeamId");
	var awayTeamId = match.get("awayTeamId");
	var homeTeamGoals = parseInt(match.get("homeGoals"));
	var awayTeamGoals = parseInt(match.get("awayGoals"));
    
    logMethod("[updateEndedMatchV2] started for match " + matchId + ". Updating relevant groups...");

    // update each bet opened for this match
    function updateBet(bet){
        var groupLayerId = bet.get("layerGroupId");
        logInfo("[updateEndedMatchV2] Updating bet for layerGroupId" + groupLayerId);

		var betStakeDesc = bet.get("stakeDesc");
		var betStakeType = bet.get("stakeType");
        
        // update group on match end
        function updateGroup(group) {
            // validate group
            if (group == undefined || group == null) {
                logError("[updateEndedMatchV2] group doesn't exist");
                return;
            }

            logInfo("[updateEndedMatchV2] Updating group " + groupLayerId);
            var currentStatistics = group.get("statistics");
            var groupUsersGuesses = bet.get("usersGuesses");

            var str = JSON.stringify(groupUsersGuesses, null, 4); // (Optional) beautiful indented output.
            logInfo("[updateEndedMatchV2] The group's guesses are: "+ str); // Logs output to dev tools console.

            
            var winnersArray = [];
            
            var userResults = {
                bullseye:[],
                almost:[],
                lost:[],
                deltaMap:{}
            };
            
            
            // flag if bet is of "money" type
            var isMoneyBet = betStakeType == "Money";
            
            
            // updates statistics of user in group and assigns guess result to userResults
            function updateGroupStatsAndCollectGuessResults(userId){
                // get user's guess
                var userGuess = groupUsersGuesses[userId];
                // ensure user's group statistics object exists, initialize otherwise
                if ((currentStatistics[userId] == undefined) || (currentStatistics[userId] == null)){
                    logWarning("[updateEndedMatchV2] Stats of user " + userId + " are undefined. Initializing them");
                    currentStatistics[userId] = {"bullseye":0, "almost":0, "lost":0, "points":0};
                }
                // get user's group statistics
                var userStatistics = currentStatistics[userId];
                logInfo("[updateEndedMatchV2] userStatistics of " + userId + ": "+JSON.stringify(userStatistics, null, 4));

                // get user's guess
                var homeGuess = userGuess["homeGoals"];
                var awayGuess = userGuess["awayGoals"];
                
                
                //bullseye:
                if ((homeGuess == homeTeamGoals) && (awayGuess == awayTeamGoals)){
                    
                    userStatistics["bullseye"] = userStatistics["bullseye"]+1;
                    userStatistics["points"] = userStatistics["points"]+2;
                    
                    winnersArray.push(userId);
                    userResults.bullseye.push(userId);
                    
                    if (!isMoneyBet)
                        updateWinStatForUser(userId); // will update both betsWon and betsParticipated
                }
                //almost:
                else if ( ((homeTeamGoals > awayTeamGoals) && (homeGuess > awayGuess)) || // guessed winner is home team
                          ((homeTeamGoals == awayTeamGoals) && (homeGuess == awayGuess)) || // guessed tie
                          ((homeTeamGoals < awayTeamGoals) && (homeGuess < awayGuess)) ){ // guessed winner is away team
                    //console.log("almost");
                    userStatistics["almost"] = userStatistics["almost"]+1;
                    userStatistics["points"] = userStatistics["points"]+1;
                    
                    winnersArray.push(userId);
                    userResults.almost.push(userId);
                    
                    if (!isMoneyBet)
                        updateBetsParticipatedStatForUser(userId); // will update betsParticipated
                }
                //lost bet:
                else{
                    //console.log("lost ");
                    userStatistics["lost"] = userStatistics["lost"]+1;
                    
                    userResults.lost.push(userId);
                    
                    if (!isMoneyBet)
                        updateBetsParticipatedStatForUser(userId); // will update betsParticipated
                    
                }
                currentStatistics[userId] = userStatistics;
            }

            var numofGuesses = 0;

            // iterate over guessing users, update statistics and populate userResults
            for (var userId in groupUsersGuesses) {
                updateGroupStatsAndCollectGuessResults(userId);
                ++numofGuesses;
            }
            
            // update statistics
            group.set("statistics",currentStatistics);
            
            // updates user models with new coins status and increases bets won/participated
            function updateCoins(){
                // calculate lot
                var lot = betStakeDesc * numofGuesses;
                logInfo("[updateEndedMatchV2] lot is", lot);
                
                // bullseye bonus
                var bullseyeBonusFactor = 0.1;
                var bullseyeBonus = betStakeDesc * bullseyeBonusFactor;

                logInfo("[updateEndedMatchV2] bullseyeBonus is", bullseyeBonus);
                
                /*var bullseyeBonusPerGuesser = 0;
                var prizeShare = 0;
                
                // prize calculation when bullseye guess exists
                if (userResults.bullseye.length > 0){
                    // set bullseye bonus percentage
                    var bullseyeBonusPercentage = 0.1;
                    // calculate bullseye bonus per bullseye guesser
                    bullseyeBonusPerGuesser = (lot * bullseyeBonusPercentage) / userResults.bullseye.length;
                    // calculate prize share per bullseye & almost guessers
                    prizeShare = (lot * (1-bullseyeBonusPercentage)) / (userResults.bullseye.length + userResults.almost.length);
                }
                // prize calculation when bullseye guess doesn't exist but almost guess exists
                else if (userResults.almost.length > 0){
                    prizeShare = lot / userResults.almost.length;
                }*/
                
                // sum of users to split lot with
                var numofCorrectGuesses = userResults.bullseye.length + userResults.almost.length;
                logInfo("[updateEndedMatchV2] numofCorrectGuesses is", numofCorrectGuesses);
                
                // in case at least one correct guess exists
                if (numofCorrectGuesses > 0){
                    var prizeShare = lot / numofCorrectGuesses; // prizeShare always >= betStakeDesc
                    
                    var bullseyeShare = prizeShare + bullseyeBonus;
                    var bullseyeDeltaTotal = bullseyeShare - betStakeDesc;
                    
                    for (var i in userResults.bullseye){
                        updateWinStatForUser(userResults.bullseye[i], bullseyeDeltaTotal, bullseyeShare);
                        userResults.deltaMap[userResults.bullseye[i]] = [bullseyeDeltaTotal, bullseyeShare];
                    }
                    
                    var almostDeltaTotal = prizeShare - betStakeDesc;
                    
                    for (var i in userResults.almost){
                        updateWinStatForUser(userResults.almost[i], almostDeltaTotal, prizeShare);
                        userResults.deltaMap[userResults.almost[i]] = [almostDeltaTotal, prizeShare];
                    }
                    
                    for (var i in userResults.lost){
                        updateBetsParticipatedStatForUser(userResults.lost[i], -betStakeDesc);
                        userResults.deltaMap[userResults.lost[i]] = [-betStakeDesc, 0];
                    }
                }
                // no correct guesses
                else {
                    for (var userId in groupUsersGuesses) {
                        updateBetsParticipatedStatForUser(userId, 0, betStakeDesc);
                        userResults.deltaMap[userId] = [0, betStakeDesc];
                    }
                }
            
            }
            
            // call update coins if money bet
            if (isMoneyBet){
                logInfo("[updateEndedMatchV2] Updating coins");
                updateCoins();
                logInfo("[updateEndedMatchV2] userResults: "+JSON.stringify(userResults, null, 4));
            }

            logInfo("[updateEndedMatchV2] Group's winners of this match are: "+JSON.stringify(winnersArray, null, 4));
            
            // update bet
            
            // - set winners array
            bet.set("winnersArray",winnersArray);
            // - save
            bet.save(null,{
                success:function(saved_bet) {
                    // group's last bet
                    
                    // - delete last group's bet
                    deleteLastBetOfGroup(groupLayerId);

                    // - update last bet in group
                    group.set("lastBetId",saved_bet.id);
                    group.set("lastBetType","Football");

                    // save group
                    group.save(null,{
                        //TODO: send right msg + data{}
                        success:function(group) {
                            
                            logOk("[updateEndedMatchV2] saved group " + groupLayerId);
                            
                            //var message = homeTeamName + " vs " + awayTeamName + " - " + homeTeamGoals + ":" + awayTeamGoals +
                            //    " - Final Score - ";
                            
                            // formulate push notification message
                            var message = homeTeamName + " vs " + awayTeamName + " - " + homeTeamGoals + ":" + awayTeamGoals + ", check out bet results!";
                            
                            // prepare push notification payload
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
                                "winnersArray" : winnersArray,
                                "coinsDeltaMap" : userResults.deltaMap
                            };

                            logInfo("[updateEndedMatchV2] gonna send them this message: " + message);
                            sendAdminMsgToGroup(groupLayerId, message, data);

                            /*if (winnersArray.length == 0){
                                message = message + "no winners here... try again!";
                                console.log("gonna send them this message: " + message);
                                sendAdminMsgToGroup(groupLayerId, message, data);
                            } else {
                                    var LBUserClass = Parse.Object.extend("LBUser");
                                    var userQuery = new Parse.Query(LBUserClass);

                                    userQuery.containsAll("layerIdentityToken", winnersArray);
                                    userQuery.first({
                                        success: function(users) {
                                            message = message + (winnersArray.length == 1 ? "the winner is " : "the winners are ");
                                            message = message + users.map(function(u){ return u.get("name");}).join(",");
                                            console.log("gonna send them this message: " + message);
                                            sendAdminMsgToGroup(groupLayerId, message, data);
                                            response.success(true);
                                        },
                                        error:function(bet, error) {
                                            var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
                                            console.log(str); // Logs output to dev tools console.
                                            response.error(error);
                                        }
                                    });
                            }*/
                        },
                        error:function(group, error) {
                            logError("[updateEndedMatchV2] error saving group: " + error);
                        }
                    });
                },
                error:function(bet, error) {
                    logError("[updateEndedMatchV2] error saving bet: " + error);
                }
            });

        }
        
        // get bet's group
        // [query class]
		var LBGroupClass = Parse.Object.extend("LBGroup");
		var query = new Parse.Query(LBGroupClass);
        // [query conditions]
		query.equalTo("layerGroupId",groupLayerId);
        // [query run]
		query.first({
			success: function(group) {
				updateGroup(group);
			},
			error: function(error) {
				response.error(error);
			}
		});
    }
    
    // iterate over bets, update each one
	for(var i = 0; i < bets.length; i++) {
		updateBet(bets[i]);	
	}

	match.destroy({});
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


// ------------------------- bet helpers ----------------------------

//delete group's last bet from DB, given a groupLayerId
function deleteLastBetOfGroup(groupLayerId){
	logMethod("[deleteLastBetOfGroup] of group "+groupLayerId);
	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",groupLayerId);

	query.first({
		success: function(group) {
			//group exists:
			if (group != undefined && group != null) {
				logInfo("[deleteLastBetOfGroup] in group "+groupLayerId);

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
							logOk("[deleteLastBetOfGroup] deleted "+betType+" bet "+betId+" from DB");
							betToDel.destroy({});
						}else{
							logError("[deleteLastBetOfGroup]", betType+" bet "+betId+" was not found in bets DB");
						}
					},
					error: function(error) {
						logError("[deleteLastBetOfGroup]", "error fetching bet: "+error);
					}
				});

			} else {
				logError("[deleteLastBetOfGroup] group doesn't exist");
			}
		},
		error: function(error) {
			logError("[deleteLastBetOfGroup]"+error);
		}
	});




}

//Will update betsParticipated in user stats
function updateBetsParticipatedStatForUser(userLayerId, deltaTotalCoins, deltaAvailableCoins){
	logMethod("[updateBetsParticipatedStatForUser] started");
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
                
                updateUserCoinsOnMatchEnd(user, deltaTotalCoins, deltaAvailableCoins);
                
				user.save(null,{
					success:function(user) {
						logOk("[updateBetsParticipatedStatForUser] succeeded saving betsParticipated");
					}, error:function(user, error) {
						logError("[updateBetsParticipatedStatForUser] failed saving betsParticipated");
					}
				});
			} else {
				logWarning("[updateBetsParticipatedStatForUser] Tried to update user stat but couldn't find user");
			}
		},
		error: function(error) {
			logError("[updateBetsParticipatedStatForUser] Tried to update user stat but failed performing query");
		}
	});
}

//Will update both betsWon AND betsParticipated in user stats
function updateWinStatForUser(userLayerId, deltaTotalCoins, deltaAvailableCoins){
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
                
                updateUserCoinsOnMatchEnd(user, deltaTotalCoins, deltaAvailableCoins);
                
				user.save(null,{
					success:function(user) {
						logOk("[updateWinStatForUser] succeeded saving betsParticipated and betsWon");
					}, error:function(user, error) {
						logError("[updateWinStatForUser] failed saving betsParticipated and betsWon");
					}
				});
			} else {
				logError("[updateWinStatForUser] Tried to update user stat but couldn't find user");
			}
		},
		error: function(error) {
			logError("[updateWinStatForUser] Tried to update user stat but failed performing query");
		}
	});
}

// updates user coins status according to params
function updateUserCoinsOnMatchEnd(user, deltaTotalCoins, deltaAvailableCoins){
    if (deltaTotalCoins){
        var totalCoins = user.get("totalCoins");
        user.set("totalCoins", totalCoins + deltaTotalCoins);
        logInfo("[updateUserCoinsOnMatchEnd] updating totalCoins to ", totalCoins + deltaTotalCoins);
    }

    if (deltaAvailableCoins){
        var availableCoins = user.get("availableCoins");
        user.set("availableCoins", availableCoins + deltaAvailableCoins);
        logInfo("[updateUserCoinsOnMatchEnd] updating availableCoins to ", availableCoins + deltaAvailableCoins);
    }
}


/********************************************************************
 | Other
********************************************************************/


// ------------------------- AdminMsg ----------------------------

Parse.Cloud.define("AdminMsg", function(request, response) {
	sendAdminMsgToGroup("8dc83080-ae62-4602-b8d2-e400356096db","Fred! Ma Nish!");
});

// -------------------------testPush----------------------------

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

// ------------------------- Logging ----------------------------

var logColors = {"Black":"\x1b[30m", "Red":"\x1b[31m", "Green":"\x1b[32m", "Yellow":"\x1b[33m", "Blue":"\x1b[34m", "Magenta":"\x1b[35m", "Cyan":"\x1b[36m", "White":"\x1b[37m"}

var muteLog = false;

/**
 * Does console.log and formats the data a nice way
 * @param {any[]} ...args
 */
function _log() {
    var args = Array.prototype.slice.call(arguments);
    var color = args.shift();
    args = args[0];
    var logToWrite = args.map(function (arg) {
        var str;
        var argType = typeof arg;

        if (arg === null) {
            str = 'null';
        } else if (arg === undefined) {
            str = '';
        } else if (!arg.toString || arg.toString() === '[object Object]') {
            str = '\n' + JSON.stringify(arg, null, '  ') + '\n';
        } else if (argType === 'string') {
            str = arg;
        } else {
            str = arg.toString();
        }

        return str;
    }).join(' ');
    console.log(color, logToWrite);
}

function logOk() {
	if (!muteLog) _log(logColors["Green"], Array.prototype.slice.call(arguments));
}
function logWarning() {
	if (!muteLog) _log(logColors["Yellow"], Array.prototype.slice.call(arguments));
}
function logError() {
	if (!muteLog) _log(logColors["Red"], Array.prototype.slice.call(arguments));
}
function log() {
	if (!muteLog) _log(logColors["White"], Array.prototype.slice.call(arguments));
}
function logInfo(){
    if (!muteLog) _log(logColors["Blue"], Array.prototype.slice.call(arguments));
}
function logMethod(){
    if (!muteLog) _log(logColors["Blue"], Array.prototype.slice.call(arguments));
}