var app = require('http').createServer(httpHandler);	// The http server
var io = require('socket.io').listen(app);				// The socket.io reference
var path = require('path');								// Helps with file paths
var fs = require('fs');									// The filesystem reference
var questionFile = require('./questions.json');

app.listen(8335);

DEBUG = true;

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
	
	// NOTE:: (JCW) Set the SocketIO listeners to know when a user connects
	// 			This fires for 'reconnect' events as well.
	// TODO:: HANDLE RECONNECT EVENTS (have a timeout on disconnect before you remove a user.)
	io.sockets.on('connection', function (socket) {
		socket.on('newuser', function (data) {
			console.log('newuser');
			console.log(data);
			
			var userData = createNewUser(data);
			socket.on('requestUpdate', function() {
				var htmlList = askForUserUpdate();
				socket.emit("userUpdate", { userlist: htmlList });
				
			});
			socket.on('disconnect', function () {
				// TODO:: Use a timeout before removal. If the user connects again in that time, keep them alive.
				removeUser(userData);
			});
			socket.on('submitAnswer', function(data) {
				// data:Object
				//	- answer:String = The answer the user is trying to compare
				console.log( data );
				
				socket.emit('receivedAnswer', {});
				if (currentQ != null && fetchingAnswer === false) {
					processAnswerAttempt( data.answer, userData );
				}
				
			});
			socket.emit('welcome', { user: userData });
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

var processAnswerAttempt = function(answer, userData) {
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
		userData.points += addedPoints;
		// Let everyone know the game is over, and get a new question!
		fetchingAnswer = true;
		currentQ = null;
		io.sockets.emit("answerFound", { name: userData.name, answer: answer, value: addedPoints });
		updateUsers();
		
		// Wait 2 seconds, and then get a new question for the players
		setTimeout(getNewQuestion, 2000);
	}
};
// END:: QUESTION FUNCTIONS

// BEGIN:: USER FUNCTIONS
var createNewUser = function(inputData) {
	// inputData:Object
	// - name:String
	console.log( "createNewUser: " + inputData.name );
	// Create an empty user
	var user = {
		name: inputData.name,
		points: 0
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
		htmlList += tempUser.name + ' <small>(' + tempUser.points + ' points)</small><br/>';
	}
	return htmlList;
};

var updateUsers = function() {
	console.log( "updateUsers count: " + userCount );
	var htmlList = askForUserUpdate();
	io.sockets.emit("userUpdate", { userlist: htmlList });
};
// END:: USER FUNCTIONS

// MUST CALL THIS TO START THE WHOLE SYSTEM
serverStart();