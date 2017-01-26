var utils = global.utils;
var constants = global.constants;

var Group = global.models.group;
var User = global.models.user;
var Bet = global.models.bet;
var Match = global.models.match;

module.exports = {
    /**
     * creates bet, adds creator's guess and sends message to group
     * @param request
     * @param response
     */
    createFootballGameBet: function(request, response) {
        utils.logger.logMethod('[createFootballGameBetV2] started');
        var betAdminLayerId = request.params.betAdminLayerId;
        var stakeType = request.params.stakeType;
        var stakeDesc = request.params.stakeDesc;

        // query, get user (new bet's admin) by id
        var userQuery = User.query();
        userQuery.equalTo("layerIdentityToken", betAdminLayerId);
        userQuery.first({
            success: function(user) {
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
            },
            error:function(user, error) {
                response.error("findBetAdminUser: " + error);
            }
        });
    },
    /**
     * adds guess to bet and sends message to group
     * @param request
     * @param response
     */
    addGuessToFootballGameBet: function(request, response) {
        var gameApiId = request.params.gameApiId;
        var groupLayerId = request.params.groupLayerId;
        var userLayerId = request.params.userLayerId;

        // query, get bet by group and game id
        var query = Bet.query();
        query.equalTo("layerGroupId",groupLayerId);
        query.equalTo("gameId",gameApiId);
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

                // get guessing user, by id
                var userQuery = User.query();
                userQuery.equalTo("layerIdentityToken", userLayerId);
                userQuery.first({
                    success: function(user) {
                        // validate user
                        if ((user == undefined) || (user == null)){
                            response.error("GuessingUserNotFound");
                            return;
                        }

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
    },
    /**
     * returns group bets
     * @param request
     * @param response
     */
    getGroupOpenBets: function(request, response) {
        var groupLayerId = request.params.layerGroupId;

        // query, get group by id
        var groupQuery = Group.query();
        groupQuery.equalTo("layerGroupId",groupLayerId);
        groupQuery.first({
            success: function(group) {
                // validate
                if (group == undefined || group == null) {
                    utils.logger.logWarning("getGroupOpenBets error: group doesn't exist");
                    return;
                }

                // query, get bets by group id
                var betQuery = Bet.query();
                betQuery.equalTo("layerGroupId",groupLayerId);

                /*
                 // find group's last bet, which isn't relevant to return cause it's been closed already
                 var lastBetId = group.get("lastBetId");
                 query.notEqualTo("_id",lastBetId);
                 */

                betQuery.find({
                    success: function(bets) {
                        if (bets.length == 0){
                            response.error("no bets");
                        }
                        else{
                            response.success(bets);
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
    },
    /**
     * returns last bet of group
     * @param request
     * @param response
     */
    getLastBetForGroup: function(request, response) {
        var groupLayerId = request.params.groupLayerId;

        // query, get group by id
        var query = Group.query();
        query.equalTo("layerGroupId",groupLayerId);
        query.first({
            success: function(group) {
                //If group doesn't exist in DB:
                if (group == undefined || group == null) {
                    response.error("group wasn't found");
                    return;
                }

                var lastBetId = group.get("lastBetId");

                var betQuery = Bet.query();
                betQuery.equalTo("_id",lastBetId);
                betQuery.first({
                    success: function(lastBet) {
                        if (group != undefined && group != null) {
                            response.success(lastBet);
                        }else{
                            response.error("last bet wasn't found");
                        }
                    },
                    error: function(error) {
                        response.error("error fetching last bet: "+error);
                    }
                });
            },
            error: function(error) {
                response.error(error);
            }
        });

    }
};

// ------------------- [private] ------------------- //

/**
 * creates bet, adds creators guess and sends message to group
 * @param adminLBUser
 * @param request
 * @param response
 * @param onSuccess
 */
function createFootballGameBet(adminLBUser, request, response, onSuccess){

    // extract params
    var groupLayerId = request.params.layerGroupId;
    var gameId = request.params.gameId;
    var betAdminLayerId = request.params.betAdminLayerId;
    var hostAdminGoalsBet = parseInt(request.params.hostAdminGoalsBet);
    var guestAdminGoalsBet = parseInt(request.params.guestAdminGoalsBet);
    var stakeType = request.params.stakeType;
    var stakeDesc = request.params.stakeDesc;

    // query, check if bet for match exists in group, by group id and game id
    var betQuery = Bet.query();
    betQuery.equalTo("layerGroupId",groupLayerId);
    betQuery.equalTo("gameId",gameId);
    betQuery.first({
        success: function(betQueryResult) {

            // return error if already exists
            if (betQueryResult != undefined && betQueryResult != null) {
                utils.logger.logError("[createFootballGameBet] BetAlreadyExists", betQueryResult);
                response.error("errorBetAlreadyExists");
                return;
            }

            // query, get all the relevant data about the match from DB, by match id
            var matchQuery = Match.query();
            matchQuery.equalTo("matchId",gameId);
            matchQuery.first({
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

                    utils.logger.logInfo("[createFootballGameBet] Got relevant data about match " + gameId + " from DB");

                    // create the new bet
                    var bet = Bet.create(groupLayerId, gameId, betAdminLayerId, stakeType, stakeDesc, teamHostName, teamHostId,
                        teamGuestName, teamGuestId, date, location, hostAdminGoalsBet, guestAdminGoalsBet);

                    // save bet and send message in group
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
                            };

                            utils.layer.sendAdminMsgToGroup(groupLayerId, "New Bet by " + adminLBUser.get("name") +  "... Lets Bet!", data);

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

/**
 * adds guess to bet
 * @param user
 * @param bet
 * @param request
 * @param response
 * @param onSuccess
 */
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

            utils.logger.logInfo("[addGuessToFootballGameBet] guess added to bet:" + bet);

            // formulate and send notification to group

            // get match, by id
            var matchQuery = Match.query();
            matchQuery.equalTo("matchId",gameApiId);
            matchQuery.first({
                success: function(match) {

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
                        "date" : match.get("date"),
                        "stakeType" : bet.get("stakeType"),
                        "stakeDesc" : bet.get("stakeDesc"),
                        "teamAwayGoals" : goalsTeamGuest,
                        "teamHomeGoals" : goalsTeamHost
                    };

                    utils.logger.logInfo("[addGuessToFootballGameBet] adding bet guess with data:" + data);

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

                    utils.logger.logInfo("[addGuessToFootballGameBet] adding bet guess with notification message: " + message);

                    // send notification
                    utils.layer.sendAdminMsgToGroup(groupLayerId, message, data);

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

