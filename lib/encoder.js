/*
 * Watershed:
 *   An implementation of RFC6455 (The WebSocket Protocol)
 *
 * Protocol Encoder Transform Stream
 *
 * Copyright 2015 Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_util = require('util');
var mod_stream = require('stream');
var dtrace = require('./dtrace');

var lib_common = require('./common');

function
WatershedEncoder(options)
{
	var self = this;

	mod_assert.object(options, 'options');
	mod_assert.number(options.id, 'options.id');
	mod_assert.string(options.remote, 'options.remote');
	mod_assert.string(options.local, 'options.local');
	mod_assert.bool(options.send_mask, 'options.send_mask');

	mod_stream.Transform.call(self, {
		highWaterMark: 0,
		objectMode: true
	});

	self.wse_id = options.id;
	self.wse_remote = options.remote;
	self.wse_local = options.local;
	self.wse_mask_data = options.send_mask;
}
mod_util.inherits(WatershedEncoder, mod_stream.Transform);

WatershedEncoder.prototype._transform = function
_transform(chunk, encoding, done)
{
	mod_assert.object(chunk, 'chunk');

	var self = this;
	var err;
	var code;
	var buf;

	switch (chunk.type) {
	case 'binary':
		if (!Buffer.isBuffer(chunk.payload)) {
			err = new Error('frame type "binary" requires buffer ' +
			    'payload');
			err.code = 'EINVAL';
			break;
		}
		code = lib_common.OPCODE.BINARY;
		buf = chunk.payload;
		break;

	case 'text':
		if (typeof (chunk.payload) !== 'string') {
			err = new Error('frame type "text" requires string ' +
			    'payload');
			err.code = 'EINVAL';
			break;
		}
		code = lib_common.OPCODE.TEXT;
		buf = new Buffer(chunk.payload, 'utf8');
		break;

	case 'ping':
		if (!Buffer.isBuffer(chunk.payload) && chunk.payload !== null &&
		    chunk.payload !== undefined) {
			err = new Error('frame type "ping" requires buffer ' +
			    'payload, or no payload');
			err.code = 'EINVAL';
			break;
		}
		code = lib_common.OPCODE.PING;
		buf = chunk.payload || new Buffer(0);
		break;

	case 'pong':
		if (!Buffer.isBuffer(chunk.payload) && chunk.payload !== null &&
		    chunk.payload !== undefined) {
			err = new Error('frame type "pong" requires buffer ' +
			    'payload, or no payload');
			err.code = 'EINVAL';
			break;
		}
		code = lib_common.OPCODE.PONG;
		buf = chunk.payload || new Buffer(0);
		break;

	case 'close':
		code = lib_common.OPCODE.CLOSE;
		/*
		 * XXX
		 */
		buf = new Buffer(2);
		buf.writeUInt16BE(lib_common.CLOSECODE.NORMAL, 0);
		break;

	default:
		err = new Error('unsupported frame type "' + chunk.type + '"');
		err.code = 'EINVAL';
		break;
	}

	if (err) {
		done(err);
		return;
	}

	err = self._write_frame(code, buf);
	if (err) {
		done(err);
		return;
	}

	done();
};

WatershedEncoder.prototype._write_frame = function
_write_frame(code, data)
{
	var self = this;
	var maskbuf = null;
	var hdr;
	var err;
	var i;
	var len0;
	var fin = true;

	mod_assert.number(code, 'code');
	mod_assert.ok(Buffer.isBuffer(data), 'data');

	/*
	 * According to the RFC, the client MUST mask their outgoing frames.
	 */
	if (self.wse_mask_data) {
		maskbuf = new Buffer(4);
		for (i = 0; i < maskbuf.length; i++) {
			maskbuf[i] = Math.floor(Math.random() * 256);
		}
		for (i = 0; i < data.length; i++) {
			data[i] = data[i] ^ maskbuf[i % maskbuf.length];
		}
	}

	/*
	 * Construct the type of payload length we need:
	 */
	if (data.length <= 125) {
		hdr = new Buffer(2);
		len0 = data.length;
	} else if (data.length <= 0xffff) {
		hdr = new Buffer(2 + 2);
		len0 = 126;
		hdr.writeUInt16BE(data.length, 2);
	} else if (data.length <= 0xffffffff) {
		hdr = new Buffer(2 + 8);
		len0 = 127;
		hdr.writeUInt32BE(0, 2);
		hdr.writeUInt32BE(data.length, 6);
	} else {
		err = new Error('Frame payload must have length less ' +
		    'than 32-bits');
		err.code = 'EINVAL';
		return (err);
	}

	/*
	 * Construct the common (first) two bytes of the header:
	 */
	var w0 = fin ? (1 << 15) : 0;
	w0 |= (code << 8) & 0x0f00;
	w0 |= len0 & 0x007f;
	w0 |= maskbuf !== null ? (1 << 7) : 0;
	hdr.writeUInt16BE(w0, 0);

	/*
	 * Write the data:
	 */
	console.error('send: %s', hdr.inspect());
	self.push(hdr);
	if (maskbuf !== null) {
		console.error('send: %s', maskbuf.inspect());
		self.push(maskbuf);
	}
	console.error('send: %s', data.inspect());
	self.push(data);

	return (null);
};


module.exports = {
	WatershedEncoder: WatershedEncoder
};

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
