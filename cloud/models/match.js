module.exports = {
    name: 'LBFootballMatch',
    modelClass: Parse.Object.extend(this.name),
    query: function(){
        return new Parse.Query(this.modelClass);
    },
    newInstance: function(){
        return new this.modelClass();
    },
    create: function(matchId){
        var match = this.newInstance();

        match.set("matchId",matchId);
        match.set("time","Not Started");
        match.set("homeGoals",0);
        match.set("awayGoals",0);
        match.set("active", 'true');

        return match;
    }
};