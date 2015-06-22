#!/usr/bin/env node

var lib_encoder = require('../../lib/encoder');


var WE = new lib_encoder.WatershedEncoder({
	id: 1,
	remote: '1.1.1.1:1000',
	local: '2.2.2.2:2000'
});

WE.on('readable', function () {
	for (;;) {
		var b = WE.read();
		if (!b)
			return;
		console.log(b.inspect());
	}
});

WE.write({
	type: 'text',
	payload: 'TESTING'
});

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
