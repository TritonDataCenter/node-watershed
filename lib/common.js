/*
 * Watershed:
 *   An implementation of RFC6455 (The WebSocket Protocol)
 *
 * Common Constants and Utilities
 *
 * Copyright 2015 Joyent, Inc.
 */

var mod_crypto = require('crypto');
var mod_assert = require('assert-plus');

/*
 * Symbolic Constants from the RFC:
 */
var MAGIC_WEBSOCKET_UUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var NONCE_LENGTH = 16;
var OPCODE = {
	CONT: 0x0,
	TEXT: 0x1,
	BINARY: 0x2,
	CLOSE: 0x8,
	PING: 0x9,
	PONG: 0xA
};
var CLOSECODE = {
	NORMAL: 1000,
	GOING_AWAY: 1001,
	PROTOCOL_ERROR: 1002,
	UNACCEPTABLE: 1003,
	MALFORMED: 1007,
	POLICY_VIOLATION: 1008,
	TOO_BIG: 1009,
	MISSING_EXTENSION: 1010,
	UNEXPECTED_ERROR: 1011
};

function
sha1(str)
{
	mod_assert.string(str, 'str');

	var hash = mod_crypto.createHash('sha1');
	hash.update(str);

	return (hash.digest('base64'));
}

function
find_close_code(code)
{
	mod_assert.number(code, 'code');

	var keys = Object.keys(CLOSECODE);
	for (var i = 0;	i < keys.length; i++) {
		var key = keys[i];

		if (CLOSECODE[key] === code) {
			return (key);
		}
	}

	return (null);
}

function
assert_minimum_version(maj, min, pat)
{
	if (!process || !process.versions || !process.versions.node) {
		throw (new Error('could not determine Node version'));
	}

	var v = process.versions.node.split('.').map(Number);
	mod_assert.strictEqual(v.length, 3);
	if (v[0] > maj) {
		return;
	} else if (v[0] === maj) {
		if (v[1] > min) {
			return;
		} else if (v[1] === min) {
			if (v[2] >= pat) {
				return;
			}
		}
	}

	throw (new Error('watershed requires node ' + maj + '.' + min + '.' +
	    pat + ' or later.'));
}

module.exports = {
	OPCODE: OPCODE,
	CLOSECODE: CLOSECODE,
	NONCE_LENGTH: NONCE_LENGTH,
	MAGIC_WEBSOCKET_UUID: MAGIC_WEBSOCKET_UUID,
	sha1: sha1,
	find_close_code: find_close_code,
	assert_minimum_version: assert_minimum_version
};

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
