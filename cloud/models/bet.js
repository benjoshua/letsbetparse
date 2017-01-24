module.exports = {
    name: 'LBFootballGameBet',
    modelClass: Parse.Object.extend(this.name),
    query: function(){
        return new Parse.Query(this.modelClass);
    },
    newInstance: function(){
        return new this.modelClass();
    },
    create: function(groupLayerId, gameId, betAdminLayerId, stakeType, stakeDesc, teamHostName, teamHostId,
                     teamGuestName, teamGuestId, date, location, hostAdminGoalsBet, guestAdminGoalsBet){
        var bet = this.newInstance();

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
        // - active state
        bet.set("active", 'true');

        return bet;
    }
};