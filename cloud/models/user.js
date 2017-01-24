module.exports = {
    name: 'LBUser',
    modelClass: Parse.Object.extend(this.name),
    query: function(){
        return new Parse.Query(this.modelClass);
    },
    newInstance: function(){
        return new this.modelClass();
    },
    create: function(phoneNumber, code){
        var user = this.newInstance();

        // identification
        user.set("phoneNumber",phoneNumber);
        user.set("loginCode",code);
        user.set("layerIdentityToken",global.utils.misc.generateUuid());

        // attributes
        user.set("name","");

        // bets
        user.set("betsWon",0);
        user.set("betsParticipated",0);

        // coins
        user.set("totalCoins",global.constants.coins.initialAmount);
        user.set("availableCoins",global.constants.coins.initialAmount);

        // next bonus time
        user.set("nextBonusTime", global.utils.datetime.getNextPeriodicBonusTime());

        return user;
    }
};