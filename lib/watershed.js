/*
 * Watershed:
 *   An implementation of RFC6455 (The WebSocket Protocol)
 *
 * Copyright 2015 Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_events = require('events');
var mod_util = require('util');
var mod_stream = require('stream');
var dtrace = require('./dtrace');

var lib_common = require('./common');
var lib_decoder = require('./decoder');
var lib_encoder = require('./encoder');

var CRLF = '\r\n';

/*
 * We will refuse to run on Node versions prior to 0.10.26, due to (amongst
 * other things) various pathological Streams bugs.
 */
lib_common.assert_minimum_version(0, 10, 26);

function
_generateResponse(wskey)
{
	mod_assert.string(wskey, 'wskey');

	return ([
		'HTTP/1.1 101 The Watershed Moment',
		'Upgrade: websocket',
		'Connection: Upgrade',
		'Sec-WebSocket-Accept: ' + lib_common.sha1(wskey +
		    lib_common.MAGIC_WEBSOCKET_UUID)
	].join(CRLF) + CRLF + CRLF);
}

function
Watershed()
{
}

/*
 * Public:  Watershed.generateKey()
 *
 * Returns a random, Base64-encoded 16-byte value suitable for use as the
 * Sec-WebSocket-Key header on an Upgrade request.
 */
Watershed.prototype.generateKey = function
generateKey()
{
	var nonce = new Buffer(lib_common.NONCE_LENGTH);

	for (var i = 0; i < nonce.length; i++) {
		nonce[i] = Math.floor(Math.random() * 256);
	}

	return (nonce.toString('base64'));
};

/*
 * Public:  Watershed.accept(http.ServerRequest, net.Socket, Buffer)
 *
 * Responds to a client's request to Upgrade to WebSockets and returns a
 * WatershedConnection/EventEmitter.  The EventEmitter emits the following
 * events:
 *
 *    'error':  there was an error while handling the connection.
 *    'end':    the WebSocket connection has ended.
 *
 *    'text':   a TEXT frame arrived; (parameter will be a String.)
 *    'binary': a BINARY frame arrived; (parameter will be a Buffer.)
 *    'ping':   a PING frame arrived; (parameter will be a nonce Buffer.)
 *    'pong':   a PONG frame arrived; (parameter will be a nonce Buffer.)
 */
Watershed.prototype.accept = function
accept(req, socket, head, detached)
{
	mod_assert.object(req, 'req');
	mod_assert.object(socket, 'socket');
	mod_assert.optionalObject(head, 'head');
	mod_assert.optionalBool(detached, 'detached');

	var remote = socket.remoteAddress + ':' + socket.remotePort;
	var local = socket.localAddress + ':' + socket.localPort;

	/*
	 * Return any potential parse overrun back to the
	 * front of the stream:
	 */
	if (head && head.length > 0)
		socket.unshift(head);

	/*
	 * Check for the requisite headers in the Upgrade request:
	 */
	var upgrade = req.headers['upgrade'];
	if (!upgrade || upgrade.toLowerCase() !== 'websocket')
		throw (new Error('Missing Upgrade Header'));
	var wskey = req.headers['sec-websocket-key'];
	if (!wskey)
		throw (new Error('Missing Sec-WebSocket-Key Header'));
	var wsver = req.headers['sec-websocket-version'];
	if (wsver && wsver !== '13')
		throw (new Error('Unsupported Sec-WebSocket-Version'));

	/*
	 * Write the response that lets the client know we've accepted the
	 * Upgrade to WebSockets:
	 */
	socket.write(_generateResponse(wskey));

	if (detached === true) {
		/*
		 * The user just wants the Socket.
		 */
		return (socket);
	}

	var options = {
		remoteMustMask: true,
		localShouldMask: false,
		type: 'accept',
		remote: remote,
		local: local
	};
	return (new WatershedConnection(options, socket));
};

/*
 * Public:  Watershed.connect(http.ClientResponse, net.Socket, Buffer, String)
 *
 * Attaches a new client-side WatershedConnection to this presently Upgraded
 * socket.  Emits the same events as the object returned by accept().
 */
Watershed.prototype.connect = function
connect(res, socket, head, wskey, detached)
{
	var remote = socket.remoteAddress + ':' + socket.remotePort;
	var local = socket.localAddress + ':' + socket.localPort;

	/*
	 * Return any potential parse overrun back to the
	 * front of the stream:
	 */
	if (head && head.length > 0)
		socket.unshift(head);

	/*
	 * Check for the requisite headers in the Upgrade response:
	 */
	var connection = res.headers['connection'];
	if (!connection || connection.toLowerCase() !== 'upgrade')
		throw (new Error('Missing Connection Header'));
	var upgrade = res.headers['upgrade'];
	if (!upgrade || upgrade.toLowerCase() !== 'websocket')
		throw (new Error('Missing Upgrade Header'));
	var wsaccept = res.headers['sec-websocket-accept'];
	if (!wsaccept || wsaccept !== lib_common.sha1(wskey +
	    lib_common.MAGIC_WEBSOCKET_UUID)) {
		throw (new Error('Missing Sec-WebSocket-Accept Header'));
	}
	var wsver = res.headers['sec-websocket-version'];
	if (wsver && wsver !== '13')
		throw (new Error('Unsupported Sec-WebSocket-Version'));

	if (detached === true) {
		/*
		 * The user just wants the Socket.
		 */
		return (socket);
	}

	var options = {
		remoteMustMask: false,
		localShouldMask: true,
		type: 'connect',
		remote: remote,
		local: local
	};
	return (new WatershedConnection(options, socket));
};

function
WatershedConnection(options, socket)
{
	var self = this;
	mod_events.EventEmitter.call(this);

	self._id = dtrace.nextId();

	self._data = new Buffer(0);
	self._stats = {
		receivedFrames: 0,
		sentFrames: 0
	};

	/*
	 * We only want to write at most _one_ CLOSE frame, or 'end' event.
	 */
	self._close_written = false;
	self._close_received = false;
	self._end_emitted = false;

	self._close_code = null;
	self._close_reason = null;

	self._options = options;
	self._socket = socket;
	self._remote = options.remote;
	self._local = options.local;

	/*
	 * DTrace start/end probes:
	 */
	dtrace._watershed_probes['start'].fire(function () {
		return ([
			self._id,
			self._remote,
			self._local,
			options.type
		]);
	});
	self.on('end', function(code, reason) {
		dtrace._watershed_probes['end'].fire(function () {
			return ([
				self._id,
				self._remote,
				self._local,
				self._close_code,
				self._close_reason
			]);
		});
	});

	var codec_opts = {
		id: self._id,
		remote: self._remote,
		local: self._local,
		receive_mask: options.remoteMustMask,
		send_mask: options.localShouldMask
	};

	self.wsc_decoder = new lib_decoder.WatershedDecoder(codec_opts);
	self.wsc_encoder = new lib_encoder.WatershedEncoder(codec_opts);

	self._write = function (chunk, encoding, done) {
		console.error('DUPLEX _write');
		self.wsc_encoder.write(chunk, done);
	};
	self.wsc_reading = false;
	self._read = function () {
		console.error('DUPLEX _read');
		self.wsc_reading = true;
		do_read();
	};

	var do_read = function () {
		while (self.wsc_reading) {
			console.error('READ...');
			var o = self.wsc_decoder.read();
			if (!o) {
				return;
			}

			console.log('%j', o);

			if (o.type === 'close') {
				self._close_received = true;
				self._close_code = o.code;
				self._close_reason = o.reason;
			}

			if (!self.push(o)) {
				self.wsc_reading = false;
			}
		}
	};

	self.wsc_decoder.on('readable', function () {
		console.error('DECODER readable');
		do_read();
	});
	self.wsc_decoder.on('end', function () {
		/*
		 * If we did not receive a CLOSE frame, then the connection was
		 * terminated prematurely.
		 */
		if (!self._close_received)
			self.emit('connectionReset');
		self.emit('end', self._close_code, self._close_reason);
		self.push(null);
	});

	self.wsc_encoder.on('error', function (err) {
		err.side = 'ENCODER';
		self.emit('error', err);
	});
	self.wsc_decoder.on('error', function (err) {
		err.side = 'DECODER';
		self.emit('error', err);
	});

	self._socket.pipe(self.wsc_decoder);
	self.wsc_encoder.pipe(self._socket);

	mod_stream.Duplex.call(self, {
		allowHalfOpen: true,
		highWaterMark: 0,
		objectMode: true
	});
}
mod_util.inherits(WatershedConnection, mod_stream.Duplex);

/*
 * Public: WatershedConnection.end(reason)
 *
 * Send a close frame to the remote end of the connection, with an optional
 * reason string.
 */
WatershedConnection.prototype.end = function
end(reason)
{
	if (this._close_written)
		return;
	this._close_written = true;

	this.wsc_encoder.write({
		type: 'close',
		codename: 'NORMAL',
		reason: 'Closing Time!'
	});
};

/*
 * Public: WatershedConnection.destroy()
 *
 * Immediately destroy the underlying socket, without sending a CLOSE
 * frame.
 */
WatershedConnection.prototype.destroy = function
destroy()
{
	if (this._socket !== null) {
		this._socket.removeAllListeners();
		this._socket.destroy();
		this._socket = null;
	}
	if (!this._end_emitted) {
		this.emit('end', this._close_code, this._close_reason);
		this._end_emitted = true;
	}
};

/*
 * Public: WatershedConnection.send(string)
 *           ^-- send a TEXT frame with this UTF-8 string
 *         WatershedConnction.send(Buffer)
 *           ^-- send a BINARY frame with this Buffer
 */
WatershedConnection.prototype.send = function
send(data)
{
	switch (typeof (data)) {
	case 'string':
		this.wsc_encoder.write({
			type: 'text',
			payload: data
		});
		break;

	case 'object':
		if (Buffer.isBuffer(data)) {
			this.wsc_encoder.write({
				type: 'binary',
				payload: data
			});
		}
		throw (new Error('send() requires a string or a Buffer'));

	default:
		throw (new Error('send() requires a string or a Buffer'));
	}
};


module.exports = {
	Watershed: Watershed
};

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
