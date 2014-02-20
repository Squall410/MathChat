var app = require('http').createServer(httpHandler);	// The http server
var io = require('socket.io').listen(app);				// The socket.io reference
var path = require('path');								// Helps with file paths
var fs = require('fs');									// The filesystem reference
var questionFile = require('./questions.json');
var hatFile = require('./hats.json');

app.listen(8335);

var DEBUG = true;

if (DEBUG !== true) {
	console = {};
	console.log = function(){};
	console.dir = function(){};
	io.enable('browser client minification');  // Send minified client
	io.enable('browser client etag');          // Apply etag caching logic based on version number
	io.set('log level', 1);
}

function httpHandler(req, res) {
	var fileName = path.basename(req.url); //the file that was requested
	console.log( "filename: " + fileName );
	fs.exists(fileName, function (exists) {
		// We want to default things to load the index file if they ask for weird stuff.
		if (!exists) {
			fileName = __dirname + '/index.html';
		}
		fs.readFile(fileName, function(err, contents){
			if(!err){
				//send the contents of index.html
				//and then close the request
				res.writeHead(200);
				return res.end(contents);
			}
			else {
				// Otherwise, let us inspect the error
				console.dir(err);
				res.writeHead(404, {'Content-Type': 'text/html'});
				return res.end('<h1>Sorry, the page you are looking for cannot be found.</h1>');
			};
		});
	});
};

// THIS FUNCTION CREATES EVERYTHING THAT WE DO!
var serverStart = function() {
	// Prime the question system
	getNewQuestion();
	
	// Prime the hat data system
	primeHatRack();
	
	// NOTE:: (JCW) Set the SocketIO listeners to know when a user connects
	// 			This fires for 'reconnect' events as well.
	// TODO:: HANDLE RECONNECT EVENTS (have a timeout on disconnect before you remove a user.)
	io.sockets.on('connection', function (socket) {
		socket.on('newuser', function (data) {
			console.log('newuser');
			console.log(data);
			
			var newUser = createNewUser(data, socket);
			socket.on('requestUpdate', function() {
				var htmlList = askForUserUpdate();
				socket.emit("userUpdate", { userlist: htmlList });
				
			});
			socket.on('disconnect', function () {
				// TODO:: Use a timeout before removal. If the user connects again in that time, keep them alive.
				removeUser( newUser );
				userLeftRoom( newUser );
			});
			socket.on('submitAnswer', function(data) {
				// data:Object
				//	- answer:String = The answer the user is trying to compare
				console.log( data );
				
				socket.emit('receivedAnswer', {});
				if (currentQ != null && fetchingAnswer === false) {
					processAnswerAttempt( data.answer, newUser );
				}
				
			});
			socket.on('attemptBuy', function() {
				processHatBuyAttempt( newUser );
			});
			socket.on('sendChat', function(data) {
				receivedChatText( newUser, data );
			});
			socket.emit('welcome', { user: newUser.getUserData() });
			userEnteredRoom( newUser );
			// If we have a question, send the Q part to the user
			if (currentQ != null) {
				socket.emit("newQuestion", { name: currentQ.name, q: currentQ.q });
			}
		});
	});
};

var userList = {};
var userCount = 0;
var questionList = [];
var fetchingAnswer = true;
var currentQ = null;
var hatList = null;

// BEGIN:: QUESTION FUNCTIONS
var getNewQuestion = function() {
	if ( (typeof questionFile === "undefined") || (questionFile === null) ) {
		throw new Error( "No questions file exists! Problem with server!" );
		return;
	}
	var qList = questionFile.list;
	if( Object.prototype.toString.call( qList ) !== '[object Array]' ) {
		throw new Error( "Questions file list does not exist! Problem with server!" );
		return;
	}
	if ( qList.length <= 0 ) {
		throw new Error( "Questions file list does not exist! Problem with server!" );
		return;
	}
	
	// If we have no question, grab one. If we alreay were on a question (and we just answered it) get the next one.
	// TODO:: (JCW) Track a history of the last N questions and don't let us repeat a question in that time.
	var qIndex = parseInt(Math.random() * qList.length);
	currentQ = qList[qIndex];
	
	if (currentQ == null || currentQ.name == null || currentQ.q == null) {
		throw new Error( "Malformed question! Problem with server!" );
		return;
	}
	
	io.sockets.emit("newQuestion", { name: currentQ.name, q: currentQ.q });
	fetchingAnswer = false;
};

var processAnswerAttempt = function(answer, theUser) {
	// If the answer is correct, you must award points to the user that submitted it.
	// Then refresh all users, invalidate the question they have, pick a new one, and then show it.
	
	// TODO:: Have the answer checking parse math operations and better check than a simple string compare
	var foundSolution = false;
	var iter = 0;
	var count = currentQ.a.length;
	for (iter = 0; iter < count; ++iter) {
		if (String(answer) == currentQ.a[iter]) {
			foundSolution = true;
		}
		
		if (foundSolution === true) {
			break;
		}
	}
	
	// Award the current player points if they answered correctly.
	if (foundSolution === true) {
		var addedPoints = (currentQ.val || 1);
		theUser.points += addedPoints;
		// Cap at 99 rupees, err, points.
		if (theUser.points > 99) {
			theUser.points = 99;
		}
		// Let everyone know the game is over, and get a new question!
		fetchingAnswer = true;
		currentQ = null;
		
		// Update the user that got the points. Maybe they can now buy a hat?
		if (theUser.socket != null) {
			theUser.socket.emit("hatUpdate", { user: theUser.getUserData() });
		}
		
		// Let everyone know that an answer was found!
		io.sockets.emit("answerFound", { name: theUser.name, answer: answer, value: addedPoints });
		
		// Update all the users to see who has what points.
		updateUsers();
		
		// Wait 2 seconds, and then get a new question for the players
		setTimeout(getNewQuestion, 2000);
	}
};
// END:: QUESTION FUNCTIONS

// BEGIN:: HAT FUNCTIONS
var primeHatRack = function() {
	if ( (typeof hatFile === "undefined") || (hatFile === null) ) {
		throw new Error( "No hat data file exists! Problem with server!" );
		return;
	}
	hatList = hatFile.list;
	if( Object.prototype.toString.call( hatList ) !== '[object Array]' ) {
		throw new Error( "Hat data file list does not exist! Problem with server!" );
		return;
	}
	if ( hatList.length <= 0 ) {
		throw new Error( "Hat data file list does not exist! Problem with server!" );
		return;
	}
	
	// Sort the list by decreasing cost in case it isn't already done so.
	hatList.sort( function(a, b) {
		return (a.cost || 0) - (b.cost || 0);
	})
};

var getHatNameByID = function(hatID) {
	if (hatID == null || hatID == "") {
		return null;
	}
	
	var hatIter = 0;
	var hatCount = hatList.length;
	var checkedHat = null;
	for (; hatIter < hatCount; ++hatIter) {
		checkedHat = hatList[hatIter];
		if (checkedHat != null && hatID == checkedHat.id) {
			return checkedHat.name;
		}
	}
	
	// This hat shouldn't be attainable
	return "unknown hat of unknowing.";
};

var processHatBuyAttempt = function(theUser) {
	// All players want hats, but we must determine if they can BUY a hat.
	// If a user has enough points to make a purchase, then award them the best hat they can get.
	
	var currentPoints = (theUser.points || 0);
	var currCost = 0;
	var newHat = null;
	
	// Hat's have the following format:
	// "id": "00004",
	// "name": "hat of math-ing.",
	// "cost": 40,
	// "requires": { "00003":1 }
	
	// NOTE:: WE APRIORI KNOW THE LIST IS SORTED IN REVERSE ORDER OF COST!
	var hatIter = 0;
	var hatCount = hatList.length;
	var checkedHat = null;
	for (; hatIter < hatCount; ++hatIter) {
		checkedHat = hatList[hatIter];
		if (checkedHat != null && currentPoints >= checkedHat.cost && theUser.hat != checkedHat.id) {
			// If we can afford the hat, then check if we meet the requirements it needs.
			if ( ( checkedHat.requires == null && theUser.hat == null ) ||
				 ( checkedHat.requires != null && checkedHat.requires[theUser.hat] != null ) ) {
				currCost = checkedHat.cost;
				newHat = checkedHat.id;
			}
		}
	}
	
	// If the user actually bought a hat, then make sure to emit that they did.
	if (newHat != null) {
		// Deduct the points they spent.
		theUser.points -= currCost;
		theUser.hat = newHat;
		
		if (theUser.socket != null) {
			theUser.socket.emit("hatUpdate", { user: theUser.getUserData() });
		}
		
		// Let everyone else know how awesome you are...
		updateUsers();
	}
};
// END:: HAT FUNCTIONS

// BEGIN:: USER FUNCTIONS
var createNewUser = function(inputData, socket) {
	// inputData:Object
	// - name:String
	console.log( "createNewUser: " + inputData.name );
	// Create an empty user
	var user = {
		name: inputData.name,
		points: 0,
		hat: null,
		socket: socket
	};
	user.getUserData = function() {
		return { name: this.name, points: this.points, hat: getHatNameByID(this.hat) };
	};
	
	// Verify if another user exists with that name.
	// If so, append an '_' and search again.
	// BB:: Could potentially make a really long insertion.
	// Maybe change to random integer appending? Real user creation?
	while( userList[user.name] != null ) {
		console.log( "check: " + userList[user.name] );
		user.name = (user.name + "_");
	}
	// Finally, place the user into the userList
	userList[user.name] = user;
	++userCount;
	console.log( "Created user with name: " + user.name );
	
	updateUsers();
	return user;
};

var removeUser = function(user) {
	if( userList[user.name] !== null ) {
		console.log( "Removed user: " + user.name );
		delete userList[user.name];
		--userCount;
		updateUsers();
		return;
	}
	throw new Error( "Failed to remove the user: " + user.name );
};

var askForUserUpdate = function() {
	var htmlList = '';
	var key = null;
	var tempUser = null;
	for ( key in userList ) {
		tempUser = userList[key];
		htmlList += tempUser.name;
		if (tempUser.hat !== null) {
			htmlList += ' <small>wearing</small> ' + getHatNameByID(tempUser.hat);
		}
		htmlList += ' <small>(' + tempUser.points + ' points)</small><br/>';
	}
	return htmlList;
};

var updateUsers = function() {
	console.log( "updateUsers count: " + userCount );
	var htmlList = askForUserUpdate();
	io.sockets.emit("userUpdate", { userlist: htmlList });
};
// END:: USER FUNCTIONS

// BEGIN:: CHAT FUNCTIONS
var receivedChatText = function( theUser, data ) {
	// theUser:Object = the user object, with name, points, etc.
	// data:Object
	// - text:String = The chat string that was just entered.
	console.log( "receivedChatText: " + data.text );
	
	// NOTE:: Should we filter curse words/log this?
	
	// Simply notify all the users of what was heard!
	var message = theUser.name + ": " + data.text;
	io.sockets.emit("chatUpdate", { newMessage: message });
}

var userEnteredRoom = function( theUser ) {
	// theUser:Object = the user object, with name, points, etc.
	
	var message = theUser.name + " entered the room."
	io.sockets.emit("chatUpdate", { newMessage: message });
};

var userLeftRoom = function( theUser ) {
	// theUser:Object = the user object, with name, points, etc.
	
	var message = theUser.name + " left the room."
	io.sockets.emit("chatUpdate", { newMessage: message });
};
// END:: CHAT FUNCTIONS

// MUST CALL THIS TO START THE WHOLE SYSTEM
serverStart();