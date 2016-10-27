#!/usr/bin/env node
/*
 * Copyright 2016 Joyent, Inc.
 */

var http = require('http');
var Watershed = require('../../lib/watershed').Watershed;


var shed = new Watershed();



var srv = http.createServer();
srv.listen(9554);
srv.on('upgrade', function (req, socket, head) {
	var wsc;
	try {
		wsc = shed.accept(req, socket, head);
	} catch (ex) {
		console.error('error: ' + ex.message);
		socket.end();
		return;
	}
	wsc.on('text', function (text) {
		console.log('received text: ' + text);
	});
	wsc.on('end', function (code, reason) {
		console.log('end! (%s: %s)', code, reason);
	});
	wsc.send('hi from the server');
});
