var Promise = require('es6-promise').Promise;
var path = require('path');
var fs = require('fs');
var colors = require('colors');
var spawn = require('child_process').spawn;
var tools = require('./tools');

var myBuildPromise = null;

module.exports = function BuildAsPromise (pathToApp, timeout) {

  var pathToSmartJson = path.join(pathToApp, 'smart.json');
  var pathToMongoLock = path.join(pathToApp, '.meteor', 'local', 'db', 'mongod.lock');
  var pathToMain      = path.join(pathToApp, '.meteor', 'local', 'build', 'main.js');

  if (fs.existsSync(pathToMongoLock) && fs.readFileSync(pathToMongoLock).toString('utf8')) {
    if (fs.existsSync(pathToMain)) {
      return Promise.resolve(pathToMain);
    } else {
      return Promise.reject(new Error('The meteor build does not seem to exist even though the meteor is running.'));
    }
  }

  if (myBuildPromise) return myBuildPromise;

  var env = Object.create(process.env);
  var port = 4000 + Math.floor(Math.random() * 1000);

  // we don't want to have a real database here, just want the build process to finish
  env.MONGO_URL = 'mongodb://localhost:' + port + '/there_should_be_no_database_on_this_port';

  function buildPromiseFuncion(resolve, reject) {
    
    var meteor = spawn('meteor', [
      '--production',
      '--port', port
    ], { cwd: pathToApp, env: env });

    var lastError = '';
    var lastErrorAt = 'nowhere';
    //----------------------------------------
    meteor.stdout.on('data', function (data) {

      //process.stdout.write(data);

      [
        {
          regExp: /App running at:/,
          action: function () {
            meteor.once('exit', function () {
              if (fs.existsSync(pathToMain)) {
                resolve(pathToMain);
              } else {
                reject(new Error('Meteor build failed.'));
              }
            });
            meteor.kill('SIGINT');
          }
        },

        {
          regExp: /Error\:\s*(.*)/,
          action: function (match) {
            lastError   = match[1];
            lastErrorAt = '';
          },
        },

        {
          regExp: /at\s.*/,
          action: function (match) {
            if (!lastErrorAt) {
              lastErrorAt = match[0];
            }
          },
        },

        {
          regExp: /Exited with code:/,
          action: function () {
            if (lastError) {
              reject(new Error(lastError.red + ' => '.magenta + lastErrorAt.magenta));
            } else {
              reject(new Error('Your app does not compile, but I do not know the reason.'));
            }
          },
        },

      ].forEach(function (options) {

        var match = options.regExp.exec(data.toString());
        if (match) {
          options.action.call(null, match);
          return true;
        }

      });
    });

    meteor.stdout.on('error', function (data) {
      console.log(data.toString().red);
    });

    setTimeout(function () {
      meteor.once('exit', function () {
        reject(new Error('Failed to start meteor.'));
      });
      meteor.kill('SIGINT')
    }, timeout || 60000);

  }

  if (fs.existsSync(pathToSmartJson)) {
    myBuildPromise = tools.smartPackagesAsPromise(pathToApp).then(function () {
      return new Promise(buildPromiseFuncion);
    });
  } else {
    myBuildPromise = new Promise(buildPromiseFuncion);
  }

  return myBuildPromise;
};