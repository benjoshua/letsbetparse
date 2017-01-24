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
                    utils.layer.sendAdminMsgToGroup(groupLayerId, message ,data);
                    //utils.layer.sendAdminMsgToGroup(groupLayerId,message, {});
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
    utils.logger.log(JSON.stringify(betId, null, 4));
    utils.logger.log(JSON.stringify(userLayerId, null, 4));
    utils.logger.log(JSON.stringify(userGuess, null, 4));

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

                utils.logger.log("these are the guesses before trying to add anything:");
                utils.logger.log(JSON.stringify(usersGuesses, null, 4));
                //make sure user didn't guess already
                for (var guess in usersGuesses){
                    if (usersGuesses[guess].indexOf(userLayerId) > -1){
                        utils.logger.log(usersGuesses[guess].indexOf(userLayerId));
                        utils.logger.logWarning("user already placed a guess");
                        response.error("user already placed a guess");
                        return;
                    }
                }

                if (userGuess in usersGuesses){
                    utils.logger.logOk("pushed guess to userGuesses");
                    usersGuesses[userGuess].push(userLayerId);
                }else{
                    utils.logger.logOk("created new guess");
                    usersGuesses[userGuess] = [userLayerId];
                }
                bet.save(null,{
                    success:function(bet_success) {

                        utils.logger.logOk("succeeded adding guess to custom bet "+betId)

                        var newUsersGuesses = bet_success.get("usersGuesses");
                        utils.logger.log("these are the guesses after adding new guess:");
                        utils.logger.log(JSON.stringify(newUsersGuesses, null, 4));

                        utils.layer.sendAdminMsgToGroup(bet.get("groupLayerId"), "guess was added to custom bet", {});
                        response.success(true);
                    },
                    error:function(bet, error) {

                        utils.logger.logError("failed adding guess to custom bet "+betId)
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
                utils.logger.logError("custom bet wasn't found");
                response.error("bet wasn't found");
            }else{
                if (bet.get("betAdminLayerId") != userLayerId){
                    utils.logger.logError(userLayerId+" isn't an admin, thus can't close the bet");
                    response.error("this user isn't an admin, thus can't close the bet");
                }else{
                    //Update stats according to guesses
                    var bullseyeArray = [];
                    var lostArray = [];
                    usersGuesses = bet.get("usersGuesses");
                    if (!(winningGuess in usersGuesses)){
                        utils.logger.logWarning("winning guess wasn't even a possibility");
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
                                    utils.logger.log("user " + userId + " guessed right");
                                    updateWinStatForUser(userId);
                                    bullseyeArray.push(userId);
                                }
                            }else{
                                for (var i = 0; i < usersArray.length; i++) {
                                    var userId = usersArray[i];
                                    utils.logger.log("user " + usersArray[i] + " guessed wrong");
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
                            utils.logger.log("trying to delete last bet in group (for custom bet)");
                            deleteLastBetOfGroup(groupLayerId);
                            //Update last bet
                            utils.logger.log("trying to update last bet in group (for custom bet)");
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
                                        utils.logger.log("current statistics of group: "+ newStatisticsStr);
                                        for (var j = 0; j < winnersArray.length; j++) {
                                            var userId = winnersArray[j];
                                            if (!(userId in newStatistics)){
                                                utils.logger.log("user "+userId+ " doesn't exist in group stats, so adding it with bullseye points already");
                                                newStatistics[userId] = {"bullseye":1, "almost":0, "lost":0, "points":3};
                                            }else{
                                                utils.logger.log("updating a bullseye for user "+userId);
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
                                                utils.logger.log("user "+userId+ " doesn't exist in group stats, so adding it with bullseye points already");
                                                newStatistics[userId] = {"bullseye":0, "almost":0, "lost":1, "points":0};
                                            }else{
                                                utils.logger.log("updating a bullseye for user "+userId);
                                                var losts = (newStatistics[userId])["lost"];
                                                losts = losts + 1;
                                                (newStatistics[userId])["lost"] = losts;
                                                //newStatistics[userId].push({key:"lost", value:losts});
                                            }
                                        }

                                        var newStatisticsStr = JSON.stringify(newStatistics, null, 4);
                                        utils.logger.log("new statistics of group: "+ newStatisticsStr);

                                        group.set("statistics",newStatistics);

                                        utils.logger.log("trying to save last bet details");
                                        group.save(null,{
                                            success:function(group) {
                                                utils.logger.logOk("succeeded saving last bet details");
                                                var message = "Custom bet finished";
                                                var data = {
                                                    "msgType" : "CustomBetFinished",
                                                    "winners" : winnersArray,
                                                    "winnersArray" : winnersArray,
                                                    "betName" : saved_bet.get("betName"),
                                                    "stakeDesc" : saved_bet.get("stakeDesc"),
                                                    "stakeType" : saved_bet.get("stakeType")
                                                }
                                                utils.layer.sendAdminMsgToGroup(groupLayerId,message, data);
                                                //updateLastCustomBetOfGroup(betId, groupLayerId);
                                                response.success();
                                            },
                                            error:function(group, error) {
                                                utils.logger.logError("failed saving last bet: "+error);
                                            }
                                        });
                                    }
                                },
                                error: function(error) {
                                    utils.logger.logError("closeCustomBet baa: "+error);
                                    response.error(error);
                                }
                            });
                        },
                        error:function(group, error) {
                            utils.logger.logError("failed saving winnersArray in last bet: "+error);
                        }
                    });





                }
            }
        },
        error: function(error) {
            utils.logger.logError("closeCustomBet baaaaa: "+error);
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
					utils.logger.logWarning("got custom bet for some reason");
					return;

				}else{
					utils.logger.logWarning("Unknown last bet type");
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
						utils.layer.sendAdminMsgToGroup(groupLayerId, message,{});
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

                            utils.logger.logOk("[createFootballGameBet] Got relevant data about match from DB");

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
															utils.logger.logOk("updated lastBet in group in db");
														},
														error:function(groupError, error) {
															utils.logger.logError("error updating last bet in group: "+error);
															var str = JSON.stringify(error, null, 4);
															utils.logger.logError(str);
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

                                            utils.layer.sendAdminMsgToGroup(groupLayerId, "New Bet by " + user.get("name") +  "... Lets Bet!", data);
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
                        utils.logger.logInfo("[addGuessToFootballGameBet] got bet : " + bet);
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
                                            utils.logger.logInfo("[addGuessToFootballGameBet] data:", data);
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
                                            utils.logger.logInfo("[addGuessToFootballGameBet] about to send: " + message);
                                            utils.layer.sendAdminMsgToGroup(groupLayerId, message, data);
                                            response.success(true);
                                        },
                                        error: function(error_match) {
                                            utils.logger.logError("Error querying match " + matchId + ": "+ error_match);
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


// - helper for performRelevantActionsInRelevantGroupsBecauseStatusChanged
//send notifications to relevant groups, delete match from db, update statistics in relevant groups
function updateEndedMatch(match, bets){
    var matchId = match.get("matchId");
    utils.logger.logMethod("[updateEndedMatch] started for match " + matchId + ". Updating relevant groups...");
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
                    utils.logger.logInfo("[updateEndedMatch] Updating group " + groupLayerId);
                    var currentStatistics = group.get("statistics");
                    var groupUsersGuesses = bet.get("usersGuesses");

                    var str = JSON.stringify(groupUsersGuesses, null, 4); // (Optional) beautiful indented output.
                    utils.logger.logInfo("[updateEndedMatch] The group's guesses are: "+ str); // Logs output to dev tools console.

                    //update statistics
                    var winnersArray = [];
                    for (var userId in groupUsersGuesses) {
                        if (!groupUsersGuesses.hasOwnProperty(userId))
                            continue;

                        var userGuess = groupUsersGuesses[userId];
                        if ((currentStatistics[userId] == undefined) || (currentStatistics[userId] == null)){
                            utils.logger.logWarning("[updateEndedMatch] Stats of user " + userId + " are undefined. Initializing them");
                            currentStatistics[userId] = {"bullseye":0, "almost":0, "lost":0, "points":0};
                        }
                        var userStatistics = currentStatistics[userId];
                        utils.logger.logInfo("[updateEndedMatch] userStatistics of " + userId + ": "+JSON.stringify(userStatistics, null, 4));

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

                    utils.logger.logInfo("[updateEndedMatch] Group's winners of this match are: "+JSON.stringify(winnersArray, null, 4));
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
                                    utils.logger.logOk("[updateEndedMatch] saved statistics for group " + groupLayerId);
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
                                        utils.logger.logInfo("[updateEndedMatch] gonna send them this message: " + message);
                                        utils.layer.sendAdminMsgToGroup(groupLayerId, message, data);
                                    } else {
                                        var LBUserClass = Parse.Object.extend("LBUser");
                                        var userQuery = new Parse.Query(LBUserClass);

                                        userQuery.containsAll("layerIdentityToken", winnersArray);
                                        userQuery.first({
                                            success: function(users) {
                                                message = message + (winnersArray.length == 1 ? "the winner is " : "the winners are ");
                                                message = message + users.map(function(u){ return u.get("name");}).join(",");
                                                utils.logger.logInfo("[updateEndedMatch] gonna send them this message: " + message);
                                                utils.layer.sendAdminMsgToGroup(groupLayerId, message, data);
                                                response.success(true);
                                            },
                                            error:function(bet, error) {
                                                var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
                                                utils.logger.logError("[updateEndedMatch]", str); // Logs output to dev tools console.
                                                response.error(error);
                                            }
                                        });
                                    }
                                },
                                error:function(group, error) {
                                    utils.logger.logError("[updateEndedMatch] error saving guesses: "+error);
                                }
                            });
                        },
                        error:function(group, error) {
                            utils.logger.logError("[updateEndedMatch] failed saving winnersArray in football bet: "+error);
                        }
                    });

                } else {
                    utils.logger.logError("[updateEndedMatch] error: group doesn't exist");
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
    utils.logger.logMethod("[deleteLastBetOfGroup] of group "+groupLayerId);
    var LBGroupClass = Parse.Object.extend("LBGroup");
    var query = new Parse.Query(LBGroupClass);
    query.equalTo("layerGroupId",groupLayerId);

    query.first({
        success: function(group) {
            //group exists:
            if (group != undefined && group != null) {
                utils.logger.logInfo("[deleteLastBetOfGroup] in group "+groupLayerId);

                var betId = group.get("lastBetId");
                var betType = group.get("lastBetType");

                var LBBetClass;
                if (betType === "Football"){
                    LBBetClass = Parse.Object.extend("LBFootballGameBet");
                }else if (betType === "Custom"){
                    LBBetClass = Parse.Object.extend("LBCustomBet");
                }else{
                    utils.logger.logWarning("Unknown last bet type in group");
                }
                var betQuery = new Parse.Query(LBBetClass);
                betQuery.equalTo("_id",betId);
                betQuery.first({
                    success: function(betToDel) {
                        if ((betToDel != undefined) && (betToDel != null)) {
                            utils.logger.logOk("[deleteLastBetOfGroup] deleted "+betType+" bet "+betId+" from DB");
                            betToDel.destroy({});
                        }else{
                            utils.logger.logError("[deleteLastBetOfGroup]", betType+" bet "+betId+" was not found in bets DB");
                        }
                    },
                    error: function(error) {
                        utils.logger.logError("[deleteLastBetOfGroup]", "error fetching bet: "+error);
                    }
                });

            } else {
                utils.logger.logError("[deleteLastBetOfGroup] group doesn't exist");
            }
        },
        error: function(error) {
            utils.logger.logError("[deleteLastBetOfGroup]"+error);
        }
    });




}


// ------------------------- AdminMsg ----------------------------

Parse.Cloud.define("AdminMsg", function(request, response) {
    utils.layer.sendAdminMsgToGroup("8dc83080-ae62-4602-b8d2-e400356096db","Fred! Ma Nish!");
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
