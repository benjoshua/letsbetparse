// dev patch
// if ENV env var doesn't exist, load dev env vars
if (!process.env.ENV) {
    var devEnvVars = require('./dev.env.json');
    for (var key in devEnvVars) {
        console.log('Adding environment variable', key);
        process.env[key] = devEnvVars[key];
    }
}
// \dev patch

// Example express application adding the parse-server module to expose Parse
// compatible API routes.

var express = require('express');
var ParseServer = require('parse-server').ParseServer;

var databaseUri = process.env.MONGOLAB_URI;

if (!databaseUri) {
  console.log('DATABASE_URI not specified, falling back to localhost.');
}

var api = new ParseServer({
  databaseURI: databaseUri || 'mongodb://admin:tomyoav1708@ds055885.mongolab.com:55885/heroku_htf2c3kb',
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  appId: process.env.APP_ID,
  serverURL: process.env.SERVER_URL,
  masterKey: process.env.MASTER_KEY
});
// Client-keys like the javascript key or the .NET key are not necessary with parse-server
// If you wish you require them, you can set them as options in the initialization above:
// javascriptKey, restAPIKey, dotNetKey, clientKey

var app = express();

// Serve the Parse API on the /parse URL prefix
var mountPath = process.env.PARSE_MOUNT || '/parse';
app.use(mountPath, api);

app.use(express.static(__dirname + '/public'));

// Parse Server plays nicely with the rest of your web routes
app.get('/', function(req, res) {
  res.status(200).send('I dream of being a web site.');
});

var port = process.env.PORT || 1337;
app.listen(port, function() {
    console.log('LetsBet server running on port ' + port + '.');
});
