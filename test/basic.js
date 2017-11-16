/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var http = require('http');
var test = require('tape');

var Watershed = require('../lib/watershed').Watershed;
var shed = new Watershed();
var wskey = shed.generateKey();

var CLIENT;
var HTTP;
var SERVER;
var SERVER_ERR;

function failOnMessage(msg) {
	throw new Error('received unexpected message: ' + msg.toString());
}

function failOnEnd(code, reason) {
	throw new Error('connection unexpectedly ended: ' + code);
}


// --- Tests

test('setup server', function (t) {
	HTTP = http.createServer();
	HTTP.listen(9554);
	HTTP.on('upgrade', function (req, socket, head) {
		try {
			SERVER = shed.accept(req, socket, head, false,
			    ['test1', 'test2']);
		} catch (err) {
			socket.end('HTTP/1.1 400 Bad Request\r\n' +
			    'Connection: close\r\n\r\n');
			return;
		}
		SERVER.on('text', failOnMessage);
		SERVER.on('binary', failOnMessage);
		SERVER.on('end', failOnEnd);
	});
	t.end();
});

test('setup client', function (t) {
	var options = {
		port: 9554,
		hostname: '127.0.0.1',
		headers: {
			'connection': 'upgrade',
			'upgrade': 'websocket',
			'Sec-WebSocket-Key': wskey,
			'Sec-WebSocket-Version': 13
		}
	};
	var req = http.request(options);
	req.end();
	req.on('upgrade', function (res, socket, head) {
		socket.setNoDelay(true);
		CLIENT = shed.connect(res, socket, head, wskey);
		t.strictEqual(CLIENT.getProtocol(), null);
		t.strictEqual(SERVER.getProtocol(), null);
		CLIENT.on('text', failOnMessage);
		CLIENT.on('binary', failOnMessage);
		CLIENT.on('end', failOnEnd);
		t.end();
	});
});

test('server pings client', function (t) {
	var pingRecvd = false;

	CLIENT.once('ping', function () {
		pingRecvd = true;
	});

	SERVER.once('pong', function () {
		t.ok(pingRecvd, 'received ping');
		t.end();
	});

	SERVER._ws_writePing(new Buffer(0));
});

test('client pings server', function (t) {
	var pingRecvd = false;

	SERVER.once('ping', function () {
		pingRecvd = true;
	});

	CLIENT.once('pong', function () {
		t.ok(pingRecvd, 'received ping');
		t.end();
	});

	CLIENT._ws_writePing(new Buffer(0));
});


test('client sends TEXT', function (t) {
	SERVER.removeListener('text', failOnMessage);
	SERVER.once('text', function (txt) {
		SERVER.on('text', failOnMessage);
		t.equal(txt, 'hello', 'correct message');
		t.end();
	});

	CLIENT.send('hello');
});

test('server sends TEXT', function (t) {
	CLIENT.removeListener('text', failOnMessage);
	CLIENT.once('text', function (txt) {
		CLIENT.on('text', failOnMessage);
		t.equal(txt, 'hello', 'correct message');
		t.end();
	});

	SERVER.send('hello');
});

test('client sends BINARY', function (t) {
	SERVER.removeListener('binary', failOnMessage);
	SERVER.once('binary', function (binary) {
		SERVER.on('binary', failOnMessage);
		t.ok(binary instanceof Buffer, 'Buffer returned');
		t.equal(binary.toString('utf-8'), 'hello', 'correct message');
		t.end();
	});

	CLIENT.send(new Buffer('hello'));
});

test('server sends BINARY', function (t) {
	CLIENT.removeListener('binary', failOnMessage);
	CLIENT.once('binary', function (binary) {
		CLIENT.on('binary', failOnMessage);
		t.ok(binary instanceof Buffer, 'Buffer returned');
		t.equal(binary.toString('utf-8'), 'hello', 'correct message');
		t.end();
	});

	SERVER.send(new Buffer('hello'));
});

test('teardown connection', function (t) {
	CLIENT.removeListener('end', failOnEnd);
	SERVER.removeListener('end', failOnEnd);

	CLIENT.on('end', function (code, reason) {
		t.equal(code, 'NORMAL', 'normal close');
		t.equal(reason, 'test ended', 'server sent reason');
		t.end();
	});

	SERVER.end('test ended');

	CLIENT = null;
	SERVER = null;
});

test('negotiate supported subprotocol', function (t) {
	var options = {
		port: 9554,
		hostname: '127.0.0.1',
		headers: {
			'connection': 'upgrade',
			'upgrade': 'websocket',
			'Sec-WebSocket-Key': wskey,
			'Sec-WebSocket-Version': 13,
			'Sec-WebSocket-Protocol': 'foobar, test1, test2'
		}
	};
	var req = http.request(options);
	req.end();
	req.on('upgrade', function (res, socket, head) {
		socket.setNoDelay(true);
		var client = shed.connect(res, socket, head, wskey);
		t.strictEqual(client.getProtocol(), 'test1');
		t.strictEqual(SERVER.getProtocol(), 'test1');

		SERVER.removeListener('end', failOnEnd);
		SERVER.once('end', function () {
			t.end();
		});
		client.end('done');
	});
});

test('negotiation failure', function (t) {
	var options = {
		port: 9554,
		hostname: '127.0.0.1',
		headers: {
			'connection': 'upgrade',
			'upgrade': 'websocket',
			'Sec-WebSocket-Key': wskey,
			'Sec-WebSocket-Version': 13,
			'Sec-WebSocket-Protocol': 'foobar, aaaa'
		}
	};
	var req = http.request(options);
	req.end();
	req.on('upgrade', function (res, socket, head) {
		t.fail();
	});
	req.on('response', function (res) {
		t.equal(res.statusCode, 400);
		t.end();
	});
});

test('teardown server', function (t) {
	HTTP.close();
	t.end();
});
