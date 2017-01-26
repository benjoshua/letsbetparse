module.exports = {
    name: 'LBGroup',
    modelClass: Parse.Object.extend('LBGroup'),
    query: function(){
        return new Parse.Query(this.modelClass);
    },
    newInstance: function(){
        return new this.modelClass();
    },
    create: function(groupLayerId, groupAdminLayerId, picture){
        var group = this.newInstance();

        var stats = {};
        stats[groupAdminLayerId] = {"bullseye":0,"almost":0,"lost":0,"points":0};
        group.set("statistics",stats);
        group.set("layerGroupId",groupLayerId);
        group.set("groupAdminLayerId",groupAdminLayerId);
        group.set("lastBetId","");
        group.set("lastBetType","");
        group.set("picture",picture);

        return group;
    }
};