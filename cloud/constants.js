/**
 * consts
 */
var constants = {
    leaguesId: ["1","4","5","7","8","16","56"],
    leaguesDic: {
        "English Premier League":1,
        "Bundesliga":4,
        "Serie A":5,
        "Ligue 1":7,
        "La Liga":8,
        "Champions League":16,
        "EURO 2016":56
    },
    coins: {
        initialAmount: 10000,
        periodicBonusAmount: 2000,
        periodicBonusIntervalInDays: 7 // 1 week
    },
    scheduleIntervals: {
        liveUpdate: 30 /*sec*/ * 1000,
        gamesUpdate: 24 /*hours*/ * 60 * 60 * 1000,
        coinsBonusUpdate: 24 /*hours*/ * 60 * 60 * 1000
    }
};

module.exports = constants;