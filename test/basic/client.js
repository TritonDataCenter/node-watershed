#!/usr/bin/env node
/*
 * Copyright 2016 Joyent, Inc.
 */

var http = require('http');
var Watershed = require('../../lib/watershed').Watershed;

var shed = new Watershed();
var wskey = shed.generateKey();
var options = {
	port: 9554,
	hostname: '127.0.0.1',
	headers: {
		'connection': 'upgrade',
		'upgrade': 'websocket',
		'Sec-WebSocket-Key': wskey
	}
};
var req = http.request(options);
req.end();
req.on('upgrade', function (res, socket, head) {
	socket.setNoDelay(true);
	var wsc = shed.connect(res, socket, head, wskey);
	wsc.on('text', function (text) {
		console.log('received text: %s', text);
		wsc.end('thank you and good night');
	});
	wsc.on('end', function (code, reason) {
		console.log('end! (%s: %s)', code, reason ? reason : '<null>');
	});
	wsc.send('Hi there!');
});
