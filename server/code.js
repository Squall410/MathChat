DEBUG = true;

if (DEBUG !== true) {
	console = {};
	console.log = function(){};
	console.dir = function(){};
}

var chatBase = {
	socket: null
};
chatBase.connect = function() {
	// Get the name the user entered
	var nameField = $("#name_input :input[name='username']");
	chatBase.username = nameField.val();
	console.dir(chatBase.username);
	
	// If we have a blank user name, then give an error.
	if (chatBase.username === null || chatBase.username === '') {
		$("#message_text").html("You cannot enter a blank user name. Please try again.");
		return;
	}
	
	// Make sure to clean up any socket we might still have around
	if ( (typeof chatBase.socket !== "undefined") && (chatBase.socket !== null) ) {
		delete chatBase.socket;
	}
	
	// Stop access to this until we finish processing
	nameField.prop("disabled", true);
	nameField.val("");
	
	// Otherwise, log into the system
	chatBase.socket = io.connect('http://localhost:8335', {'force new connection': true} );
	chatBase.socket.on('connect', chatBase.onConnect);
	// These are for handling connection error cases.
	chatBase.socket.on('connect_failed', chatBase.handleError);
	chatBase.socket.on('disconnect', chatBase.handleError);
	chatBase.socket.on('error', chatBase.handleError);
};

chatBase.onConnect = function() {
	// If we connect, stop listening for it
	chatBase.socket.removeListener('connect', chatBase.onConnect);
	
	// Setup the functional listeners
	chatBase.socket.on('welcome', chatBase.onWelcome);
	chatBase.socket.on('userUpdate', chatBase.onUserUpdate);
	chatBase.socket.on('receivedAnswer', chatBase.onReceivedAnswer);
	chatBase.socket.on('newQuestion', chatBase.onNewQuestion);
	chatBase.socket.on('answerFound', chatBase.onAnswerFound);
	
	// Tell the server our name
	chatBase.socket.emit('newuser', { name: chatBase.username });
	chatBase.username = null;
};

chatBase.onWelcome = function(data) {
	// data:Object
	// -- user:Object = The user you just created.
	console.log("onWelcome: " + data);
	
	// Switch to a 'chatroom'
	$("#welcome").css("display", "none");
	$("#chatroom").css("display", "block");
	
	// Clear any previous input
	$("#q_input :input[name='answer']").val("");
	
	// Update the user's name
	$("#display_name").html( "User: " + data.user.name );
};

chatBase.onUserUpdate = function(data) {
	// data:Object
	// -- userlist:String = HTML of connected users
	console.log("onUserUpdate: " + data);
	$("#user_list").html( "Users:<br/>" + data.userlist );
};

chatBase.onReceivedAnswer = function(data) {
	// Re-enable answering if the server says they heard us.
	$("#q_input :input[name='answer']").prop("disabled", false);
};

chatBase.onNewQuestion = function(data) {
	// { name: currentQ.name, q: currentQ.q }
	$("#question_header").html( "Question: " + data.name );
	$("#question").html( data.q );
	
	var answerField = $("#q_input :input[name='answer']");
	answerField.prop("disabled", false);
	answerField.val("");
};

chatBase.submitAnswer = function() {
	console.log( "Submitting an answer." );
	
	var answerField = $("#q_input :input[name='answer']");
	var attempt = answerField.val();
	answerField.val("");
	
	// If we have a blank answer, don't bother telling the server
	if (attempt === null || attempt === '') {
		return;
	}
	
	answerField.prop("disabled", true);
	chatBase.socket.emit('submitAnswer', { answer: attempt });
};

chatBase.onAnswerFound = function(data) {
	// data:Object
	//	- answer:String = the correct answer
	//	- name:String = the user name of the person who answered correctly
	//	- value:int = the value of the question they just answered
	var answerField = $("#q_input :input[name='answer']");
	answerField.prop("disabled", true);
	answerField.val("");
	$("#correct_user").html( "Correct answer of " + data.answer + " given by " + data.name + " for " + data.value + " points!" );
	$("#question_header").html( "Question: " );
	$("#question").html( "Loading..." );
};

chatBase.handleError = function() {
	console.log( "Got an error" );
	chatBase.socket.removeListener('connect', chatBase.onConnect);
	chatBase.socket.removeListener('welcome', chatBase.onWelcome);
	chatBase.socket.removeListener('userUpdate', chatBase.onUserUpdate);
	chatBase.socket.removeListener('receivedAnswer', chatBase.onReceivedAnswer);
	chatBase.socket.removeListener('newQuestion', chatBase.onNewQuestion);
	chatBase.socket.removeListener('answerFound', chatBase.onAnswerFound);
	chatBase.socket.removeListener('connect_failed', chatBase.handleError);
	chatBase.socket.removeListener('disconnect', chatBase.handleError);
	chatBase.socket.removeListener('error', chatBase.handleError);
	
	chatBase.socket.disconnect();
	delete chatBase.socket;
	chatBase.socket = null;
	$("#welcome").css("display", "block");
	$("#chatroom").css("display", "none");
	
	var nameField = $("#name_input :input[name='username']");
	nameField.prop("disabled", false);
	
	$("#message_text").html("Connection error. Please reload or try again.");
};

window.onload = function() {
	// Show the welcome screen by default
	$("#welcome").css("display", "block");
};