#!/usr/bin/env node

var http = require('http');
var Watershed = require('../../lib/watershed').Watershed;


var shed = new Watershed();



var srv = http.createServer();
srv.listen(9554);
srv.on('upgrade', function(req, socket, head) {
	var wsc;
	try {
		wsc = shed.accept(req, socket, head);
	} catch (ex) {
		console.error('error: ' + ex.message);
		return socket.end();
	}
	wsc.on('readable', function () {
		console.log('readable');
		for (;;) {
			var o = wsc.read();
			if (!o) {
				return;
			}
			console.log('recv: %j', o);
		}
	});
	wsc.on('end', function(code, reason) {
		console.log('end! (%s: %s)', code, reason);
	});
	wsc.send('hi from the server');
	wsc.send('');
	wsc.send('and again!');

	wsc.on('error', function (err) {
		console.error('ERROR: %s', err.stack);
		if (err.side) {
			console.error('SIDE: %s', err.side);
		}
		if (err.code) {
			console.error('CODE: %s', err.code);
		}
		if (err.partial_frame) {
			console.error('PARTIAL: %s', err.partial_frame.inspect());
		}
	});
});

/* vim: set ts=8 sts=8 sw=8 tw=80 noet: */
