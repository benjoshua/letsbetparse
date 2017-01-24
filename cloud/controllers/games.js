var utils = global.utils;
var constants = global.constants;

var Group = require('../models/group');
var User = require('../models/user');
var Bet = require('../models/bet');
var Match = require('../models/match');

var shouldUseXmlExamples = false; // toggle use of XML Soccer API or sample data

// www.xmlsoccer.com/FootballData.asmx/GetFixturesByDateInterval?ApiKey=OOYXGGEGYDPFYZQTSKQPWSSUENFSIWLCDVFBEQXDWKLCZUWKFU&startDateString=2016-04-01&endDateString=2016-04-30

module.exports = {
    /**
     * triggers api request to matches data provider
     * handled by callback for processing (DB insertion)
     */
    updateComingGames: function() {
        utils.logger.logMethod("[updateComingGames] starting");
        //If we wanna use the xml example, just use this:

        //if (shouldUseXmlExamples){
        if (false){
            utils.logger.logMethod("[updateComingGames] using example xml");

            fs.readFile('./matches_example_xml.xml', function(err, data) {
                updateComingGamesInDB(data);
            });

            return;
        }

        var xmlSoccerApiKey = process.env.XML_SOCCER_KEY;
        var xmlSoccerUrl = "http://www.xmlsoccer.com/FootballData.asmx/";

        var startDate = new Date();
        var endDate = new Date();
        endDate.setDate(endDate.getDate()+14);

        var fullUrl = ""+xmlSoccerUrl + "GetFixturesByDateInterval"+"?Apikey="+xmlSoccerApiKey+"&"+"startDateString="
            +utils.datetime.formatDate(startDate)+"&endDateString="+utils.datetime.formatDate(endDate);

        //In case we ran too many XMLSOCCER calls for the upper function:
        //	var fullUrl = ""+xmlSoccerUrl + "GetFixturesByDateIntervalAndLeague"+"?league=1&"+"Apikey="+xmlSoccerApiKey+"&"+"startDateString="
        //		+utils.datetime.formatDate(startDate)+"&endDateString="+utils.datetime.formatDate(endDate);

        utils.logger.logInfo("[updateComingGames] requesting data from", fullUrl);

        request({
            uri: fullUrl,
            method: "GET",
            json: true
        }, function(error, response, body) {
            utils.logger.logOk("[updateComingGames] received response");
            updateComingGamesInDB(body);
        });

    },
    /**
     * updates live scores from xmlsoccer, then calls to analyse results
     */
    updateLiveScores: function() {
        utils.logger.logMethod("[updateLiveScores] started ");

        //If we wanna use the xml example, just use this:
        if (shouldUseXmlExamples){
            utils.logger.logInfo("[updateLiveScores] using example xml");

            //TODO: change to real xml example

            fs.readFile('./live_scores_example_xml.xml', function(err, data) {
                updateLiveScoresInDBAndNotify(data);
            });

            return;
        }

        var xmlSoccerApiKey = process.env.XML_SOCCER_KEY;
        var xmlSoccerUrl = "http://www.xmlsoccer.com/FootballData.asmx/";

        var startDate = new Date();
        var endDate = new Date();
        endDate.setDate(endDate.getDate()+14);

        var fullUrl = ""+xmlSoccerUrl + "GetLiveScore"+"?Apikey="+xmlSoccerApiKey;

        utils.logger.logInfo("[updateLiveScores] requesting data from", fullUrl);

        request({
            uri: fullUrl,
            method: "GET",
            json: true
        }, function(error, response, body) {
            utils.logger.logOk("[updateLiveScores] got response");
            updateLiveScoresInDBAndNotify(body);
        });
    },
    /**
     * gets all matches
     * @param request
     * @param response
     */
    getLBFootballMatches: function(request, response) {
        // query, get all matches
        var query = Match.query();
        query.limit(1000);
        query.find({
            success: function(matches) {
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
    },
    /**
     * proxy for tests
     */
    updateLiveGameIfNeeded: updateLiveGameIfNeeded
};

// ------------------- [private] ------------------- //

/**
 * processes matches XML and calls for DB addition
 * @param futureMatchesXML
 */
function updateComingGamesInDB(futureMatchesXML){
    utils.logger.logMethod("[updateComingGamesInDB] starting");

    var parser = new xml2js.Parser({explicitRoot: false, normalizeTags: true}); //Without "XMLSOCCER.COM", with lowercase
    parser.parseString(futureMatchesXML, function (err, result) {
        // validate result
        if (err || result == undefined || result == null || result.match == undefined || result.match == null){
            utils.logger.logError('[updateComingGamesInDB] parseString error:', err, result);
            return;
        }

        utils.logger.logInfo("[updateComingGamesInDB] got " + result.match.length + " results");

        for(var i = 0; i < result.match.length; i++) {
            if (result.match[i] == undefined){
                //In case we get the too-many-cooks problem
                continue;
            }

            var currentMatch = result.match[i];

            var leagueName = currentMatch.league[0];
            if (leagueName in constants.leaguesDic){
                var leagueId = constants.leaguesDic[leagueName];
                var matchId = currentMatch.id[0];
                utils.logger.logInfo("[updateComingGamesInDB] getting data for gameID "+ matchId + " from league "+leagueId);
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

        utils.logger.logOk("[updateComingGamesInDB] done");
    });
}

/**
 * adds match to DB
 * @param matchId
 * @param date
 * @param leagueId
 * @param homeTeam
 * @param homeTeamId
 * @param awayTeam
 * @param awayTeamId
 * @param loc
 */
function addLBFootballMatchToDB(matchId, date, leagueId, homeTeam, homeTeamId, awayTeam, awayTeamId, loc){
    // query, check if match exists by id
    var query = Match.query();
    query.equalTo("matchId",matchId);
    query.first({
        success: function(match) {
            // if match doesn't exist create basic match
            if ((match == undefined ) || (match == null)) {
                utils.logger.logInfo("[addLBFootballMatchToDB] Creating matchId "+ matchId + " in DB");
                match = Match.create(matchId);
            }

            // update match info
            utils.logger.logInfo("[addLBFootballMatchToDB] Updating data of match "+ matchId);

            match.set("date", date);
            match.set("leagueId",leagueId);
            match.set("homeTeam",homeTeam);
            match.set("homeTeamId",homeTeamId);
            match.set("awayTeam",awayTeam);
            match.set("awayTeamId",awayTeamId);
            match.set("location",loc);

            utils.logger.logInfo("[addLBFootballMatchToDB] about to save match: ", match);

            match.save(null,{
                success:function(savedMatch) {
                    utils.logger.logOk("Succeeded saving data of match " + savedMatch.get("matchId"));
                },
                error:function(unsavedMatch, error) {
                    utils.logger.logError("Error saving data of match " + matchId + ": "+ error);
                    response.error(error);
                }
            });
        },
        error: function(error) {
            utils.logger.logError("Error querying match " + matchId + ": "+ error);
            response.error(error);
        }
    });
}

/**
 * Gets liveScoreXml and calls a function that updates db and notifies relevant groups
 * @param liveScoresXml
 */
function updateLiveScoresInDBAndNotify(liveScoresXml){
    utils.logger.logMethod("[updateLiveScoresInDBAndNotify] started ");

    var parser = new xml2js.Parser({explicitRoot: false, normalizeTags: true}); //Without "XMLSOCCER.COM", with lowercase
    parser.parseString(liveScoresXml, function (err, result) {
        if ((result != undefined) && (result != null) && (result.match != undefined) && (result.match != null)) {
            utils.logger.logInfo("[updateLiveScoresInDBAndNotify] xml parsing complete with " + result.match.length + " results");
            for(var i = 0; i < result.match.length; i++) {
                if (result.match[i] != undefined){ //In case we get the too-many-cooks problem
                    var leagueName = result.match[i].league[0];
                    if (leagueName in constants.leaguesDic){
                        var matchId = result.match[i].id[0];

                        utils.logger.logInfo("[updateLiveScoresInDBAndNotify] updating match id", matchId);

                        //TODO: change according to XML!!
                        var gameStatus = result.match[i].time[0];
                        var homeGoals = parseInt(result.match[i].homegoals[0]);
                        var awayGoals = parseInt(result.match[i].awaygoals[0]);
                        utils.logger.logInfo("[updateLiveScoresInDBAndNotify] score of game "+ matchId + ": "+homeGoals+"-"+awayGoals);

                        updateLiveGameIfNeeded(matchId, gameStatus, homeGoals, awayGoals);
                    }
                } else {
                    utils.logger.logWarning("[updateLiveScoresInDBAndNotify] undefined match for index", i);
                    console.dir(result);
                }
            }
            utils.logger.logOk("[updateLiveScoresInDBAndNotify] done");
        } else {
            utils.logger.logError("[updateLiveScoresInDBAndNotify] error:", err, "result:", result);
        }
    });
    //console.log("finished updateLiveScoresInDB()");
}


/**
 * after checking if some information is new, the function updates games in db with changes in live scores,
 * and then calls another function that sends notifications to relevant groups
 * @param matchId
 * @param gameStatus
 * @param homeGoals
 * @param awayGoals
 */
function updateLiveGameIfNeeded(matchId, gameStatus, homeGoals, awayGoals){
    //log("in updateLiveGameIfNeeded() with matchId "+matchId);

    // query, get match by id
    var query = Match.query();
    query.equalTo("matchId",matchId);
    query.first({
        success: function(match) {
            // validate match
            if (match == undefined || match == null) {
                utils.logger.logWarning("[updateLiveGameIfNeeded]  Didn't find match " + matchId + " in DB.");
                return;
            }

            utils.logger.logInfo("[updateLiveGameIfNeeded] Match exists in DB");

            // set status and goals
            var dbStatus = match.get("time");
            var dbHomeGoals = match.get("homeGoals");
            var dbAwayGoals = match.get("awayGoals");

            // if change in status or goals, save match and notify of status/score update
            if ((dbStatus != gameStatus) || (dbHomeGoals != homeGoals) || (dbAwayGoals != awayGoals)){
                utils.logger.logInfo("[updateLiveGameIfNeeded] Found different score or time in DB. Updaing DB accordingly");
                match.set("time", gameStatus);
                match.set("homeGoals", homeGoals);
                match.set("awayGoals", awayGoals);

                match.save(null,{
                    success:function(match_success) {
                        utils.logger.logOk("[updateLiveGameIfNeeded]  Succeeded updating match " + match_success.get("matchId"));
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
                        utils.logger.logError("[updateLiveGameIfNeeded]  Error updating match in DB: "+error);
                    }
                });
            }
        },
        error: function(error) {
            utils.logger.logError("[updateLiveGameIfNeeded]  Error querying DB for match " + matchId + ": "+error);
        }
    });
}

/**
 * Find groups that opened a bet regarding given gameId, and notify them with the relevant change
 * @param match
 */
function sendMessageToRelevantGroupsThatScoreChanged(match){
    var matchId = match.get("matchId");
    utils.logger.logMethod("[sendMessageToRelevantGroupsThatScoreChanged] started for match " + matchId);

    // query, get bets by game id
    var query = Bet.query();
    query.equalTo("gameId",matchId);
    query.find({
        success: function(bets) {
            // validate bets
            if (bets == undefined || bets == null) {
                utils.logger.logWarning("No bets exist for match " + matchId);
                return;
            }

            // get match data
            var homeTeamName = match.get("homeTeam");
            var awayTeamName = match.get("awayTeam");
            var homeTeamGoals = match.get("homeGoals");
            var awayTeamGoals = match.get("awayGoals");

            // send message to each group with bet on this match
            for(var i = 0; i < bets.length; i++) {
                var groupLayerId = bets[i].get("layerGroupId");
                utils.logger.logInfo("About to notify group "+ groupLayerId+" that the score changed");
                var message = "GOAL! "+homeTeamName+" vs "+awayTeamName+" - "+homeTeamGoals+":"+awayTeamGoals;
                utils.logger.logInfo("specifically: " + message);
                utils.layer.sendAdminMsgToGroup(groupLayerId, message,{});
            }
        },
        error: function(error) {
            utils.logger.logError("Error finding match: " + error);
            response.error(error);
        }
    });
}

/**
 * Find groups that opened a bet regarding given gameId, and notify them with the relevant change
 * @param match
 */
function performRelevantActionsInRelevantGroupsBecauseStatusChanged(match){
    //console.log("in performRelevantActionsInRelevantGroupsBecauseStatusChanged()");

    var matchId = match.get("matchId");

    // query, get bets by game id
    var query = Bet.query();
    query.equalTo("gameId",matchId);
    query.find({
        success: function(bets) {
            //If bets for given game exist:
            if (bets == undefined || bets == null) {
                utils.logger.logWarning("No bets exist for match " + matchId);
                return;
            }

            // get match data
            var homeTeamName = match.get("homeTeam")
            var awayTeamName = match.get("awayTeam")
            var homeTeamGoals = match.get("homeGoals");
            var awayTeamGoals = match.get("awayGoals");
            var gameTime = match.get("time");

            // send message to each group with bet on this match
            for(var i = 0; i < bets.length; i++) {
                var groupLayerId = bets[i].get("layerGroupId");
                if (gameTime == "0'"){
                    var message = homeTeamName+" vs "+awayTeamName+" - The bet has started";
                    utils.layer.sendAdminMsgToGroup(groupLayerId, message,{});
                }
                else if (gameTime == "Halftime"){
                    var message = homeTeamName+" vs "+awayTeamName+" - "+homeTeamGoals+":"+awayTeamGoals+" - Half Time";
                    utils.layer.sendAdminMsgToGroup(groupLayerId, message,{});
                }
            }

            // call to close match bets if ended
            if ((gameTime == "Finished") || (gameTime == "Finished AET") || (gameTime == "Finished AP")){
                updateEndedMatch(match, bets);
            }

        },
        error: function(error) {
            response.error(error);
        }
    });
}

/**
 * closes bets on match, calculates winnings and notifies
 * @param match
 * @param bets
 */
function updateEndedMatch(match, bets){
    var matchId = match.get("matchId");
    var homeTeamName = match.get("homeTeam");
    var awayTeamName = match.get("awayTeam");
    var homeTeamId = match.get("homeTeamId");
    var awayTeamId = match.get("awayTeamId");
    var homeTeamGoals = parseInt(match.get("homeGoals"));
    var awayTeamGoals = parseInt(match.get("awayGoals"));

    utils.logger.logMethod("[updateEndedMatchV2] started for match " + matchId + ". Updating relevant groups...");

    // update each bet opened for this match
    function updateBet(bet){
        var groupLayerId = bet.get("layerGroupId");
        utils.logger.logInfo("[updateEndedMatchV2] Updating bet for layerGroupId" + groupLayerId);

        var betStakeDesc = bet.get("stakeDesc");
        var betStakeType = bet.get("stakeType");

        // update group on match end
        function updateGroup(group) {
            // validate group
            if (group == undefined || group == null) {
                utils.logger.logError("[updateEndedMatchV2] group doesn't exist");
                return;
            }

            utils.logger.logInfo("[updateEndedMatchV2] Updating group " + groupLayerId);
            var currentStatistics = group.get("statistics");
            var groupUsersGuesses = bet.get("usersGuesses");

            var str = JSON.stringify(groupUsersGuesses, null, 4); // (Optional) beautiful indented output.
            utils.logger.logInfo("[updateEndedMatchV2] The group's guesses are: "+ str); // Logs output to dev tools console.


            var winnersArray = [];

            var userResults = {
                bullseye:[],
                almost:[],
                lost:[],
                deltaMap:{}
            };


            // updates statistics of user in group and assigns guess result to userResults
            function updateGroupStatsAndCollectGuessResults(userId){
                // get user's guess
                var userGuess = groupUsersGuesses[userId];
                // ensure user's group statistics object exists, initialize otherwise
                if ((currentStatistics[userId] == undefined) || (currentStatistics[userId] == null)){
                    utils.logger.logWarning("[updateEndedMatchV2] Stats of user " + userId + " are undefined. Initializing them");
                    currentStatistics[userId] = {"bullseye":0, "almost":0, "lost":0, "points":0};
                }
                // get user's group statistics
                var userStatistics = currentStatistics[userId];
                utils.logger.logInfo("[updateEndedMatchV2] userStatistics of " + userId + ": "+JSON.stringify(userStatistics, null, 4));

                // get user's guess
                var homeGuess = userGuess["homeGoals"];
                var awayGuess = userGuess["awayGoals"];


                //bullseye:
                if ((homeGuess == homeTeamGoals) && (awayGuess == awayTeamGoals)){

                    userStatistics["bullseye"] = userStatistics["bullseye"]+1;
                    userStatistics["points"] = userStatistics["points"]+2;

                    winnersArray.push(userId);
                    userResults.bullseye.push(userId);
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
                }
                //lost bet:
                else{
                    //console.log("lost ");
                    userStatistics["lost"] = userStatistics["lost"]+1;

                    userResults.lost.push(userId);
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
                utils.logger.logInfo("[updateEndedMatchV2] lot is", lot);

                // bullseye bonus
                var bullseyeBonusFactor = 0.1;
                var bullseyeBonus = betStakeDesc * bullseyeBonusFactor;

                utils.logger.logInfo("[updateEndedMatchV2] bullseyeBonus is", bullseyeBonus);

                // sum of users to split lot with
                var numofCorrectGuesses = userResults.bullseye.length + userResults.almost.length;
                utils.logger.logInfo("[updateEndedMatchV2] numofCorrectGuesses is", numofCorrectGuesses);

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
            utils.logger.logInfo("[updateEndedMatchV2] Updating coins");
            updateCoins();

            utils.logger.logInfo("[updateEndedMatchV2] userResults: "+JSON.stringify(userResults, null, 4));
            utils.logger.logInfo("[updateEndedMatchV2] Group's winners of this match are: "+JSON.stringify(winnersArray, null, 4));

            // update bet

            // - set winners array and coins delta map
            bet.set("winnersArray",winnersArray);
            bet.set("coinsDeltaMap",userResults.deltaMap);

            // - set end bet info
            bet.set("active", 'false');
            bet.set("teamHomeGoals", homeTeamGoals);
            bet.set("teamAwayGoals", awayTeamGoals);

            var winnerId = null;
            if (homeTeamGoals > awayTeamGoals)
                winnerId = homeTeamId;
            if (homeTeamGoals < awayTeamGoals)
                winnerId = awayTeamGoals;

            bet.set("winnerId", winnerId);

            // - save
            bet.save(null,{
                success:function(savedBet) {
                    // group's last bet

                    // - delete last group's bet
                    //deleteLastBetOfGroup(groupLayerId);

                    // - update last bet in group
                    group.set("lastBetId",savedBet.id);
                    group.set("lastBetType","Football");

                    // save group
                    group.save(null,{
                        //TODO: send right msg + data{}
                        success:function(group) {

                            utils.logger.logOk("[updateEndedMatchV2] saved group " + groupLayerId);

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
                                "coinsDeltaMap" : userResults.deltaMap,
                                "betId":savedBet.id,
                                "gameId":matchId
                            };

                            utils.logger.logInfo("[updateEndedMatchV2] gonna send them this message: " + message);
                            utils.layer.sendAdminMsgToGroup(groupLayerId, message, data);
                        },
                        error:function(group, error) {
                            utils.logger.logError("[updateEndedMatchV2] error saving group: " + error);
                        }
                    });
                },
                error:function(bet, error) {
                    utils.logger.logError("[updateEndedMatchV2] error saving bet: " + error);
                }
            });

        }

        // query, get group by id
        var query = Group.query();
        query.equalTo("layerGroupId",groupLayerId);
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

    //match.destroy({});
    // update match to ended
    match.set('active', 'false');

    match.save(null,{
        success:function(match) {
            utils.logger.logOk("[updateEndedMatchV2] set match active flag to false", "match id:", matchId);
        },
        error:function(match, error) {
            utils.logger.logError("[updateEndedMatchV2] error saving match: ", "match id:", matchId, "error:", error);
        }
    });
}


/**
 * updates betsParticipated in user stats
 * @param userLayerId
 * @param deltaTotalCoins
 * @param deltaAvailableCoins
 */
function updateBetsParticipatedStatForUser(userLayerId, deltaTotalCoins, deltaAvailableCoins){
    utils.logger.logMethod("[updateBetsParticipatedStatForUser] started");

    // query, get user by id
    var query = User.query();
    query.equalTo("layerIdentityToken",userLayerId);
    query.first({
        success: function(user) {
            //If user exists in Parse:
            if (user == undefined || user == null) {
                utils.logger.logWarning("[updateBetsParticipatedStatForUser] Tried to update user stat but couldn't find user");
                return;
            }
            var amountOfBetsParticipated = user.get("betsParticipated");
            amountOfBetsParticipated = amountOfBetsParticipated + 1;
            user.set("betsParticipated",amountOfBetsParticipated);

            setUserCoinsOnMatchEnd(user, deltaTotalCoins, deltaAvailableCoins);

            user.save(null,{
                success:function(savedUser) {
                    utils.logger.logOk("[updateBetsParticipatedStatForUser] succeeded saving betsParticipated");
                }, error:function(unsavedUser, error) {
                    utils.logger.logError("[updateBetsParticipatedStatForUser] failed saving betsParticipated");
                }
            });
        },
        error: function(error) {
            utils.logger.logError("[updateBetsParticipatedStatForUser] Tried to update user stat but failed performing query");
        }
    });
}

/**
 * updates both betsWon AND betsParticipated in user stats
 * @param userLayerId
 * @param deltaTotalCoins
 * @param deltaAvailableCoins
 */
function updateWinStatForUser(userLayerId, deltaTotalCoins, deltaAvailableCoins){
    // query, get user by id
    var query = User.query();
    query.equalTo("layerIdentityToken",userLayerId);
    query.first({
        success: function(user) {
            //If user exists in Parse:
            if (user == undefined || user == null) {
                utils.logger.logError("[updateWinStatForUser] Tried to update user stat but couldn't find user");
                return;
            }
            var amountOfBetsWon = user.get("betsWon");
            amountOfBetsWon = amountOfBetsWon + 1;
            user.set("betsWon",amountOfBetsWon);
            var amountOfBetsParticipated = user.get("betsParticipated");
            amountOfBetsParticipated = amountOfBetsParticipated + 1;
            user.set("betsParticipated",amountOfBetsParticipated);

            setUserCoinsOnMatchEnd(user, deltaTotalCoins, deltaAvailableCoins);

            user.save(null,{
                success:function(savedUser) {
                    utils.logger.logOk("[updateWinStatForUser] succeeded saving betsParticipated and betsWon");
                }, error:function(unsavedUser, error) {
                    utils.logger.logError("[updateWinStatForUser] failed saving betsParticipated and betsWon");
                }
            });
        },
        error: function(error) {
            utils.logger.logError("[updateWinStatForUser] Tried to update user stat but failed performing query");
        }
    });
}

/**
 * sets user coins status
 * - doesn't save
 * @param user
 * @param deltaTotalCoins
 * @param deltaAvailableCoins
 */
function setUserCoinsOnMatchEnd(user, deltaTotalCoins, deltaAvailableCoins){
    if (deltaTotalCoins){
        var totalCoins = user.get("totalCoins");
        user.set("totalCoins", totalCoins + deltaTotalCoins);
        utils.logger.logInfo("[setUserCoinsOnMatchEnd] updating totalCoins to ", totalCoins + deltaTotalCoins);
    }

    if (deltaAvailableCoins){
        var availableCoins = user.get("availableCoins");
        user.set("availableCoins", availableCoins + deltaAvailableCoins);
        utils.logger.logInfo("[setUserCoinsOnMatchEnd] updating availableCoins to ", availableCoins + deltaAvailableCoins);
    }
}

