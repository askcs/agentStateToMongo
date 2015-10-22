/**
 * Created by Shravan Shetty on 07-10-15.
 */
var fs = require('fs'),
	path = require("path"),
	mongo = require('mongodb').MongoClient,
	Promise = require('bluebird');

//mongo db connections
function DBParams() {
	var dbParams = new Object();
	dbParams["class"] = "com.almende.eve.state.mongo.MongoStateBuilder";
	dbParams["host"] = "localhost";
	dbParams["port"] = 27017;
	dbParams["database"] = "askpack-script";
	return dbParams;
};

var eveAgentsPath = "./eve-agents/";
var eveSchedulerPath = "./eve-scheduler/";
var agentDbCollection = "agents",
	schedulerDbCollection = "scheduler",
	initServiceDbCollection = "initService",
	dbParams = new DBParams();

mongo.connect("mongodb://" + dbParams.host + ":" + dbParams.port + "/" + dbParams.database, function(err, database) {
	if (err) {
		console.log("Mongo Connection failed!. Error: " + err);
		return;
	}
	convertAll(database).then(function(result) {
		database.close();
	}).error(function(err) {
		database.close();
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
							var agentMongoDataParams = new DBParams();
							agentMongoDataParams["id"] = file;
							agentMongoDataParams["collection"] = collection;
							agentMongoData["myParams"] = agentMongoDataParams;
							if (json.trim().length == 0) {
								json = "{}";
							}
							var jsonObj = JSON.parse(json);
							//insert the data to the initService table
							if (collection == agentDbCollection && jsonObj["entry"]) {
								var entryParams = updateEntry(jsonObj["entry"], file);
								agentMongoData["properties"] = {};
								agentMongoData["properties"]["entry"] = entryParams;
								insertToMongo(db, initServiceDbCollection, agentMongoData).then(function(result) {}).error(function(err) {
									console.log('Not saved, Error result not in agent state format! Error: ' + JSON.stringify(err));
									reject(err);
								});
							}
							agentMongoData["properties"] = jsonObj;
							//update the params, scheduler and instantiation service in the entry key
							var entryData = agentMongoData["properties"]["entry"];
							agentMongoData["properties"]["entry"] = updateEntry(entryData, file);
							//write agentMongoData to db
							insertToMongo(db, collection, agentMongoData).then(function(result) {
								allFiles[count] = file;
								if (++count == files.length) {
									promisedResult["count"] = count;
									promisedResult["result"] = allFiles;
									resolve(promisedResult);
								}
							}).error(function(err) {
								console.log('Not saved, Error result not in agent state format! Error: ' + JSON.stringify(err));
								reject(err);
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
		agentMongoData["properties"] = JSON.stringify(agentMongoData["properties"]);
		dbCollection.insert(agentMongoData, function(err, result) {
			if (err) {
				//replace all keys that has . in them with its unicode equivalent
				if (err.message.indexOf('must not contain \'.\'') != -1) {
					console.log('Error: ' + JSON.stringify(err) + ' in file: ' + agentMongoData._id + '. Trying to replace by unicode equivalent \\uff0e');
					var propertyKeys = [];
					traverse(agentMongoData["properties"], propertyKeys);
					var agentMongoStringified = JSON.stringify(agentMongoData["properties"]);
					for (var count = 0; count < propertyKeys.length; count++) {
						var dotReplacedKey = propertyKeys[count].replace(/\./g, '\\uff0e').replace(/\$/g, '\\u0024');
						agentMongoStringified = agentMongoStringified.replace(propertyKeys[count], dotReplacedKey);
					}
					// agentMongoData["properties"] = JSON.parse(agentMongoStringified);
					agentMongoData["properties"] = agentMongoStringified;
					//try to insert the newly updated details
					dbCollection.insert(agentMongoData, function(err, result) {
						if (err) {
							console.log('Error converting id' + agentMongoData._id);
                            resolve(err);
						} else {
							resolve(result);
						}
					});
				} else {
					console.log('Error converting id' + agentMongoData._id);
                    resolve(err);
				}
			} else {
				resolve(result);
			}
		});
	});
}

// var traverse = function(jsonObj, keys) {
// 	if (jsonObj && typeof jsonObj == "object") {
// 		var jsonKeys = Object.keys(jsonObj);
// 		jsonKeys.forEach(function(key) {
// 			if (key) {
// 				// k is either an array index or object key
// 				keys.push(key);
// 				var traversedKeys = traverse(jsonObj[key], keys);
// 				if (traversedKeys && traversedKeys.length != 0) {
// 					keys.push(traversedKeys);
// 					return;
// 				}
// 			}
// 		});
// 	}
// }

var updateEntry = function(entryData, file) {
	if (entryData && entryData["params"]) {
		var entryDataParams = entryData["params"];
		if (entryDataParams["state"]) {
			var stateParams = new DBParams();
			stateParams["collection"] = agentDbCollection;
			stateParams["id"] = file;
			entryDataParams["state"] = stateParams;
		}
		if (entryDataParams["scheduler"]) {
			var stateParams = new DBParams();
			stateParams["collection"] = schedulerDbCollection;
			stateParams["id"] = "scheduler_" + file;
			entryDataParams["scheduler"]["state"] = stateParams;
		}
		if (entryDataParams["instantiationService"]) {
			var stateParams = new DBParams();
			stateParams["collection"] = initServiceDbCollection;
			stateParams["id"] = "InitService";
			entryDataParams["instantiationService"]["state"] = stateParams;
		}
		entryData["params"] = entryDataParams;
		return entryData;
	}
}