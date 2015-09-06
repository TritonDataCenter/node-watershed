#!/usr/bin/env node

var mod_assert = require('assert-plus');

var lib_decoder = require('../../lib/decoder');


var TEST_STRING_0 = 'a short test string';
var TEST_BUFFER_0 = new Buffer([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 127,
    128, 255]);

var TEST_BUFFER_126 = new Buffer(126);
var TEST_BUFFER_127 = new Buffer(127);

var TEST_ID = 0;
var TESTS = [
	{
		name: 'empty',
		masked: true,
		bytes: [],
		fail: false,
		output: []
	},
	{
		name: 'basic, unexpected mask',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 1),
		    create_byte1(true, Buffer.byteLength(TEST_STRING_0)),
		    create_mask('abcd'),
		    create_text_payload(TEST_STRING_0, create_mask('abcd'))
		),
		fail: 'SERVER_MASKED_IN_ERROR',
		output: []
	},
	{
		name: 'basic, missing mask',
		masked: true,
		bytes: [].concat(
		    create_byte0(true, 1),
		    create_byte1(false, Buffer.byteLength(TEST_STRING_0)),
		    create_text_payload(TEST_STRING_0)
		),
		fail: 'CLIENT_DID_NOT_MASK',
		output: []
	},
	{
		name: 'basic, masked',
		masked: true,
		bytes: [].concat(
		    create_byte0(true, 1),
		    create_byte1(true, Buffer.byteLength(TEST_STRING_0)),
		    create_mask('abcd'),
		    create_text_payload(TEST_STRING_0, create_mask('abcd'))
		),
		fail: false,
		output: [
			{
				type: 'text',
				payload: TEST_STRING_0
			}
		]
	},
	{
		name: 'basic, unmasked',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 1),
		    create_byte1(false, Buffer.byteLength(TEST_STRING_0)),
		    create_text_payload(TEST_STRING_0)
		),
		fail: false,
		output: [
			{
				type: 'text',
				payload: TEST_STRING_0
			}
		]
	},
	{
		name: 'no multipart message support',
		masked: false,
		bytes: [].concat(
		    create_byte0(false, 1),
		    create_byte1(false, 0)
		),
		fail: 'MULTI_PART_NOT_IMPLEMENTED',
		output: []
	},
	{
		name: 'no continuation frame support',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 0),
		    create_byte1(false, 0)
		),
		fail: 'CONTINUATION_FRAMES_NOT_IMPLEMENTED',
		output: []
	},
	{
		name: 'binary frame, unmasked',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 2),
		    create_byte1(false, TEST_BUFFER_0.length),
		    create_buffer_payload(TEST_BUFFER_0)
		),
		fail: false,
		output: [
			{
				type: 'binary',
				payload: TEST_BUFFER_0
			}
		]
	},
	{
		name: 'binary frame, masked',
		masked: true,
		bytes: [].concat(
		    create_byte0(true, 2),
		    create_byte1(true, TEST_BUFFER_0.length),
		    create_mask('jmc0'),
		    create_buffer_payload(TEST_BUFFER_0, create_mask('jmc0'))
		),
		fail: false,
		output: [
			{
				type: 'binary',
				payload: TEST_BUFFER_0
			}
		]
	},
	create_unknown_frame_test(3, false),
	create_unknown_frame_test(4, false),
	create_unknown_frame_test(5, false),
	create_unknown_frame_test(6, false),
	create_unknown_frame_test(7, false),
	{
		name: 'close frame, empty',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 8),
		    create_byte1(false, 0)
		),
		fail: false,
		output: [
			{
				type: 'close',
				code: -1,
				codename: 'NONE',
				reason: null
			}
		]
	},
	{
		name: 'close frame, invalid (1 byte status)',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 8),
		    create_byte1(false, 1),
		    [ 0xff ]
		),
		fail: 'RECEIVED_INVALID_CLOSE_FRAME',
		output: []
	},
	{
		name: 'close frame, with unknown status code, masked',
		masked: true,
		bytes: [].concat(
		    create_byte0(true, 8),
		    create_byte1(true, 2),
		    create_mask('yytt'),
		    create_buffer_payload(new Buffer([ 0x84, 0x41 ]),
		        create_mask('yytt'))
		),
		fail: false,
		output: [
			{
				type: 'close',
				code: 33857,
				codename: 'UNKNOWN',
				reason: null
			}
		]
	},
	create_close_frame_test(0, 'INVALID'),
	create_close_frame_test(999, 'INVALID'),
	create_close_frame_test(1000, 'NORMAL'),
	create_close_frame_test(1001, 'GOING_AWAY'),
	create_close_frame_test(1002, 'PROTOCOL_ERROR'),
	create_close_frame_test(1003, 'UNACCEPTABLE'),
	create_close_frame_test(1004, 'RESERVED'),
	create_close_frame_test(1005, 'INVALID'),
	create_close_frame_test(1006, 'INVALID'),
	create_close_frame_test(1007, 'MALFORMED'),
	create_close_frame_test(1008, 'POLICY_VIOLATION'),
	create_close_frame_test(1009, 'TOO_BIG'),
	create_close_frame_test(1010, 'MISSING_EXTENSION'),
	create_close_frame_test(1011, 'UNEXPECTED_ERROR'),
	create_close_frame_test(1012, 'RESERVED'),
	create_close_frame_test(2999, 'RESERVED'),
	create_close_frame_test(3000, 'FRAMEWORK'),
	create_close_frame_test(3999, 'FRAMEWORK'),
	create_close_frame_test(4000, 'PRIVATE'),
	create_close_frame_test(4999, 'PRIVATE'),
	create_close_frame_test(5000, 'UNKNOWN'),
	{
		name: 'ping frame, empty',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 9),
		    create_byte1(false, 0)
		),
		fail: false,
		output: [
			{
				type: 'ping',
				payload: new Buffer(0)
			}
		]
	},
	{
		name: 'ping frame, with payload',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 9),
		    create_byte1(false, 4),
		    [ 0x81, 0xff, 0xff, 0x00 ]
		),
		fail: false,
		output: [
			{
				type: 'ping',
				payload: new Buffer([ 0x81, 0xff, 0xff, 0x00 ])
			}
		]
	},
	{
		name: 'pong frame, empty',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 10),
		    create_byte1(false, 0)
		),
		fail: false,
		output: [
			{
				type: 'pong',
				payload: new Buffer(0)
			}
		]
	},
	create_unknown_frame_test(11, true),
	create_unknown_frame_test(12, true),
	create_unknown_frame_test(13, true),
	create_unknown_frame_test(14, true),
	create_unknown_frame_test(15, true),
	{
		name: 'two valid and one short frame',
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 1),
		    create_byte1(false, 5),
		    create_text_payload('xyzzy'),

		    create_byte0(true, 9),
		    create_byte1(false, 0),

		    create_byte0(true, 1)
		),
		fail: 'CONNECTION_RESET_PARTIAL_FRAME',
		output: [
			{
				type: 'text',
				payload: 'xyzzy'
			},
			{
				type: 'ping',
				payload: new Buffer(0)
			}
		]
	}
];

function
create_unknown_frame_test(opcode, control)
{
	return ({
		name: 'reserved ' + (control ? '' : 'non-') + 'control ' +
		    opcode,
		masked: false,
		bytes: [].concat(
		    create_byte0(true, opcode),
		    create_byte1(false, 5),
		    create_text_payload('xyzzy')
		),
		fail: 'RECEIVED_UNKNOWN_FRAME_OPCODE',
		output: []
	});
}

function
create_close_frame_test(closecode, name)
{
	var buf = new Buffer(2);

	buf.writeInt16BE(closecode, 0);

	return ({
		name: 'close frame, with status code ' + closecode,
		masked: false,
		bytes: [].concat(
		    create_byte0(true, 8),
		    create_byte1(false, buf.length),
		    create_buffer_payload(buf)
		),
		fail: false,
		output: [
			{
				type: 'close',
				code: closecode,
				codename: name,
				reason: null
			}
		]
	});
}

function
bytes_to_string(a)
{
	mod_assert.arrayOfNumber(a);

	var out = a.map(function (n) {
		return (Number(n).toString(16));
	}).map(function (ns) {
		return (ns.length === 1 ? '0' + ns : ns);
	}).join(' ');

	return (out);
}

function
create_byte0(fin, opcode)
{
	var b = 0;

	if (fin) {
		b |= 0x80;
	}

	b |= (opcode & 0xf);

	return (b);
}

function
create_byte1(mask, len0)
{
	var b = 0;

	if (mask) {
		b |= 0x80;
	}

	b |= (len0 & 0x7f);

	return (b);
}

function
create_mask(str)
{
	mod_assert.string(str, 'str');
	mod_assert.strictEqual(str.length, 4, 'str len 4');

	return (create_text_payload(str));
}

function
create_text_payload(str, mask)
{
	mod_assert.string(str, 'str');
	mod_assert.optionalArrayOfNumber(mask, 'mask');

	var out = [];

	for (var i = 0; i < str.length; i++) {
		var b = str.charCodeAt(i);
		if (mask) {
			b = (b ^ mask[i % 4]) & 0xff;
		}
		out.push(b);
	}

	return (out);
}

function
create_buffer_payload(buf, mask)
{
	mod_assert.ok(Buffer.isBuffer(buf), 'buf');
	mod_assert.optionalArrayOfNumber(mask, 'mask');

	var out = [];

	for (var i = 0; i < buf.length; i++) {
		var b = buf[i] & 0xff;
		if (mask) {
			b = (b ^ mask[i % 4]) & 0xff;
		}
		out.push(b);
	}

	return (out);
}


function
run_a_test()
{
	if (TEST_ID >= TESTS.length) {
		console.log();
		console.log('Tests Complete');
		return;
	}

	var t = TESTS[TEST_ID];
	var bytes = t.bytes;
	var expect = t.output;
	var actual = [];

	if (TEST_ID > 0) {
		console.log();
	}
	console.log('RUNNING TEST "%s"', t.name);

	var completed = false;
	var complete = function (err) {
		mod_assert.strictEqual(completed, false, 'callback twice');
		completed = true;

		if (err) {
			mod_assert.strictEqual(err.code, t.fail,
			    'TEST[' + t.name + ']: unexpected error');
		} else {
			mod_assert.strictEqual(t.fail, false,
			    'TEST[' + t.name + ']: expected error, but ' +
			    'none occurred');
		}

		mod_assert.deepEqual(actual, expect, 'TEST[' + t.name +
		    ']: unexpected output');

		/*
		 * Run the next test.
		 */
		TEST_ID++;
		setImmediate(run_a_test);
	};

	var wd = new lib_decoder.WatershedDecoder({
		id: TEST_ID,
		remote: '1.1.1.1:1000',
		local: '2.2.2.2:2000',
		receive_mask: t.masked
	});

	wd.on('readable', function () {
		var obj;
		while ((obj = wd.read()) !== null) {
			actual.push(obj);
			console.log('TEST[%s]: output: %j', t.name, obj);
		}
	});
	wd.on('end', function () {
		console.log('TEST[%s]: end', t.name);

		complete();
	});
	wd.on('error', function (err) {
		console.log('TEST[%s]: error: %s', t.name, err.toString());

		complete(err);
	});

	var send_bytes = function () {
		if (bytes.length === 0) {
			wd.end();
			return;
		}

		var b = bytes.shift();
		wd.write(new Buffer([b]));
		setTimeout(send_bytes, 5);
	};

	send_bytes();
}

run_a_test();

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
