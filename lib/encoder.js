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

var lib_dtrace = require('./dtrace');
var lib_common = require('./common');

var PROBES = lib_dtrace._watershed_probes;

var ENCODERS = {
	'BINARY': wse_encode_binary,
	'TEXT': wse_encode_text,
	'PING': wse_encode_pingpong,
	'PONG': wse_encode_pingpong,
	'CLOSE': wse_encode_close
};

function
wse_make_shape_error(obj, req)
{
	return (new Error('frame type "' + obj.type + '" requires ' + req));
}

function
wse_encode_binary(self, obj, done)
{
	if (!Buffer.isBuffer(obj.payload)) {
		var err = wse_make_shape_error(obj, 'buffer payload');
		err.code = 'EINVAL';
		done(err);
		return;
	}

	PROBES['send-binary'].fire(function () {
		return ([
			self.wse_id,
			self.wse_remote,
			self.wse_local,
			obj.payload.toString('binary'),
			obj.payload.length
		]);
	});

	done(null, obj.payload);
}

function
wse_encode_text(self, obj, done)
{
	if (typeof (obj.payload) !== 'string') {
		var err = wse_make_shape_error(obj, 'string payload');
		err.code = 'EINVAL';
		done(err);
		return;
	}

	PROBES['send-text'].fire(function () {
		return ([
			self.wse_id,
			self.wse_remote,
			self.wse_local,
			obj.payload,
			obj.payload.length
		]);
	});

	done(null, new Buffer(obj.payload, 'utf8'));
}

function
wse_encode_pingpong(self, obj, done)
{
	if (!Buffer.isBuffer(obj.payload) && obj.payload !== null &&
	    obj.payload !== undefined) {
		var err = wse_make_shape_error(obj, 'buffer payload or no ' +
		    'payload');
		err.code = 'EINVAL';
		done(err);
		return;
	}

	done(null, obj.payload || null);
}

function
wse_encode_close(self, obj, done)
{
	var closecode = null;
	var reason = null;

	var fail = function (msg) {
		var err = new Error(msg);
		err.code = 'EINVAL';
		err.input = obj;
		done(err);
	};

	if (obj.reason !== undefined && obj.reason !== null) {
		if (typeof (obj.reason) !== 'string') {
			fail('"reason" must be a string');
			return;
		}

		reason = obj.reason;
	}

	if (obj.code !== undefined && obj.code !== null) {
		if (typeof (obj.code) !== 'number' || isNaN(obj.code) ||
		    obj.code < 0 || obj.code > 65535) {
			fail('code must be a number between 0 and 65535');
			return;
		}

		closecode = obj.code;

	} else if (obj.codename !== undefined && obj.codename !== null) {
		if (typeof (obj.codename) !== 'string') {
			fail('"codename" must be a string');
			return;
		}

		var cn = obj.codename;

		if (lib_common.CLOSECODE.hasOwnProperty(cn)) {
			closecode = lib_common.CLOSECODE[cn];
		} else if (cn === 'NONE') {
			closecode = null;
		} else {
			fail('invalid close code name "' + obj.codename + '"');
			return;
		}
	}

	var buf = null;
	if (reason === null) {
		if (closecode === null) {
			/*
			 * Close frame with empty payload.
			 */
			done(null, null);
			return;
		}

		/*
		 * Close frame with integer close code and no reason
		 * string.
		 */
		buf = new Buffer(2);
		buf.writeUInt16BE(closecode, 0);

	} else {
		if (closecode === null) {
			fail('close frame with "reason" requires a close code');
			return;
		}

		/*
		 * Close frame with integer close code and reason
		 * string.
		 */
		buf = new Buffer(2 + Buffer.byteLength(reason));
		buf.writeUInt16BE(closecode, 0);
		buf.write(reason, 2);
	}
	done(null, buf);
}

function
WatershedEncoder(options)
{
	var self = this;

	mod_assert.object(options, 'options');
	mod_assert.number(options.id, 'options.id');
	mod_assert.string(options.remote, 'options.remote');
	mod_assert.string(options.local, 'options.local');
	mod_assert.bool(options.send_mask, 'options.send_mask');
	mod_assert.optionalObject(options.override_mask,
	    'options.override_mask');

	mod_stream.Transform.call(self, {
		highWaterMark: 0,
		objectMode: true
	});

	self.wse_id = options.id;
	self.wse_remote = options.remote;
	self.wse_local = options.local;
	self.wse_mask_data = options.send_mask;

	self.wse_override_mask = null;
	if (options.override_mask) {
		mod_assert.ok(Buffer.isBuffer(options.override_mask));
		mod_assert.strictEqual(options.override_mask.length, 4);

		self.wse_override_mask = options.override_mask;
	}
}
mod_util.inherits(WatershedEncoder, mod_stream.Transform);

WatershedEncoder.prototype._transform = function
_transform(chunk, encoding, done)
{
	mod_assert.object(chunk, 'chunk');
	mod_assert.string(chunk.type, 'chunk.type');

	var self = this;
	var err;

	var type = chunk.type.toUpperCase();
	var encfunc = ENCODERS[type];

	if (!encfunc) {
		err = new Error('unsupported frame type "' + chunk.type + '"');
		err.code = 'EINVAL';
		done(err);
		return;
	}

	encfunc(self, chunk, function (err, buf) {
		if (err) {
			err.input = chunk;
			done(err);
			return;
		}

		err = self._write_frame(lib_common.OPCODE[type], buf);
		if (err) {
			err.input = chunk;
			done(err);
			return;
		}

		done();
	});
};

WatershedEncoder.prototype._create_mask = function
_create_mask()
{
	var self = this;

	if (self.wse_override_mask !== null) {
		return (self.wse_override_mask);
	}

	var buf = new Buffer(4);
	for (var i = 0; i < buf.length; i++) {
		buf[i] = Math.floor(Math.random() * 256);
	}

	return (buf);
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
	mod_assert.ok(data === null || Buffer.isBuffer(data), 'data');

	/*
	 * According to the RFC, the client MUST mask their outgoing frames.
	 */
	if (self.wse_mask_data) {
		maskbuf = self._create_mask();
		if (data !== null) {
			for (i = 0; i < data.length; i++) {
				data[i] = data[i] ^ maskbuf[i % maskbuf.length];
			}
		}
	}

	/*
	 * Construct the type of payload length we need:
	 */
	if (data === null) {
		hdr = new Buffer(2);
		len0 = 0;
	} else if (data.length <= 125) {
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
	self.push(hdr);
	if (maskbuf !== null) {
		self.push(maskbuf);
	}
	if (data !== null) {
		self.push(data);
	}

	return (null);
};


module.exports = {
	WatershedEncoder: WatershedEncoder
};

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
