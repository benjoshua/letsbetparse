
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
				user.set("loginCode",code);
				saveUserAndSendSMS(user, phoneNumber, code, response);
			} else {
			//New user
			var user = new LBUserClass();
			user.set("phoneNumber",phoneNumber);
			user.set("loginCode",code);
			user.set("name","");
			user.set("layerIdentityToken",generateUuid());
			saveUserAndSendSMS(user, phoneNumber, code, response);
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
			var client = require('twilio')('ACed1f17d6a82f9a922f8a10de877b79e5', '4ba18cd3ca91916e74d3dac67509bcf0');
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
			});
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



// -------------------------authenticatePhoneNumberAndSendToken----------------------------

//Given an array of Layer Conversation IDs, and returns statuses (name, display, etc.) per each conversations,
//in the same order it was received
Parse.Cloud.define("createGroup", function(request, response) {
	var layerGroupId = request.params.layerGroupId;
	var layerUsersIds = request.params.layerUsersIds;

	var LBGroupClass = Parse.Object.extend("LBGroup");
	var query = new Parse.Query(LBGroupClass);
	query.equalTo("layerGroupId",layerGroupId);

	query.first({
		success: function(group) {
			//group already exists:
			if (group != undefined && group != null) {
				response.error("errorGroupAlreadyExists");
			} else {
				//New Group
				var group = new LBGroupClass();
				group.set("layerGroupId",layerGroupId);
				group.set("layerUsersIds",layerUsersIds);
				group.save(null,{
					success:function(group) { 
						//TODO: send layer admin msg and push
						response.success(true);
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

// -------------------------createFootballGameBet----------------------------

Parse.Cloud.define("createFootballGameBet", function(request, response) {
	var layerGroupId = request.params.layerGroupId;
	var gameId = request.params.gameId;
	var betAdmin = request.params.betAdmin;
	var hostAdminGoalsBet = request.params.hostAdminGoalsBet;
	var guestAdminGoalsBet = request.params.guestAdminGoalsBet;
	var stakeType = request.params.stakeType;
	var stakeDesc = request.params.stakeDesc;

	var LBFootballGameBetClass = Parse.Object.extend("LBFootballGameBet");
	var query = new Parse.Query(LBFootballGameBetClass);
	query.equalTo("layerGroupId",layerGroupId);
	query.equalTo("gameId",gameId);

	query.first({
		success: function(bet) {
			//If bet for group already exists in Parse:
			if (bet != undefined && bet != null) {
				response.error("errorBetAlreadyExists");
			} else {
				//New bet
				var bet = new LBFootballGameBetClass();
				bet.set("layerGroupId",layerGroupId);
				bet.set("gameId",gameId);
				bet.set("betAdmin",betAdmin);
				bet.set("hostAdminGoalsBet",hostAdminGoalsBet);
				bet.set("guestAdminGoalsBet",guestAdminGoalsBet);
				bet.set("stakeType",stakeType);
				bet.set("stakeDesc",stakeDesc);
				bet.save(null,{
					success:function(bet) { 
						//TODO: send layer admin msg and push
						response.success(true)
					},
					error:function(bet, error) {
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



function sendAdminMsgToGroup(layerGroupId, msg) {
	console.log("Fred!");
}


Parse.Cloud.define("AdminMsg", function(request, response) {
	sendAdminMsgToGroup("f313bdb8-eede-4d08-9afe-e3b49a55d957","Fred! Ma Nish!");
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



