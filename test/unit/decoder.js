#!/usr/bin/env node

var lib_decoder = require('../../lib/decoder');


var WD = new lib_decoder.WatershedDecoder({
	id: 1,
	remote: '1.1.1.1:1000',
	local: '2.2.2.2:2000',
	receive_mask: false
});

WD.on('readable', function () {
	for (;;) {
		var b = WD.read();
		if (!b)
			return;
		console.log('%j', b);
	}
});

WD.write(new Buffer(
	[ 0x81, 0x89, 0x00, 0x00, 0x00, 0x00, 0x48, 0x69, 0x20, 0x74, 0x68, 0x65, 0x72, 0x65, 0x21 ]
));

/* vim: set sts=8 ts=8 sw=8 tw=80 noet: */
