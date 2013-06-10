/*
 * Watershed:
 *   An implementation of RFC6455 (The WebSocket Protocol)
 *
 * DTrace Support
 *
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 */

var PROVIDER;

var PROBES = {
	/*
	 * remoteAddress:port, localAddress:port, payload, len
	 */
	'recv-text': ['char *', 'char *', 'char *', 'int'],
	'recv-binary': ['char *', 'char *', 'char *', 'int'],
	'recv-close': ['char *', 'char *', 'char *', 'int'],
	'send-text': ['char *', 'char *', 'char *', 'int'],
	'send-binary': ['char *', 'char *', 'char *', 'int'],
	'send-close': ['char *', 'char *', 'char *', 'int'],
	'read-buffer': ['char *', 'char *', 'char *', 'int'],

	/*
	 * remoteAddress:port, localAddress:port, type
	 */
	'start': ['char *', 'char *', 'char *'],

	/*
	 * remoteAddress:port, localAddress:port, code, reason
	 */
	'end': ['char *', 'char *', 'char *', 'char *']
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

	return (PROVIDER);
}

module.exports = exportStaticProvider();

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
