var utils = global.utils;

/**
 * DB Scripts
 */
var dbScripts = {
    migrateUsersToCoins: function(){
        utils.logger.logMethod('[migrateUsersToCoins] start');
        // [query class]
        var LBUserClass = Parse.Object.extend("LBUser");
        var query = new Parse.Query(LBUserClass);
        // [query conditions]
        query.doesNotExist("totalCoins");
        // [query run]
        query.find({
            success: function(users) {
                utils.logger.logInfo('[migrateUsersToCoins] got ' + users.length +' users');
                for (var i in users){
                    var user = users[i];
                    var total = user.get("totalCoins");
                    var available = user.get("availableCoins");
                    if (total == undefined || total == null || available == undefined || available == null) {
                        utils.logger.logInfo('[migrateUsersToCoins] migrating user:', user.get("layerIdentityToken"));
                        user.set("totalCoins",constants.coins.initialAmount);
                        user.set("availableCoins",constants.coins.initialAmount);
                        user.set("nextBonusTime", getNextPeriodicBonusTime());
                        user.save();
                    }
                }
                utils.logger.logMethod('[migrateUsersToCoins] done');
            },
            error:function(error) {
                utils.logger.logError('[migrateUsersToCoins] query error:', error);
            }
        });
    }
};

module.exports = dbScripts;