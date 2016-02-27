
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
	    		SaveUserAndSendSMS(user, phoneNumber, code, response);
			} else {
			//New user
				var user = new LBUserClass();
				user.set("phoneNumber",phoneNumber);
				user.set("loginCode",code);
				user.set("name","");
				user.set("layerIdentityToken",generateUuid());
				SaveUserAndSendSMS(user, phoneNumber, code, response);
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

//Practically send the SMS, after saving all data in Parse
function SaveUserAndSendSMS(user, phoneNumber, code, response) {
	console.log(user.phoneNumber)
	user.save(null,{
		success:function(user) { 
  				var client = require('twilio')('ACed1f17d6a82f9a922f8a10de877b79e5', '4ba18cd3ca91916e74d3dac67509bcf0');
  				client.sendSms({
  					to:phoneNumber, 
  					from: '+972526286926', 
  					body: 'Welcome to Let\'s Bet!\nYour code is: ' + code + "."  
  				}, function(err, responseData) { 
  					if (err) {
  						response.error(err);
  					} else { 
  						console.log(responseData.from); 
  						console.log(responseData.body);
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

// -------------------------Test hi----------------------------

Parse.Cloud.define("testHi", function(request, response) {
	var phoneNumber = "+972549844778";
	var code = "2222"; //"" + (Math.floor(Math.random()*90000) + 10000);
	var LBUserClass = Parse.Object.extend("LBUser");
	var query = new Parse.Query(LBUserClass);
	query.equalTo("phoneNumber",phoneNumber);

	query.first({
		success: function(user) {
			
			//If user already exists in Parse:
			if (user != undefined && user != null) {
				user.set("loginCode",code);
	    		SaveUserAndSendSMS(user, phoneNumber, code, response);
			} else {
			//New user
				var user = new LBUserClass();
				user.set("phoneNumber",phoneNumber);
				user.set("loginCode",code);
				user.set("name","");
				user.set("layerIdentityToken",generateUuid());
				SaveUserAndSendSMS(user, phoneNumber, code, response);
			}
		},
		error: function(error) {
			response.error(error);
		}
	});


	
});



