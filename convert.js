/**
 * Created by Shravan Shetty on 07-10-15.
 */
var fs = require('fs'),
	path = require("path"),
	mongo = require('mongodb').MongoClient,
	Promise = require('bluebird');

//mongo db connections
var dbParams = {
	"class": "com.almende.eve.state.mongo.MongoStateBuilder",
	"host": "localhost",
	"port": 27017,
	"database": "askpack-script"
};
var eveAgentsPath = "./eve-agents";
var eveSchedulerPath = "./eve-scheduler";
var agentDbCollection = "agents",
	schedulerDbCollection = "scheduler";

mongo.connect("mongodb://" + dbParams.host + ":" + dbParams.port + "/" + dbParams.database, function(err, database) {
	if (err) {
		console.log("Mongo Connection failed!. Error: " + err);
		return;
	}
	convertAll(database).then(function(result) {
		database.close();
		process.exit();
	}).error(function(err) {
		console.log('Error while converting.. ' + err);
	});
});

//lets read all the agents in the file system
var convertAll = function(db) {

	return new Promise(function(resolve, reject) {
		convertFilesInDir(db, agentDbCollection, eveAgentsPath).then(function(promisedResult) {
			console.log("Following agent files are inserted: " + JSON.stringify(promisedResult.result));
			console.log("Total agent data saved in mongoDB: " + promisedResult.count);

			convertFilesInDir(db, schedulerDbCollection, eveSchedulerPath).then(function(promisedResult) {
				console.log("Following scheduler files are inserted: " + JSON.stringify(promisedResult.result));
				console.log("Total scheduler data saved in mongoDB: " + promisedResult.count);
				resolve(promisedResult);
			}).error(function(err) {
				console.log(err);
				reject(err);
			});
		}).error(function(err) {
			console.log(err);
			reject(err);
		});
	});
}

var convertFilesInDir = function(db, collection, dirPath) {
	var promisedResult = {};
	return new Promise(function(resolve, reject) {
		fs.readdir(dirPath, function(err, files) {
			if (err) {
				reject(err);
			}
			var count = 0;
			var allFiles = [];
			if (files.length == 0) {
				promisedResult["count"] = count;
				promisedResult["result"] = allFiles;
				resolve(promisedResult);
			} else {
				files.forEach(function(file) {
					fs.readFile(dirPath + "/" + file, 'utf-8', function(err, json) {
						if (err) {
							reject(err);
						} else {
							var agentMongoData = {};
							//initialize the agentMongoData
							agentMongoData["timestamp"] = new Date().getTime();
							agentMongoData["_id"] = file;
							dbParams["id"] = file;
							dbParams["collection"] = collection;
							agentMongoData["myParams"] = dbParams;
							if (json.trim().length == 0) {
								json = "{}";
							}
							agentMongoData["properties"] = JSON.parse(json);
							//write agentMongoData to db
							insertToMongo(db, collection, agentMongoData).then(function(result) {
								allFiles[count] = file;
								if (++count == files.length) {
									promisedResult["count"] = count;
									promisedResult["result"] = allFiles;
									resolve(promisedResult);
								}
							}).error(function(err) {
								//check if the json entity is returned back
								if (err._id) {
									insertToMongo(db, collection, err).then(function(result) {
										console.log('Succesfully updated...');
										allFiles[count] = file;
										if (++count == files.length) {
											promisedResult["count"] = count;
											promisedResult["result"] = allFiles;
											resolve(promisedResult);
										}
									}).error(function(err) {
										console.log('Something really went wrong! Error: ' + JSON.stringify(err));
										reject(err);
									})
								} else {
									console.log('Something really went wrong! Error: ' + JSON.stringify(err));
									reject(err);
								}
							});
						}
					});
				});
			}
		});
	});
}

var insertToMongo = function(db, collection, agentMongoData) {
	return new Promise(function(resolve, reject) {
		var dbCollection = db.collection(collection);
		dbCollection.insert(agentMongoData, function(err, result) {
			if (err) {
				console.log('Error: ' + JSON.stringify(err) + ' in file: ' + agentMongoData._id + '. Trying to replace by unicode equivalent \\uff0e');
				//replace all keys that has . in them with its unicode equivalent
				if (err.message.indexOf('must not contain \'.\'') != -1) {
					var agentMongoProperties = agentMongoData["properties"];
					var propertyKeys = [];
					traverse(agentMongoProperties, propertyKeys);
					for (var count = 0; count < propertyKeys.length; count++) {
						var dotReplacedKey = propertyKeys[count].replace('.', '\\uff0e');
						agentMongoData["properties"] = JSON.parse(JSON.stringify(agentMongoData["properties"]).replace(propertyKeys[count], dotReplacedKey));
					}
					reject(agentMongoData);
				} else {
					reject(err);
				}
			} else {
				resolve(result);
			}
		});
	});
}

var traverse = function(jsonObj, keys) {
	if (jsonObj && typeof jsonObj == "object") {
		var jsonKeys = Object.keys(jsonObj);
		jsonKeys.forEach(function(key) {
			if (key) {
				// k is either an array index or object key
				keys.push(key);
				var traversedKeys = traverse(jsonObj[key], keys);
				if (traversedKeys && traversedKeys.length != 0) {
					keys.push(traversedKeys);
					return;
				}
			}
		});
	}
}