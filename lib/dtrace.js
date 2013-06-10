/*
 * Watershed:
 *   An implementation of RFC6455 (The WebSocket Protocol)
 *
 * DTrace Support
 *
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 */

var ID = 0;
var MAX_INT = Math.pow(2, 32) - 1;

var PROVIDER;

var PROBES = {
	/*
	 * id, remoteAddress:port, localAddress:port, payload, len
	 */
	'recv-text': ['int', 'char *', 'char *', 'char *', 'int'],
	'recv-binary': ['int', 'char *', 'char *', 'char *', 'int'],
	'recv-close': ['int', 'char *', 'char *', 'char *', 'int'],
	'send-text': ['int', 'char *', 'char *', 'char *', 'int'],
	'send-binary': ['int', 'char *', 'char *', 'char *', 'int'],
	'send-close': ['int', 'char *', 'char *', 'char *', 'int'],
	'read-buffer': ['int', 'char *', 'char *', 'char *', 'int'],

	/*
	 * id, remoteAddress:port, localAddress:port, type
	 */
	'start': ['int', 'char *', 'char *', 'char *'],

	/*
	 * id, remoteAddress:port, localAddress:port, code, reason
	 */
	'end': ['int', 'char *', 'char *', 'char *', 'char *']
};

function
exportStaticProvider()
{
	if (PROVIDER)
		return (PROVIDER);

	try {
		var mod_dtrace = require('dtrace-provider');
		PROVIDER = mod_dtrace.createDTraceProvider('watershed');
	} catch (e) {
		PROVIDER = {
			fire: function () {},
			enable: function () {},
			addProbe: function () {
				var p = {
					fire: function () {}
				};
				return (p);
			},
			removeProbe: function () {},
			disable: function () {}
		};
	}

	PROVIDER._watershed_probes = {};

	Object.keys(PROBES).forEach(function (probename) {
		var args = PROBES[probename].splice(0);
		args.unshift(probename);

		var probe = PROVIDER.addProbe.apply(PROVIDER, args);
		PROVIDER._watershed_probes[probename] = probe;
	});

	PROVIDER.enable();

	PROVIDER.nextId = function nextId() {
		if (++ID >= MAX_INT)
			ID = 1;

		return (ID);
	};

	return (PROVIDER);
}

module.exports = exportStaticProvider();

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
