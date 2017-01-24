var LayerAPI = require('layer-api');

/**
 * Utils
 */
var utils = {
    /**
     * logger
     */
    logger: {
        logColors: {"Black":"\x1b[30m", "Red":"\x1b[31m", "Green":"\x1b[32m", "Yellow":"\x1b[33m", "Blue":"\x1b[34m", "Magenta":"\x1b[35m", "Cyan":"\x1b[36m", "White":"\x1b[37m"},
        muteLog: false,
        _log: function() {
            var args = Array.prototype.slice.call(arguments);
            var color = args.shift();
            args = args[0];
            var logToWrite = args.map(function (arg) {
                var str;
                var argType = typeof arg;
        
                if (arg === null) {
                    str = 'null';
                } else if (arg === undefined) {
                    str = '';
                } else if (!arg.toString || arg.toString() === '[object Object]') {
                    str = '\n' + JSON.stringify(arg, null, '  ') + '\n';
                } else if (argType === 'string') {
                    str = arg;
                } else {
                    str = arg.toString();
                }
        
                return str;
            }).join(' ');
            console.log(color, logToWrite);
        },

        logOk: function() {
            if (!this.muteLog) _log(this.logColors["Green"], Array.prototype.slice.call(arguments));
        },
        logWarning: function() {
            if (!this.muteLog) _log(this.logColors["Yellow"], Array.prototype.slice.call(arguments));
        },
        logError: function() {
            if (!this.muteLog) _log(this.logColors["Red"], Array.prototype.slice.call(arguments));
        },
        log: function() {
            if (!this.muteLog) _log(this.logColors["White"], Array.prototype.slice.call(arguments));
        },
        logInfo: function(){
            if (!this.muteLog) _log(this.logColors["Blue"], Array.prototype.slice.call(arguments));
        },
        logMethod: function(){
            if (!this.muteLog) _log(this.logColors["Blue"], Array.prototype.slice.call(arguments));
        }
    },

    /**
     * Layer utils
     */
    layer: {
        ApiToken: process.env.LAYER_PLATFORM_API_TOKEN,
        AppUUID: process.env.LAYER_APP_UUID,
        layerApi: new LayerAPI({
            token: this.ApiToken,
            appId: this.AppUUID
        }),
        layerPlatformApiInfo: {
            config: {
                serverUrl: "https://api.layer.com/apps/" + this.AppUUID
            },
            headers: {
                Accept: "application/vnd.layer+json; version=1.0",
                Authorization: "Bearer " + this.ApiToken,
                "Content-type": "application/json"
            },
            patchHeaders: {
                Accept: "application/vnd.layer+json; version=1.0",
                Authorization: "Bearer " + this.ApiToken,
                "Content-type": "application/vnd.layer-patch+json"
            },
            cache: {
                newConversation: null,
                newMessage: null
            }
        },
        sendAdminMsgToGroup: function(groupLayerId, msg, dataDic) {
            utils.logger.logMethod("[sendAdminMsgToGroup] with msg:", msg, "sending to", groupLayerId);
            request({
                uri: this.layerPlatformApiInfo.config.serverUrl + "/conversations/" + groupLayerId + "/messages",
                method: "POST",
                body: {
                    sender: {name: "Admin"},
                    parts: [{body: msg, mime_type: "text/plain"}, {body: JSON.stringify(dataDic), mime_type: "text/javascript"}],
                    notification: {text: msg, data: dataDic}
                },
                json: true,
                headers: this.layerPlatformApiInfo.headers
            }, function(error, response, body) {

            });
        },
        sendAnnouncementToUser: function(userLayerId, msg, dataDic, dedupeId) {
            utils.logger.logMethod("[sendAnnouncementToUser] with msg:", msg, "sending to", userLayerId);
            // prepare payload
            var payload = {
                recipients: [userLayerId],
                sender: {
                    name: 'Lets Bet'
                },
                parts: [{body: msg, mime_type: "text/plain"}, {body: JSON.stringify(dataDic), mime_type: "text/javascript"}],
                notification: {text: msg, data: dataDic}
            };
            // prepare callback
            var callback = function(err, res) {
                if (err) return console.error(err);

                // announcement data
                // var announcement = res.body;
            };

            // send
            if (dedupeId)
                this.layerApi.announcements.sendDedupe(dedupeId, payload, callback);
            else
                this.layerApi.announcements.send(payload, callback);
        }
    },
    /**
     * date time
     */
    datetime: {
        formatDate: function(date) {
            //yyyy-mm-dd
            var d = new Date(date),
                month = '' + (d.getMonth() + 1),
                day = '' + d.getDate(),
                year = d.getFullYear();

            if (month.length < 2) month = '0' + month;
            if (day.length < 2) day = '0' + day;

            return [year, month, day].join('-');
        },
        getNowTime: function(){
            var now = new Date();
            now.setHours(0,0,0,0);
            return now.getTime();
        },
        getNextPeriodicBonusTime: function(){
            var next = new Date(this.getNowTime() + constants.coins.periodicBonusIntervalInDays * 24 * 60 * 60 * 1000);
            return next.getTime();
        }
    },

    /**
     * misc
     */
    misc: {
        generateUuid: function() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000)
                    .toString(16)
                    .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        }
    },
    /**
     * scheduler
     */
    scheduler: {
        scheduled: {},
        schedule: function(id, callback, interval, options){
            this.scheduled[id]=setInterval(callback, interval);
            options = options || {};
            if (options.callNow){
                if (options.callNowDelay)
                    setTimeout(callback, options.callNowDelay);
                else
                    callback();
            }
        }
    },

    /**
     * sms
     */
    sms: {
        client: require('twilio')(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        ),
        send: function(phoneNumber, body, successCB, errorCB) {
            client.sendSms({
                to: phoneNumber,
                from: '+972526282482',
                body: body
            }, function (err, responseData) {
                if (err) {
                    errorCB(err);
                } else {
                    successCB(responseData)
                }
            });
        }
    }
};

module.exports = utils;