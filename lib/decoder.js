/*
 * Watershed:
 *   An implementation of RFC6455 (The WebSocket Protocol)
 *
 * Protocol Decoder Transform Stream
 *
 * Copyright 2015 Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_util = require('util');
var mod_stream = require('stream');
var dtrace = require('./dtrace');

var lib_common = require('./common');

var OPCODE = lib_common.OPCODE;

function
WatershedDecoder(options)
{
	var self = this;

	mod_assert.object(options, 'options');
	mod_assert.number(options.id, 'options.id');
	mod_assert.string(options.remote, 'options.remote');
	mod_assert.string(options.local, 'options.local');
	mod_assert.bool(options.receive_mask, 'options.receive_mask');

	mod_stream.Transform.call(self, {
		highWaterMark: 0,
		readableObjectMode: true,
		writableObjectMode: false
	});

	self.wsd_data = null;
	self.wsd_id = options.id;
	self.wsd_remote = options.remote;
	self.wsd_local = options.local;
	self.wsd_require_mask = options.receive_mask;
	self.wsd_abend = false;
}
mod_util.inherits(WatershedDecoder, mod_stream.Transform);

WatershedDecoder.prototype._ingest = function
_ingest(buf)
{
	var self = this;

	mod_assert.ok(Buffer.isBuffer(buf), 'buf');

	dtrace._watershed_probes['read-buffer'].fire(function () {
		return ([
			self.wsd_id,
			self.wsd_remote,
			self.wsd_local,
			buf.toString('binary'),
			buf.length
		]);
	});

	if (self.wsd_data === null) {
		self.wsd_data = buf;
		return;
	}

	self.wsd_data = Buffer.concat([
		self.wsd_data,
		buf
	], self.wsd_data.length + buf.length);
};

WatershedDecoder.prototype._transform = function
_transform(chunk, encoding, done)
{
	var self = this;

	if (self.wsd_abend) {
		return;
	}

	if (chunk !== null) {
		self._ingest(chunk);
	}

	for (;;) {
		var res = self._process_frame();

		if (res === false) {
			/*
			 * A complete frame has not been received.  Wait
			 * for more data.
			 */
			done();
			return;
		}

		mod_assert.object(res, 'res');
		if (res instanceof Error) {
			/*
			 * There was a processing error.
			 */
			self.wsd_abend = true;
			done(res);
			return;
		}

		/*
		 * A frame was successfully read from the stream.  Pass it
		 * on, and continue reading.
		 */
		self.push(res);
	}
};

WatershedDecoder.prototype._flush = function
_flush(done)
{
	var self = this;
	var err;

	if (self.wsd_abend) {
		return;
	}

	if (self.wsd_data === null) {
		done();
		return;
	}

	/*
	 * There was data left in the inbound buffer when the stream ended; the
	 * connection must have been interrupted.
	 */
	err = new Error('Connection reset after partial frame received');
	err.code = 'CONNECTION_RESET_PARTIAL_FRAME';
	err.partial_frame = self.wsd_data;
	done(err);
};

WatershedDecoder.prototype._process_frame = function
_process_frame()
{
	var self = this;
	var err;
	var pos = 0;
	var x = -1;
	var xb = null;
	var i;

	var havex = function (sz) {
		if (self.wsd_data === null) {
			return (false);
		}

		return (pos + sz <= self.wsd_data.length);
	};

	var readx = function (sz) {
		if (!havex(sz)) {
			return (false);
		}

		switch (sz) {
		case 1:
			x = self.wsd_data.readUInt8(pos);
			break;
		case 2:
			x = self.wsd_data.readUInt16BE(pos);
			break;
		case 4:
			x = self.wsd_data.readUInt32BE(pos);
			break;
		default:
			throw (new Error('invalid size ' + sz));
		}

		pos += sz;
		return (true);
	};

	var bufx = function (sz) {
		if (!havex(sz)) {
			return (false);
		}

		xb = self.wsd_data.slice(pos, pos + sz);

		pos += sz;
		return (true);
	};

	var discardx = function () {
		if (!havex(1)) {
			/*
			 * There are no additional bytes beyond those which
			 * have been processed already.  Throw the entire
			 * buffer away.
			 */
			self.wsd_data = null;
		} else {
			/*
			 * Slice off the bytes that have been processed already.
			 */
			self.wsd_data = self.wsd_data.slice(pos);
		}
	};

	/*
	 * Read the common (first) two bytes of the header:
	 */
	if (!readx(2)) {
		return (false);
	}

	/*
	 * Break the header bytes out into fields:
	 */
	var wdh = {
		wdh_fin: !!(x & (1 << 15)),
		wdh_opcode: (x & 0x0f00) >> 8,
		wdh_mask: !!(x & (1 << 7)),
		wdh_len0: (x & 0x007f),
		wdh_len: -1,
		wdh_maskbytes: [],
		wdh_payload: null
	};

	if (self.wsd_require_mask && !wdh.wdh_mask) {
		/*
		 * According to the RFC, the client MUST mask their frames.
		 */
		err = new Error('Client did not Mask according to the RFC');
		err.code = 'CLIENT_DID_NOT_MASK';
		return (err);
	} else if (!self.wsd_require_mask && wdh.wdh_mask) {
		/*
		 * The RFC also says that servers MUST NOT mask their frames.
		 */
		err = new Error('Server masked, in conflict with the RFC');
		err.code = 'SERVER_MASKED_IN_ERROR';
		return (err);
	}

	if (!wdh.wdh_fin) {
		/*
		 * XXX We should handle multi-part messages, but currently we
		 * do not.
		 */
		err = new Error('Multi-part messages are not implemented');
		err.code = 'MULTI_PART_NOT_IMPLEMENTED';
		return (err);
	}

	/*
	 * The payload length field in the frame header is 7 bits, with possible
	 * values from 0-127.  Values of 126 and 127 have special meaning; the
	 * length is then encoded in a subsequent (optional) header field.
	 */
	mod_assert.ok(wdh.wdh_len0 >= 0, 'len0 >= 0');
	mod_assert.ok(wdh.wdh_len0 <= 127, 'len0 <= 127');
	if (wdh.wdh_len0 <= 125) {
		wdh.wdh_len = wdh.wdh_len0;
	} else if (wdh.wdh_len0 === 126) {
		/*
		 * The length is a 16-bit field.
		 */
		if (!readx(2)) {
			return (false);
		}
		wdh.wdh_len = x;
	} else {
		/*
		 * The length is 127, so the length is stored as a 64-bit
		 * quantity.  We cannot usefully make use of a 64-bit value
		 * here, so we ensure that the upper 32-bits of this big endian
		 * number are zero.
		 */
		if (!readx(4)) {
			return (false);
		}
		if (x !== 0) {
			err = new Error('Length field was larger than 32 bits');
			err.code = 'RECEIVED_FRAME_TOO_LONG';
			return (err);
		}

		/*
		 * Read the lower 32-bits of the length:
		 */
		if (!readx(4)) {
			return (false);
		}
		wdh.wdh_len = x;
	}

	/*
	 * Control frames MUST have a payload length of 125 bytes or less and
	 * MUST NOT be fragmented.  Note that all control frame opcodes have
	 * the most sigificant bit set; i.e., they are in the range [8,15].
	 */
	if ((wdh.wdh_opcode & 0x80) !== 0) {
		if (wdh.wdh_len > 125) {
			err = new Error('Control frames must have a payload ' +
			    'of less than 125 bytes');
			err.code = 'CONTROL_FRAME_TOO_LONG';
			return (err);
		}
		if (!wdh.wdh_fin) {
			err = new Error('Control frames must not be ' +
			    'fragmented');
			err.code = 'FRAGMENTED_CONTROL_FRAME';
			return (err);
		}
	}

	/*
	 * If the Mask bit is set in the header, the remote peer included the
	 * optional payload masking key.  The key is four bytes long.
	 */
	if (wdh.wdh_mask) {
		for (i = 0; i < 4; i++) {
			if (!readx(1)) {
				return (false);
			}
			wdh.wdh_maskbytes.push(x);
		}
	}

	/*
	 * The payload is sent immediately after the last optional header.
	 * Slice it out now, and remove the fully processed frame data from
	 * the inbound buffer.
	 */
	if (!bufx(wdh.wdh_len)) {
		return (false);
	}
	discardx();

	/*
	 * If the remote connection masked their payload, unmask it:
	 */
	if (wdh.wdh_mask) {
		for (i = 0; i < xb.length; i++) {
			xb[i] = xb[i] ^ wdh.wdh_maskbytes[i % 4];
		}
	}
	wdh.wdh_payload = xb;

	/*
	 * Create the object representing this frame:
	 */
	switch (wdh.wdh_opcode) {
	case OPCODE.CONT:
		/*
		 * We do not currently support multiple-frame messages.
		 */
		err = new Error('Continuation frames are not supported');
		err.code = 'CONTINUATION_FRAMES_NOT_IMPLEMENTED';
		return (err);

	case OPCODE.TEXT:
		return ({
			type: 'text',
			payload: wdh.wdh_payload.toString('utf8')
		});

	case OPCODE.BINARY:
		return ({
			type: 'binary',
			payload: wdh.wdh_payload
		});

	case OPCODE.PING:
		return ({
			type: 'ping',
			payload: wdh.wdh_payload
		});

	case OPCODE.PONG:
		return ({
			type: 'pong',
			payload: wdh.wdh_payload
		});

	case OPCODE.CLOSE:
		if (wdh.wdh_payload.length === 0) {
			/*
			 * The RFC allows CLOSE frames that do not contain
			 * a code or reason.
			 */
			return ({
				type: 'close',
				code: -1,
				codename: 'NONE',
				reason: null
			});
		} else if (wdh.wdh_payload.length === 1) {
			/*
			 * If a body is present, it MUST begin with a 16-bit
			 * unsigned integer close code.
			 */
			err = new Error('Invalid close frame (length 1)');
			err.code = 'RECEIVED_INVALID_CLOSE_FRAME';
			return (err);
		}

		/*
		 * Bytes after the 16-bit close code are an optional UTF-8 close
		 * reason string.
		 */
		var code = wdh.wdh_payload.readUInt16BE(0);
		return ({
			type: 'close',
			code: code,
			codename: lib_common.find_close_code(code) || 'UNKNOWN',
			reason: wdh.wdh_payload.toString('utf8', 2) || null
		});
	}

	/*
	 * The RFC states that peers MUST fail the connection if an unknown
	 * opcode is received.
	 */
	err = new Error('Unknown frame opcode: ' + wdh.wdh_opcode);
	err.code = 'RECEIVED_UNKNOWN_FRAME_OPCODE';
	err.opcode = wdh.wdh_opcode;
	return (err);
};

module.exports = {
	WatershedDecoder: WatershedDecoder
};

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
