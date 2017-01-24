module.exports = {
    name: '',
    modelClass: null,
    init: function(name){
        this.name = name;
        this.modelClass = Parse.Object.extend(name);
    },
    query: function(){
        return new Parse.Query(this.modelClass);
    },
    queryCallbacks: function(success, error){
        return {
            success: function(model){
                if (model == undefined || model == null) {
                    return success(null);
                }
                return success(model);
            },
            error: function(err){
                return error(err);
            }
        };
    },
    newInstance: function(){
        return new this.modelClass();
    }
};