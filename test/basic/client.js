#!/usr/bin/env node

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
console.log('req end');
req.end();
req.on('upgrade', function(res, socket, head) {
        console.log('req upgrade');
        socket.setNoDelay(true);
        var wsc = shed.connect(res, socket, head, wskey);
        wsc.on('readable', function () {
		for (;;) {
			var o = wsc.read();
			if (!o)
				return;
			if (o.type === 'text') {
				console.log('recv text: "%s"', o.payload);
				wsc.end();
			} else {
				console.log('recv: %j', o);
			}
		}
        });
        wsc.on('end', function(code, reason) {
                console.log('end! (%s: %s)', code, reason ? reason : '<null>');
        });
        wsc.send('Hi there!');
});

