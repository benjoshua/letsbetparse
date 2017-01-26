var utils = global.utils;
var constants = global.constants;

var Group = global.models.group;
var User = global.models.user;

module.exports = {
    /**
     * creates group and sends initial message to group
     * @param request
     * @param response
     */
    createGroup: function(request, response) {
        var groupLayerId = request.params.layerGroupId;
        var groupAdminLayerId = request.params.groupAdminLayerId;
        var picture = request.params.picture;

        // query, check if group exists
        var query = Group.query();
        query.equalTo("layerGroupId",groupLayerId);
        query.first({
            success: function(group) {
                // check existence
                if (group != undefined && group != null) {
                    // group exists
                    utils.logger.logError("[createGroup] errorGroupAlreadyExists");
                    response.error("errorGroupAlreadyExists");
                    return;
                }

                // new group

                // create
                var newGroup = Group.create(groupLayerId, groupAdminLayerId, picture);

                // save and send initial message to group
                newGroup.save(null,{
                    success:function(newGroupSuccess) {
                        utils.logger.logOk("[createGroup] group created");

                        // query, get group admin user object by id
                        var userQuery = User.query();
                        userQuery.equalTo("layerIdentityToken", groupAdminLayerId);
                        userQuery.first({
                            success: function(user) {
                                utils.layer.sendAdminMsgToGroup(groupLayerId, "New Group by " + user.get("name") + "... Lets Play!", {});
                                response.success(true);
                            },
                            error:function(bet, error) {
                                var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
                                utils.logger.logError("[createGroup]", str); // Logs output to dev tools console.
                                response.error(error);
                            }
                        });
                    },
                    error:function(newGroupError, error) {
                        utils.logger.logError("[createGroup] error creating new group in db: " + error);
                        var str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
                        utils.logger.logError("[createGroup]", str); // Logs output to dev tools console.
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
     * returns statistics for group
     * @param request
     * @param response
     */
    getStatisticsForGroup: function(request, response) {
        var groupLayerId = request.params.groupLayerId;

        // query, get group by id
        var query = Group.query();
        query.equalTo("layerGroupId",groupLayerId);
        query.first({
            success: function(group) {
                // validate
                if ((group == undefined) || (group == null)) {
                    response.error("group wasn't found");
                    return;
                }

                // get stats
                var stats = group.get("statistics");

                // sort
                var result = [];
                var len = Object.keys(stats).length;
                for (var i = 0; i < len; i++) {
                    var bestUserIdSoFar = "";
                    var bestPointsSoFar = -1;
                    for (var userId in stats) {
                        if ((stats.hasOwnProperty(userId)) && (stats[userId] != undefined)) {
                            var userStats = stats[userId];
                            var userPoints = userStats["points"];
                            if (userPoints > bestPointsSoFar){
                                bestUserIdSoFar = userId;
                                bestPointsSoFar = userPoints;
                            }

                        }
                    }
                    stats[bestUserIdSoFar]["userId"] = bestUserIdSoFar;
                    result.push(stats[bestUserIdSoFar]);
                    stats[bestUserIdSoFar] = undefined;
                }

                response.success(result);
            },
            error: function(error) {
                response.error(error);
            }
        });
    },
    /**
     * returns group avatars for each group id in given array
     * @param request
     * @param response
     */
    getGroupPicturesForGroupLayerIds: function(request, response) {
        var groupLayerIdsArray = request.params.groupLayerIdsArray;
        // query, get pictures for group ids in array
        var query = Group.query();
        query.containedIn("layerGroupId",groupLayerIdsArray);
        query.select("layerGroupId", "picture");
        query.find({
            success: function(results) {
                response.success(results);
            },
            error: function(error) {
                response.error(error);
            }
        });
    },
    /**
     * sets new avatar to group by id
     * @param request
     * @param response
     */
    updateGroupPictureForGroupLayerId: function(request, response) {
        var groupLayerId = request.params.groupLayerId;
        var picture = request.params.picture;

        // query, set group picture by id
        var query = Group.query();
        query.equalTo("layerGroupId",groupLayerId);
        query.first({
            success: function(group) {
                group.set("picture", picture);
                group.save(null,{
                    success:function(groupSuccess) {
                        // utils.layer.sendAdminMsgToGroup(groupLayerId, "Group info changed", {});
                        response.success("success: picture changed");
                    },
                    error:function(groupError, error) {
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
     * sends admin (system) message to group
     * @param request
     * @param response
     */
    sendAdminMessageToGroup: function(request, response) {
        var groupLayerId = request.params.groupLayerId;
        var senderLayerId = request.params.senderLayerId;
        var message = request.params.message;

        utils.logger.logInfo("[sendAdminMessageToGroup]", senderLayerId + " asked to send '" + message + "' to group " + groupLayerId);
        utils.layer.sendAdminMsgToGroup(groupLayerId, message, {});
    }
};