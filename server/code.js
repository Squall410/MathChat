var chatBase = {};

chatBase.stuff = function () {
	console.log("do things!");
	$("#welcome").css("display", "none");
	$("#chatroom").css("display", "block");
	
	// Get the name the user entered
	var username = $("#name_input :input[name='username']").val();
	console.dir(username);
	var socket = io.connect('http://localhost:8335');
	socket.emit('newuser', { name: username });
	socket.on('welcome', function (data) {
		console.log(data);
		$("#display_name").html(data.value);
	});
};

window.onload = function() {
	// Show the welcome screen by default
	$("#welcome").css("display", "block");
};