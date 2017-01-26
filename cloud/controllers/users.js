var utils = global.utils;
var constants = global.constants;

var User = global.models.user;

module.exports = {
    /**
     * Sends sms to user and saves the login code for authentication
     * @param request
     * @param response
     */
    sendSmsForPhoneNumber: function(request, response) {
        // get phone number
        var phoneNumber = request.params.phoneNumber;
        // generate code
        var code = "" + (Math.floor(Math.random()*90000) + 10000);
        // query, check if phone number in use
        var query = User.query();
        query.equalTo("phoneNumber",phoneNumber);
        query.first({
            success: function(user) {
                // check existence
                if (user != undefined && user != null) {
                    // phone number exists, don't create new user, just set login code
                    user.set("loginCode",code);
                } else {
                    // phone number doesn't exists, create user
                    user = User.create(phoneNumber, code);
                }
                saveUserAndSendSMS(user, phoneNumber, code, response);
            },
            error: function(error) {
                response.error(error);
            }
        });
    },
    /**
     * checks if inserted code equals actual login code
     * @param request
     * @param response
     */
    authenticatePhoneNumberAndSendToken: function(request, response) {
        // get phone number and received code
        var phoneNumber = request.params.phoneNumber;
        var receivedCode = request.params.code;
        // query, check if codes match
        var query = User.query();
        query.equalTo("phoneNumber",phoneNumber);
        query.first({
            success: function(user) {
                // check existence
                if (user != undefined && user != null) {
                    // get actual code
                    var dbCode = user.get("loginCode");
                    // if codes match return user object
                    if (dbCode === receivedCode){
                        response.success(user);
                    }
                    // otherwise, send error
                    else{
                        response.error("User entered wrong SMS code");
                    }
                } else {
                    // user doesn't exists
                    response.error("User doesn't exist")
                }
            },
            error: function(error) {
                response.error(error);
            }
        });
    },
    /**
     * changes user's nickname
     * @param request
     * @param response
     */
    changeUserNickname: function(request, response) {
        // get input
        var nickname = request.params.nickname;
        var picture = request.params.picture;
        var layerIdentityToken = request.params.layerIdentityToken;

        // query, get user with layer identity token
        var query = User.query();
        query.equalTo("layerIdentityToken",layerIdentityToken);
        query.first({
            success: function(user) {
                // return if doesn't exist
                if (user == undefined || user == null) {
                    return response.error("User doesn't exist");
                }
                // set name, picture
                user.set("name",nickname);
                user.set("picture", picture);

                // save
                user.save(null,{
                    success:function(user) {
                        response.success(true);
                    }, error:function(user, error) {
                        response.error(error);
                    }
                });

            },
            error: function(error) {
                response.error(error);
            }
        });
    },
    /**
     * returns user objects by phone numbers
     * @param request
     * @param response
     */
    getUserObjectsForPhoneNumbers: function(request, response) {
        // Phone numbers should be in form of +972...
        var phoneNumbersArray = request.params.phoneNumbers;

        // query, get users according to phone numbers
        var query = User.query();
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
    },

    /**
     * returns stats (bets won, bets participated) for user by id
     * @param request
     * @param response
     */
    getStatsForUser: function(request, response) {
        var userLayerId = request.params.userLayerId;

        // query, get user's bet won/participated count
        var query = User.query();
        query.equalTo("layerIdentityToken", userLayerId);
        query.select("betsWon", "betsParticipated");
        query.first({
            success: function(userStats) {
                // if user exists, return stats
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

    },
    /**
     * returns user objects by ids
     * @param request
     * @param response
     */
    getUserObjectsForUserLayerIds: function(request, response) {
        var userLayerIdsArray = request.params.userLayerIdsArray;

        utils.logger.logMethod("[getUserObjectsForUserLayerIds] started");

        // query, get user's according to layer ids array
        var query = User.query();
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


    },

    /**
     * updates coins amount for users where bonus time past, update bonus time to next
     */
    checkCoinsBonus: function(){
        utils.logger.logMethod("[checkCoinsBonus] start");

        // query, get users where next bonus time is less than or equal current time
        var query = User.query();
        query.lessThanOrEqualTo("nextBonusTime",utils.datetime.getNowTime());
        query.find({
            success: function(users) {
                // return in case no users
                if (users == undefined || users == null){
                    utils.logger.logWarning("[checkCoinsBonus] no users");
                    return;
                }

                // log number of users
                utils.logger.logInfo("[checkCoinsBonus] got " + users.length + " users");

                // iterate over resulting users, give bonus and update next bonus time
                for (var i = 0; i < users.length; i++) {
                    var user = users[i];
                    // get total/available coins and update
                    var newTotalCoins = (user.get("totalCoins") || 0) + constants.coins.periodicBonusAmount;
                    var newAvailableCoins = (user.get("availableCoins") || 0) + constants.coins.periodicBonusAmount;
                    user.set("totalCoins", newTotalCoins);
                    user.set("availableCoins", newAvailableCoins);
                    // update next bonus time
                    user.set("nextBonusTime", utils.datetime.getNextPeriodicBonusTime());
                    // save
                    user.save();

                    // announce
                    utils.layer.sendAnnouncementToUser(user.get("layerIdentityToken"),
                        "You've just received " + constants.coins.periodicBonusAmount + "more chips! ... Lets bet!",
                        {
                            msgType: "coinsBonus",
                            bonusAmount: constants.coins.periodicBonusAmount,
                            totalCoins: newTotalCoins,
                            availableCoins: newAvailableCoins
                        },
                        "bonus-announcement-"+user.get("layerIdentityToken"));
                }
                utils.logger.logMethod("[checkCoinsBonus] done");
            },
            error: function(error) {
                utils.logger.logError("[checkCoinsBonus] query error", error);
            }
        });
    }
};

// ------------------- [private] ------------------- //

/**
 * saves given user object and sends authentication sms
 * @param user
 * @param phoneNumber
 * @param code
 * @param response
 */
function saveUserAndSendSMS(user, phoneNumber, code, response) {
    utils.logger.logMethod("[saveUserAndSendSMS] started");
    // save login code and send sms on success
    user.save(null,{
        success:function(user) {
            utils.logger.logOk("[saveUserAndSendSMS] user saved successfully");
            // TODO return response according to twilio?
            response.success(true);

            //  if dev env, print code and return (without sms)
            if (process.env.ENV === "dev"){
                utils.logger.logInfo("code is", code);
                return;
            }

            // send sms
            utils.sms.send(phoneNumber, 'Your code is: ' + code + ".",
                function() {
                    response.success(true);
                    utils.logger.logOk("[saveUserAndSendSMS] sms sent");
                },
                function(err) {
                    response.error(err);
                    utils.logger.logError("saveUserAndSendSMS error: " + err.message);
                }
            );
        },
        error:function(user, error) {
            response.error(error);
            utils.logger.logError("saveUserAndSendSMS user error: " + error.message);
        }
    });
}