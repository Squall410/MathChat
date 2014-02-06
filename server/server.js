var app = require('http').createServer(handler);	// The http server
var io = require('socket.io').listen(app);			// The socket.io reference
var path = require('path');							// Helps with file paths
var fs = require('fs');								// The filesystem reference

app.listen(8335);

function handler (req, res) {
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
}

io.sockets.on('connection', function (socket) {
	socket.on('newuser', function (data) {
		console.log('newuser');
		console.log(data);
		socket.emit('welcome', { value: data.name });
	});
});