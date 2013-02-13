# node-watershed

A simple implementation of WebSockets for use with node.js 'http'-style web
server or client.  Deals only with [RFC6455][1], ignoring any Browser-specific
peculiarities, curiosities, and fallback mechanisms.

## API

### Watershed

The core of this library is a Factory-style class `Watershed`.  It has several
static methods:

#### Watershed.accept(http.ServerRequest, net.Socket, Buffer)

Responds to a client's request to Upgrade an HTTP connection to a WebSocket and
returns a `WatershedConnection`, which is also an `EventEmitter`.

The arguments to this method should ideally come from the `'upgrade'` event on
a node.js `http.Server`.  For example:

```javascript
var shed = new Watershed();
var srv = http.createServer();
srv.listen(8080);
srv.on('upgrade', function(req, socket, head) {
        var wsc;
        try {
                wsc = shed.accept(req, socket, head);
        } catch (ex) {
                console.error('error: ' + ex.message);
                return socket.end();
        }
        wsc.on('text', function(text) {
                console.log('received text: ' + text);
        });
        wsc.on('end', function() {
                console.log('end!');
        });
        /* ... etc ... */
});
```

#### Watershed.generateKey()

Returns a random, Base64-encoded 16-byte value suitable for use as the
`Sec-WebSocket-Key header on an Upgrade request.  See Example usage in
`connect()`.

#### Watershed.connect(http.ClientResponse, net.Socket, Buffer, String)

Attaches a new client-side `WatershedConnection` to this presently Upgraded
socket.

The arguments to this method should ideally come from the `'upgrade'` event on
a node.js `http.Client`.  For example:

```javascript
var shed = new Watershed();
var wskey = ws.generateKey();
var options = {
    port: 8082,
    hostname: '127.0.0.1',
    headers: {
        'connection': 'upgrade',
        'upgrade': 'websocket',
        'Sec-WebSocket-Key': wskey
    }
};
var req = http.request(options);
req.end();
req.on('upgrade', function(res, socket, head) {
        var wsc = shed.connect(res, socket, head, wskey);
        wsc.send('Hi there!');
        wsc.on('end', function() {
                console.log('end!');
        });
        /* ... etc ... */
});
```

### WatershedConnection

#### Event: 'error'

Emitted once when an error occurs during processing.  The socket will be closed
and an `'end'` event will follow.  The only argument will be an instance of
`Error`.

#### Event: 'end'

Emitted once when the socket is closing.

#### Event: 'text'

Emitted for each inbound TEXT frame.  The only argument will be a `String`
containing the UTF-8 string payload.

#### Event: 'binary'

Emitted for each inbound BINARY frame.  The only argument will be a `Buffer`
containing the binary payload.

#### Event: 'ping'

Emitted for each inbound PING frame.  The only argument will be a `Buffer`
containing the nonce in the ping request.  Note that the library presently
responds with a PONG frame for each inbound PING frame.

#### Event: 'pong'

Emitted for each inbound PONG frame.  The only argument will be a `Buffer`
containing the nonce in the pong response.

#### WatershedConnection.send(data)

Sends a frame through the socket.  The single argument `data` may be a
`Buffer`, in which case a BINARY frame is sent; or a `String`, in which case a
TEXT frame is sent.

#### WatershedConnection.end(reason)

Closes the connection.  The RFC allows a reason for closing the connection to
be send in the CLOSE frame, though this is optional.

## License

MIT.

[1]: http://tools.ietf.org/html/rfc6455
