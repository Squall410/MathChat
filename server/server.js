var app = require('http').createServer(httpHandler);	// The http server
var io = require('socket.io').listen(app);				// The socket.io reference
var path = require('path');								// Helps with file paths
var fs = require('fs');									// The filesystem reference
var questionFile = require('./questions.json');
var hatFile = require('./hats.json');
var badgeFile = require('./badges.json');

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
	
	// Prime the badge data system
	primeBadgePack();
	
	// NOTE:: (JCW) Set the SocketIO listeners to know when a user connects
	// 			This fires for 'reconnect' events as well.
	// TODO:: HANDLE RECONNECT EVENTS (have a timeout on disconnect before you remove a user.)
	io.sockets.on('connection', function (socket) {
		socket.on('newuser', function (data) {
			console.log('newuser');
			console.log(data);
			
			var newUser = createNewUser(data, socket);
			updateAllUsers();
			sendTheWelcomeWagon( newUser );
		});
	});
};

var questionDelay = 1000;
var userList = {};
var userCount = 0;
var questionList = [];
var fetchingAnswer = true;
var currentQ = null;
var currentQueue = [];
var hatList = null;
var badgeList = null;

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
	var qIndex = 0;
	do {
		qIndex = parseInt(Math.random() * qList.length);
	}
	while (currentQueue.indexOf(qIndex) != -1);
	// Add it to the end, and remove the front if longer than 10 questions.
	currentQueue.push(qIndex);
	if (currentQueue.length >= 10) {
		currentQueue.shift();
	}
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
	var checkedAnswer = String(answer).toLowerCase();
	var foundSolution = false;
	var iter = 0;
	var count = currentQ.a.length;
	for (iter = 0; iter < count; ++iter) {
		var anAnswer = String(currentQ.a[iter]).toLowerCase();
		if (checkedAnswer == anAnswer) {
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
		
		// Updated stats mean we should check for new badges
		updateUserBadges( theUser );
		
		// Update the user that got the points. Maybe they can now buy a hat?
		if (theUser.socket != null) {
			theUser.socket.emit("hatUpdate", { user: theUser.getUserData() });
		}
		
		// Let everyone know that an answer was found!
		io.sockets.emit("answerFound", { name: theUser.name, answer: answer, value: addedPoints });
		
		// Update all the users to see who has what points.
		updateAllUsers();
		
		// Wait x milliseconds, and then get a new question for the players
		setTimeout(getNewQuestion, questionDelay);
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
	});
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
		updateAllUsers();
	}
};
// END:: HAT FUNCTIONS

// BEGIN:: USER FUNCTIONS
var createNewUser = function(inputData, socket) {
	// inputData:Object
	// - name:String
	// socket:socket.io socket
	if (inputData == null || socket == null) {
		return;
	}
	
	console.log( "createNewUser: " + inputData.name );
	// Create an empty user
	var user = {
		name: inputData.name,
		points: 0,
		chat: 0,
		hat: null,
		socket: socket,
		badges: [ ]
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
	
	// Setup the socket listeners
	socket.on('requestUpdate', function() {
		var htmlList = askForUserUpdate();
		socket.emit("userUpdate", { userlist: htmlList });
		
	});
	socket.on('disconnect', function () {
		// TODO:: Use a timeout before removal. If the user connects again in that time, keep them alive.
		removeUser( user );
		userLeftRoom( user );
	});
	socket.on('submitAnswer', function(data) {
		// data:Object
		//	- answer:String = The answer the user is trying to compare
		console.log( data );
		
		socket.emit('receivedAnswer', {});
		if (currentQ != null && fetchingAnswer === false) {
			processAnswerAttempt( data.answer, user );
		}
		
	});
	socket.on('attemptBuy', function() {
		processHatBuyAttempt( user );
	});
	socket.on('sendChat', function(data) {
		receivedChatText( user, data );
	});
	
	return user;
};

var removeUser = function(user) {
	if( userList[user.name] !== null ) {
		console.log( "Removed user: " + user.name );
		delete userList[user.name];
		--userCount;
		updateAllUsers();
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
		htmlList += '(' + tempUser.points + ' pts)';
		if (tempUser.hat !== null) {
			htmlList += ' wearing ' + getHatNameByID(tempUser.hat);
		}
		htmlList += '\n';
	}
	return htmlList;
};

var updateAllUsers = function() {
	console.log( "updateAllUsers count: " + userCount );
	var htmlList = askForUserUpdate();
	io.sockets.emit("userUpdate", { userlist: htmlList });
};

var sendTheWelcomeWagon = function( theUser ) {
	theUser.socket.emit('welcome', { user: theUser.getUserData() });
	userEnteredRoom( theUser );
	sendUserBadges( theUser );
	// If we have a question, send the Q part to the user
	if (currentQ != null) {
		theUser.socket.emit("newQuestion", { name: currentQ.name, q: currentQ.q });
	}
}
// END:: USER FUNCTIONS

// BEGIN:: BADGE FUNCTIONS
var primeBadgePack = function() {
	if ( (typeof badgeFile === "undefined") || (badgeFile === null) ) {
		throw new Error( "No badge data file exists! Problem with server!" );
		return;
	}
	badgeList = badgeFile.list;
	if( Object.prototype.toString.call( badgeList ) !== '[object Array]' ) {
		throw new Error( "Badge data file list does not exist! Problem with server!" );
		return;
	}
	if ( badgeList.length <= 0 ) {
		throw new Error( "Badge data file list does not exist! Problem with server!" );
		return;
	}
	
	// If we need to do other badge processing, it should go here.
};

var getBadgeByID = function(badgeID) {
	if (badgeID == null || badgeID == "") {
		return null;
	}
	
	var badgeIter = 0;
	var badgeCount = badgeList.length;
	var checkedBadge = null;
	for (; badgeIter < badgeCount; ++badgeIter) {
		checkedBadge = badgeList[badgeIter];
		if (checkedBadge != null && badgeID == checkedBadge.id) {
			return checkedBadge;
		}
	}
	
	// This badge doesn't exist!
	return null;
};

var getBadgeNameByID = function(badgeID) {
	if (badgeID == null || badgeID == "") {
		return null;
	}
	
	var badgeIter = 0;
	var badgeCount = badgeList.length;
	var checkedBadge = null;
	for (; badgeIter < badgeCount; ++badgeIter) {
		checkedBadge = badgeList[badgeIter];
		if (checkedBadge != null && badgeID == checkedBadge.id) {
			return checkedBadge.name;
		}
	}
	
	// This badge shouldn't be attainable
	return "unknown badge";
};

var getFormattedBadgeByID = function(badgeID) {
	if (badgeID == null || badgeID == "") {
		return null;
	}
	
	var badgeIter = 0;
	var badgeCount = badgeList.length;
	var checkedBadge = null;
	for (; badgeIter < badgeCount; ++badgeIter) {
		checkedBadge = badgeList[badgeIter];
		if (checkedBadge != null && badgeID == checkedBadge.id) {
			return "<td bgcolor='"+checkedBadge.color+"' title='"+checkedBadge.name+"'>&nbsp;</td>";
		}
	}
	
	// This badge shouldn't be attainable
	return "";
};

var updateUserBadges = function( theUser ) {
	var newBadgeAqcuired = false;
	
	// Look at our points/xp and chat and see what happens.
	// TODO::
	
	// If the user has updated badge credentials, let them know!
	if (newBadgeAqcuired == true) {
		sendUserBadges( theUser );
	}
};

var sendUserBadges = function( theUser ) {
	// Grab all user badge information, and format into an HTML blob
	if (theUser.badges == null || theUser.badges.length == 0) {
		return;
	}
	
	var htmlTable = "";
	
	htmlTable += "<caption>Badges</caption>";
	
	//theUser.badges: []
	var badgeTotal = 0;
	var badgeIter = 0;
	var badgeCount = theUser.badges.length;
	var badgeID = 0;
	var tempBadge = null;
	var columns = 5;
	htmlTable += "<tr>";
	for (; badgeIter < badgeCount; ++badgeIter) {
		badgeID = theUser.badges[badgeIter];
		tempBadge = getBadgeByID(badgeID);
		if (tempBadge != null) {
			++badgeTotal
			htmlTable += "<td bgcolor='"+tempBadge.color+"' title='"+tempBadge.name+"'>&nbsp;</td>";
			if (badgeTotal % (columns) == 0) {
				if (badgeCount != badgeTotal) {
					htmlTable += "</tr>";
					htmlTable += "<tr>";
				}
			}
		}
	}
	htmlTable += "</tr>";
	
	// Then, send that blob to that user
	if (theUser.socket != null) {
		console.log( "attmpting to emit badge update" );
		theUser.socket.emit("badgeUpdate", { badgeList: htmlTable });
	}
};
// END:: BADGE FUNCTIONS

// BEGIN:: CHAT FUNCTIONS
var receivedChatText = function( theUser, data ) {
	// theUser:Object = the user object, with name, points, etc.
	// data:Object
	// - text:String = The chat string that was just entered.
	console.log( "receivedChatText: " + data.text );
	
	// Update the users' chat values
	theUser.chat = (theUser.chat || 0) + 1;
	
	// Updated stats mean we should check for new badges
	updateUserBadges( theUser );
	
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