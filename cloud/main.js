// ---------------------- dependencies ------------------ //

// [external]
// prepare libraries object
var libs = {};
libs.request = require("request"); // used by platform API
libs.deferred = require('deferred'); // used by platform API
libs.xml2js = require('xml2js');
libs.parseString = require('xml2js').parseString;
libs.fs = require('fs');

// jQuery
// used for xml from XMLSOCCER
libs.jQuery = null;
require("jsdom").env("", function(err, window) {
	if (err) {
		console.error(err);
		return;
	}

    libs.jQuery = require("jquery")(window);
	global.DOMParser = require('xmldom').DOMParser;
});

// assign libs to global scope
global.libs = libs;

// [internal]
var constants = global.constants = require('./constants');
var utils = global.utils = require('./utils');

// models
var models = global.models = {
    user: require('./models/user'),
    group: require('./models/group'),
    bet: require('./models/bet'),
    match: require('./models/match')
};

// controllers
var controllers = {
	users: require('./controllers/users'),
	groups: require('./controllers/groups'),
	bets: require('./controllers/bets'),
    games: require('./controllers/games')
};

// ---------------------- scheduled tasks ------------------ //

utils.scheduler.schedule('liveUpdate', controllers.games.updateLiveScores, constants.scheduleIntervals.liveUpdate);
utils.scheduler.schedule('updateComingGames', controllers.games.updateComingGames, constants.scheduleIntervals.gamesUpdate, 5000);
utils.scheduler.schedule('checkCoinsBonus', controllers.users.checkCoinsBonus, constants.scheduleIntervals.coinsBonusUpdate, 5000);

// ---------------------- boot operations ------------------ //

// end game test
// change to valid and update data to test
var endGameTest = {
	valid: false,
    delay: 30000,
	matchId: "367672",
	state: "Finished",
	home: 2,
	away: 0
};
if (endGameTest.valid) {
    setTimeout(function () {
        controllers.users.updateLiveGameIfNeeded(endGameTest.matchId, endGameTest.state, endGameTest.home, endGameTest.away);
    }, endGameTest.delay);
}

// ---------------------- API (by controllers) ------------------ //

/********************************************************************
 | Users
********************************************************************/

Parse.Cloud.define("sendSmsForPhoneNumber", controllers.users.sendSmsForPhoneNumber);
Parse.Cloud.define("authenticatePhoneNumberAndSendTokenV2", controllers.users.authenticatePhoneNumberAndSendToken);
Parse.Cloud.define("changeUserNickname", controllers.users.changeUserNickname);
Parse.Cloud.define("getUserObjectsForPhoneNumbers", controllers.users.getUserObjectsForPhoneNumbers);
Parse.Cloud.define("getStatsForUser", controllers.users.getStatsForUser);
Parse.Cloud.define("getUserObjectsForUserLayerIds", controllers.users.getUserObjectsForUserLayerIds);

/********************************************************************
 | Groups
********************************************************************/

Parse.Cloud.define("createGroup", controllers.groups.createGroup);
Parse.Cloud.define("getStatisticsForGroup", controllers.groups.getStatisticsForGroup);
Parse.Cloud.define("getGroupPicturesForGroupLayerIds", controllers.groups.getGroupPicturesForGroupLayerIds);
Parse.Cloud.define("updateGroupPictureForGroupLayerId", controllers.groups.updateGroupPictureForGroupLayerId);
Parse.Cloud.define("sendAdminMessageToGroup", controllers.groups.sendAdminMessageToGroup);

/********************************************************************
 | Bets
********************************************************************/

Parse.Cloud.define("createFootballGameBetV2", controllers.bets.createFootballGameBet);
Parse.Cloud.define("addGuessToFootballGameBetV2", controllers.bets.addGuessToFootballGameBet);
Parse.Cloud.define("getGroupOpenBets", controllers.bets.getGroupOpenBets);
Parse.Cloud.define("getLastBetForGroup", controllers.bets.getLastBetForGroup);


/********************************************************************
 | Games
********************************************************************/

Parse.Cloud.define("updateComingGames", controllers.games.updateComingGames);
Parse.Cloud.define("updateLiveScores", controllers.games.updateLiveScores);
Parse.Cloud.define("getLBFootballMatches", controllers.games.getLBFootballMatches);


/********************************************************************
 | Other
********************************************************************/


