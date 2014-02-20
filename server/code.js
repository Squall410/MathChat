var DEBUG = true;

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
	chatBase.socket.on('hatUpdate', chatBase.onHatUpdate);
	chatBase.socket.on('userUpdate', chatBase.onUserUpdate);
	chatBase.socket.on('receivedAnswer', chatBase.onReceivedAnswer);
	chatBase.socket.on('newQuestion', chatBase.onNewQuestion);
	chatBase.socket.on('answerFound', chatBase.onAnswerFound);
	chatBase.socket.on('chatUpdate', chatBase.onReceivedChatUpdate);
	
	// Tell the server our name
	chatBase.socket.emit('newuser', { name: chatBase.username });
	chatBase.username = null;
};

chatBase.onWelcome = function(data) {
	// data:Object
	// -- user:Object = The user you just created.
	//	  + name:String
	//	  + hat:String
	//	  + points:int
	console.log("onWelcome: " + data);
	
	// Switch to a 'chatroom'
	$("#welcome").css("display", "none");
	$("#chatroom").css("display", "block");
	
	// Clear any previous input
	$("#q_input :input[name='answer']").val("");
	
	// Update the user's name
	$("#display_name").html( "User: " + data.user.name );
	if ( data.user.hat != null ) {
		$("#display_hat").html( '<small>wearing</small> ' + data.user.hat );
	}
	
	chatBase.updateHatButton( data.user.points );
};

chatBase.updateHatButton = function(points) {
	points = (points || 0);
	
	// This is 5 just because we know the lowest value hat costs that much. Update if that changes.
	if (points < 5) {
		$("#hat_input").css("display", "none");
	}
	else {
		$("#hat_input").css("display", "block");
	}
};

chatBase.onHatUpdate = function(data) {
	// data:Object
	// -- user:Object = The user you just created.
	//	  + name:String
	//	  + hat:String
	//	  + points:int
	console.log("onHatUpdate: " + data);
	
	// Update the user's name
	$("#display_name").html( "User: " + data.user.name );
	if ( data.user.hat != null ) {
		$("#display_hat").html( '<small>wearing</small> ' + data.user.hat );
	}
	
	chatBase.updateHatButton( data.user.points );
}

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
	// data:Object
	// -- name:String = The name of the question
	// -- q:String = The question itself
	$("#question_header").html( "Question: " + data.name );
	$("#question").html( data.q );
	
	var answerField = $("#q_input :input[name='answer']");
	answerField.prop("disabled", false);
	answerField.val("");
};

chatBase.onReceivedChatUpdate = function(data) {
	// data:Object
	// - newMessage:String = The message we just got.
	var chatWindow = $("#chat_window");
	
	// Add the new text to the textbox, and scroll properly.
	var oldChatData = chatWindow.val();
	if (oldChatData !== "") {
		oldChatData += "\n";
	}
	oldChatData += data.newMessage;
	chatWindow.val(oldChatData);
	chatWindow.scrollTop( chatWindow.prop("scrollHeight") );
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
chatBase.attemptBuy = function() {
	console.log( "Attempting to buy a hat!" );
	
	// This tells the server to try and buy a fancy hat. If we don't have enough points, then don't allow it.
	
	chatBase.socket.emit('attemptBuy', null);
};

chatBase.sendChat = function() {
	console.log( "Sending chat data." );
	
	// This tells the server what you said so that others may read it.
	var chatInput = $("#chat_input :input[name='chat']");
	var newText = chatInput.val();
	chatInput.val("");
	
	// Don't send empty messages
	if (newText !== null && newText !== "") {
		chatBase.socket.emit('sendChat', { text: newText });
	}
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
	chatBase.socket.removeListener('hatUpdate', chatBase.onHatUpdate);
	chatBase.socket.removeListener('userUpdate', chatBase.onUserUpdate);
	chatBase.socket.removeListener('receivedAnswer', chatBase.onReceivedAnswer);
	chatBase.socket.removeListener('newQuestion', chatBase.onNewQuestion);
	chatBase.socket.removeListener('answerFound', chatBase.onAnswerFound);
	chatBase.socket.removeListener('chatUpdate', chatBase.onReceivedChatUpdate);
	chatBase.socket.removeListener('connect_failed', chatBase.handleError);
	chatBase.socket.removeListener('disconnect', chatBase.handleError);
	chatBase.socket.removeListener('error', chatBase.handleError);
	
	chatBase.socket.disconnect();
	delete chatBase.socket;
	chatBase.socket = null;
	$("#welcome").css("display", "block");
	$("#chatroom").css("display", "none");
	
	// Make sure to wipe chat if we got an error.
	$("#chat_window").val("");
	$("#correct_user").val("");
	
	var nameField = $("#name_input :input[name='username']");
	nameField.prop("disabled", false);
	
	$("#message_text").html("Connection error. Please reload or try again.");
};

window.onload = function() {
	// Show the welcome screen by default
	$("#welcome").css("display", "block");
};